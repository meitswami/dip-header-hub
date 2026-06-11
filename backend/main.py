import re
import uuid
from typing import Any, Dict, List, Optional
from collections import defaultdict

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import (
  Case,
  ChatLog,
  Alias,
  PersonProfile,
  CdrRecord,
  NumberIntelligence,
  EvidenceLog,
  TowerDumpRecord,
  KbDocument,
  KbChunk,
  MysqlConnection,
)
from .services.intelligence import rebuild_case_intelligence
from .services import ai_service
from .services.upload import process_upload
from .services import retrieval as retrieval_svc
from .services.ingest import ingest_document
from .services import embeddings as emb_svc
from .services import dictionary as dict_svc
from .services import mysql_service

try:
  Base.metadata.create_all(bind=engine)
except Exception:
  # In portable mode the user can run migrations separately; do not crash.
  pass

app = FastAPI(title="DIP Backend", version="1.0.0")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


class ChatMessage(BaseModel):
  role: str
  content: str


class ChatRequest(BaseModel):
  caseId: str
  messages: List[ChatMessage]
  styleLevel: Optional[str] = "simple"
  # New, optional: "fast" (default) or "accurate"
  tier: Optional[str] = "fast"
  # New, optional: restrict retrieval to specific uploaded KB docs
  document_ids: Optional[List[str]] = None


class ChatResponse(BaseModel):
  content: str
  citations: Optional[List[Dict[str, Any]]] = None


class CaseSummaryResponse(BaseModel):
  id: str
  title: str
  summary: str


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, db: Session = Depends(get_db)) -> Any:
  """Grounded chat: structured (SQL/precomputed) + semantic (RAG over docs)."""
  case_id = payload.caseId
  messages = [m.model_dump() for m in payload.messages]
  last_user = ""
  for m in reversed(messages):
    if m.get("role") == "user":
      last_user = m.get("content") or ""
      break

  ctx = retrieval_svc.build_context(
    db,
    case_id=case_id,
    question=last_user,
    document_ids=payload.document_ids,
    include_global=True,
  )

  try:
    content = await ai_service.call_ollama_rag(
      model=ai_service.resolve_model(payload.tier),
      messages=messages,
      context_block=ctx.get("context_block", ""),
      style_level=payload.styleLevel or "simple",
      case_id=case_id,
    )
  except Exception:
    # Fallback: if the LLM is unavailable but we have a structured fact, return it.
    fact = ctx.get("structured_fact")
    if fact:
      content = fact
    else:
      raise HTTPException(status_code=503, detail="AI service unavailable. Try again.")

  # Persist chat log
  db.add_all([
    ChatLog(id=_uuid(), case_id=case_id, user_id=None, role="user", content=last_user),
    ChatLog(id=_uuid(), case_id=case_id, user_id=None, role="assistant", content=content),
  ])
  db.commit()

  return ChatResponse(content=content, citations=ctx.get("citations", []))


@app.post("/chat/stream")
async def chat_stream_endpoint(payload: ChatRequest, db: Session = Depends(get_db)):
  """Server-Sent Events: yields citation metadata first, then token deltas."""
  case_id = payload.caseId
  messages = [m.model_dump() for m in payload.messages]
  last_user = ""
  for m in reversed(messages):
    if m.get("role") == "user":
      last_user = m.get("content") or ""
      break

  ctx = retrieval_svc.build_context(
    db,
    case_id=case_id,
    question=last_user,
    document_ids=payload.document_ids,
    include_global=True,
  )

  import json as _json

  async def event_generator():
    # 1) Send the citations pack up-front so the UI can render source chips immediately.
    meta = {
      "type": "meta",
      "citations": ctx.get("citations", []),
      "structured_fact": ctx.get("structured_fact"),
      "entities_in_question": ctx.get("entities_in_question", {}),
    }
    yield f"data: {_json.dumps(meta)}\n\n"

    full_text = ""
    try:
      async for delta in ai_service.stream_ollama_rag(
        model=ai_service.resolve_model(payload.tier),
        messages=messages,
        context_block=ctx.get("context_block", ""),
        style_level=payload.styleLevel or "simple",
        case_id=case_id,
      ):
        full_text += delta
        yield f"data: {_json.dumps({'type': 'delta', 'content': delta})}\n\n"
    except Exception as e:
      fallback = ctx.get("structured_fact") or f"AI service unavailable ({e})."
      full_text = fallback
      yield f"data: {_json.dumps({'type': 'delta', 'content': fallback})}\n\n"

    # Persist once at the end
    db.add_all([
      ChatLog(id=_uuid(), case_id=case_id, user_id=None, role="user", content=last_user),
      ChatLog(id=_uuid(), case_id=case_id, user_id=None, role="assistant", content=full_text),
    ])
    db.commit()

    yield f"data: {_json.dumps({'type': 'done'})}\n\n"

  return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/upload")
async def upload_endpoint(
  case_id: str = Form(...),
  data_type: str = Form(...),
  file: UploadFile = File(...),
  period_from: Optional[str] = Form(None),
  period_to: Optional[str] = Form(None),
  notes: Optional[str] = Form(None),
  phone_number: Optional[str] = Form(None),
  alias_name: Optional[str] = Form(None),
  uploaded_by: Optional[str] = Form(None),
  db: Session = Depends(get_db),
):
  if not case_id:
    raise HTTPException(status_code=400, detail="case_id is required")
  content = await file.read()
  if not content:
    raise HTTPException(status_code=400, detail="Empty file")
  result = process_upload(
    db, case_id, data_type, content, file.filename or "upload",
    uploaded_by=uploaded_by, phone_number=phone_number,
    period_from=period_from, period_to=period_to, notes=notes, alias_name=alias_name,
  )
  if result.get("error"):
    raise HTTPException(status_code=400, detail=result["error"])
  return {"status": "ok", "inserted": result["inserted"], "evidence_log_id": result.get("evidence_log_id")}


@app.get("/cases")
def list_cases(db: Session = Depends(get_db)) -> Any:
  rows = db.query(Case).order_by(Case.created_at.desc()).all()
  return [
    {
      "id": c.id,
      "title": c.title,
      "fir_number": c.fir_number,
      "sections": c.sections,
      "status": c.status,
      "case_date": c.case_date.isoformat() if c.case_date else None,
      "created_at": c.created_at.isoformat() if c.created_at else None,
    }
    for c in rows
  ]


@app.get("/cases/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db)) -> Any:
  case = db.query(Case).filter(Case.id == case_id).first()
  if not case:
    raise HTTPException(status_code=404, detail="Case not found")
  return {
    "id": case.id,
    "title": case.title,
    "fir_number": case.fir_number,
    "sections": case.sections,
    "status": case.status,
    "complainant": case.complainant,
    "accused": case.accused,
    "description": case.description,
    "case_date": case.case_date.isoformat() if case.case_date else None,
    "created_at": case.created_at.isoformat() if case.created_at else None,
  }


@app.get("/cases/{case_id}/stats")
def case_stats(case_id: str, db: Session = Depends(get_db)) -> Any:
  from sqlalchemy import func
  cdr = db.query(func.count(EvidenceLog.id)).filter(EvidenceLog.case_id == case_id, EvidenceLog.upload_type == "cdr").scalar() or 0
  ipdr = db.query(func.count(EvidenceLog.id)).filter(EvidenceLog.case_id == case_id, EvidenceLog.upload_type == "ipdr").scalar() or 0
  tower = db.query(func.count(EvidenceLog.id)).filter(EvidenceLog.case_id == case_id, EvidenceLog.upload_type == "tower_dump").scalar() or 0
  sdr = db.query(func.count(EvidenceLog.id)).filter(EvidenceLog.case_id == case_id, EvidenceLog.upload_type == "sdr").scalar() or 0
  return {"cdr_count": cdr, "ipdr_count": ipdr, "tower_count": tower, "sdr_count": sdr}


@app.get("/cases/{case_id}/common_numbers")
def case_common_numbers(
  case_id: str,
  min_files: int = Query(2, ge=2),
  db: Session = Depends(get_db),
) -> Any:
  """
  Cross-file common numbers for a case.
  Looks at EvidenceLog (cdr/tower_dump) + CdrRecord/TowerDumpRecord.file_id to compute:
    - numbers appearing in at least `min_files` distinct uploads
    - how many files per number
    - total calls/rows per number
  """
  files = (
    db.query(EvidenceLog)
    .filter(
      EvidenceLog.case_id == case_id,
      EvidenceLog.upload_type.in_(["cdr", "tower_dump"]),
    )
    .all()
  )
  if not files:
    return {"total_files": 0, "results": []}

  file_ids = [f.id for f in files]
  file_name_by_id = {f.id: f.file_name for f in files}

  number_files: Dict[str, set] = defaultdict(set)
  number_calls: Dict[str, int] = defaultdict(int)

  # CDR side (calling + called)
  cdr_rows = (
    db.query(CdrRecord.calling_number, CdrRecord.called_number, CdrRecord.file_id)
    .filter(CdrRecord.case_id == case_id, CdrRecord.file_id.in_(file_ids))
    .all()
  )
  for calling, called, fid in cdr_rows:
    if not fid:
      continue
    for num in (calling, called):
      if not num:
        continue
      number_files[num].add(fid)
      number_calls[num] += 1

  # Tower dump side (mobile_number)
  tower_rows = (
    db.query(TowerDumpRecord.mobile_number, TowerDumpRecord.file_id)
    .filter(TowerDumpRecord.case_id == case_id, TowerDumpRecord.file_id.in_(file_ids))
    .all()
  )
  for mobile, fid in tower_rows:
    if not mobile or not fid:
      continue
    number_files[mobile].add(fid)
    number_calls[mobile] += 1

  results = [
    {
      "number": n,
      "fileCount": len(fids),
      "fileNames": [file_name_by_id.get(fid, fid) for fid in fids],
      "totalCalls": number_calls.get(n, 0),
    }
    for n, fids in number_files.items()
    if len(fids) >= min_files
  ]

  results.sort(key=lambda r: (-r["fileCount"], -r["totalCalls"]))
  return {"total_files": len(files), "results": results}


@app.get("/cases/{case_id}/summary_stats")
def case_summary_stats(case_id: str, db: Session = Depends(get_db)) -> Any:
  from .models import CaseAnalysisSummary
  s = db.query(CaseAnalysisSummary).filter(CaseAnalysisSummary.case_id == case_id).first()
  if not s:
    return {}
  return {
    "total_cdr_records": s.total_cdr_records or 0,
    "total_unique_numbers": s.total_unique_numbers or 0,
    "total_calls": s.total_calls or 0,
    "night_call_percentage": s.night_call_percentage or 0,
    "total_ipdr_records": s.total_ipdr_records or 0,
    "total_tower_records": s.total_tower_records or 0,
  }


@app.get("/cases/{case_id}/summary", response_model=CaseSummaryResponse)
def case_summary(case_id: str, db: Session = Depends(get_db)) -> Any:
  case = db.query(Case).filter(Case.id == case_id).first()
  if not case:
    raise HTTPException(status_code=404, detail="Case not found")
  summary = ai_service.handle_case_summary(db, case_id)
  return CaseSummaryResponse(id=case.id, title=case.title, summary=summary)


class CreateCaseRequest(BaseModel):
  title: str
  fir_number: Optional[str] = None
  sections: Optional[str] = None
  status: Optional[str] = "open"
  complainant: Optional[str] = None
  accused: Optional[str] = None
  description: Optional[str] = None
  case_date: Optional[str] = None


@app.post("/cases")
def create_case(body: CreateCaseRequest, db: Session = Depends(get_db)) -> Any:
  case_id = str(uuid.uuid4())
  case_date = None
  if body.case_date:
    try:
      from datetime import datetime
      case_date = datetime.fromisoformat(body.case_date.replace("Z", "+00:00"))
    except Exception:
      pass
  case = Case(
    id=case_id,
    title=body.title,
    fir_number=body.fir_number,
    sections=body.sections,
    status=body.status or "open",
    complainant=body.complainant,
    accused=body.accused,
    description=body.description,
    case_date=case_date,
  )
  db.add(case)
  db.commit()
  return {"id": case.id, "title": case.title}


@app.get("/cases/{case_id}/aliases")
def list_aliases(case_id: str, db: Session = Depends(get_db)) -> Any:
  rows = db.query(Alias).filter(Alias.case_id == case_id).order_by(Alias.created_at.desc().nullslast()).all()
  return [{"id": r.id, "phone_number": r.phone_number, "alias_name": r.alias_name} for r in rows]


@app.delete("/aliases/{alias_id}")
def delete_alias(alias_id: str, db: Session = Depends(get_db)) -> Any:
  row = db.query(Alias).filter(Alias.id == alias_id).first()
  if not row:
    raise HTTPException(status_code=404, detail="Alias not found")
  db.delete(row)
  db.commit()
  return {"ok": True}


class CreateAliasRequest(BaseModel):
  case_id: str
  phone_number: str
  alias_name: str


@app.post("/aliases")
def create_or_update_alias(body: CreateAliasRequest, db: Session = Depends(get_db)) -> Any:
  existing = db.query(Alias).filter(Alias.case_id == body.case_id, Alias.phone_number == body.phone_number).first()
  if existing:
    existing.alias_name = body.alias_name
    db.commit()
    return {"id": existing.id}
  alias = Alias(id=str(uuid.uuid4()), case_id=body.case_id, phone_number=body.phone_number, alias_name=body.alias_name)
  db.add(alias)
  db.commit()
  return {"id": alias.id}


@app.get("/cases/{case_id}/person_profiles")
def list_person_profiles(case_id: str, db: Session = Depends(get_db)) -> Any:
  rows = db.query(PersonProfile).filter(PersonProfile.case_id == case_id).all()
  return [{"id": r.id, "name": r.name, "phone_numbers": r.phone_numbers or []} for r in rows]


class CreatePersonRequest(BaseModel):
  case_id: str
  name: str
  phone_numbers: Optional[List[str]] = None


@app.post("/person_profiles")
def create_person(body: CreatePersonRequest, db: Session = Depends(get_db)) -> Any:
  ids = body.phone_numbers or []
  profile = PersonProfile(
    id=str(uuid.uuid4()),
    case_id=body.case_id,
    name=body.name,
    phone_numbers=ids,
  )
  db.add(profile)
  db.commit()
  return {"id": profile.id, "name": profile.name, "phone_numbers": profile.phone_numbers}


class UpdatePersonPhonesRequest(BaseModel):
  phone_numbers: List[str]


@app.patch("/person_profiles/{profile_id}")
def update_person_phones(profile_id: str, body: UpdatePersonPhonesRequest, db: Session = Depends(get_db)) -> Any:
  profile = db.query(PersonProfile).filter(PersonProfile.id == profile_id).first()
  if not profile:
    raise HTTPException(status_code=404, detail="Person not found")
  profile.phone_numbers = body.phone_numbers
  db.commit()
  return {"id": profile.id}


@app.get("/cases/{case_id}/cdr")
def case_cdr_list(case_id: str, limit: int = 1000, db: Session = Depends(get_db)) -> Any:
  rows = (
    db.query(CdrRecord)
    .filter(CdrRecord.case_id == case_id)
    .order_by(CdrRecord.call_date.asc().nullslast())
    .limit(limit)
    .all()
  )
  return [
    {
      "calling_number": r.calling_number,
      "called_number": r.called_number,
      "call_date": r.call_date.isoformat() if r.call_date else None,
      "call_type": r.call_type,
      "duration": r.duration,
      "imei": r.imei,
      "cell_id": r.cell_id,
      "tower_location": r.tower_location,
      "tower_lat": r.tower_lat,
      "tower_lng": r.tower_lng,
    }
    for r in rows
  ]


@app.get("/cases/{case_id}/cdr_sample")
def cdr_sample(case_id: str, number: str, db: Session = Depends(get_db)) -> Any:
  rows = (
    db.query(CdrRecord)
    .filter(
      CdrRecord.case_id == case_id,
      (CdrRecord.calling_number == number) | (CdrRecord.called_number == number),
    )
    .order_by(CdrRecord.call_date.desc().nullslast())
    .limit(200)
    .all()
  )
  return [
    {
      "calling_number": r.calling_number,
      "called_number": r.called_number,
      "call_date": r.call_date.isoformat() if r.call_date else None,
      "call_type": r.call_type,
      "duration": r.duration,
      "file_id": r.file_id,
      "raw_data": r.raw_data,
    }
    for r in rows
  ]


@app.get("/cases/{case_id}/numbers")
def numbers_search(case_id: str, q: str, db: Session = Depends(get_db)) -> Any:
  if not q or len(q) < 1:
    return []
  rows = (
    db.query(NumberIntelligence.phone_number, NumberIntelligence.total_calls)
    .filter(NumberIntelligence.case_id == case_id, NumberIntelligence.phone_number.contains(q))
    .order_by(NumberIntelligence.total_calls.desc())
    .limit(20)
    .all()
  )
  return [{"number": r.phone_number, "count": r.total_calls or 0} for r in rows]


@app.get("/cases/{case_id}/chat_logs")
def get_chat_logs(case_id: str, limit: int = 100, db: Session = Depends(get_db)) -> Any:
  rows = (
    db.query(ChatLog)
    .filter(ChatLog.case_id == case_id)
    .order_by(ChatLog.created_at.asc())
    .limit(limit)
    .all()
  )
  return [{"content": r.content, "role": r.role, "created_at": (r.created_at.isoformat() if r.created_at else None)} for r in rows]


def _uuid() -> str:
  return str(uuid.uuid4())


# -----------------------------------------------------------------------------
# Knowledge Base (universal document ingestion + retrieval)
# -----------------------------------------------------------------------------


def _kb_doc_to_json(d: KbDocument) -> Dict[str, Any]:
  return {
    "id": d.id,
    "case_id": d.case_id,
    "file_name": d.file_name,
    "title": d.title,
    "category": d.category,
    "source_type": d.source_type,
    "status": d.status,
    "error_message": d.error_message,
    "chunk_count": d.chunk_count or 0,
    "language": d.language,
    "tags": d.tags or [],
    "file_size": d.file_size,
    "processing_started_at": d.processing_started_at.isoformat() if d.processing_started_at else None,
    "processing_completed_at": d.processing_completed_at.isoformat() if d.processing_completed_at else None,
    "created_at": d.created_at.isoformat() if d.created_at else None,
  }


@app.get("/kb/status")
def kb_status() -> Any:
  """Cheap health check for the KB subsystem (does NOT trigger model load)."""
  from .services import reranker as rerank_svc
  return {
    "embedding": emb_svc.model_status(),
    "reranker": rerank_svc.status(),
    "chat_model_fast": ai_service.OLLAMA_MODEL,
    "chat_model_accurate": ai_service.OLLAMA_MODEL_ACCURATE,
    "ollama_url": ai_service.OLLAMA_URL,
  }


@app.post("/kb/upload")
async def kb_upload(
  file: UploadFile = File(...),
  case_id: Optional[str] = Form(None),
  category: Optional[str] = Form(None),
  tags: Optional[str] = Form(None),  # comma-separated
  uploaded_by: Optional[str] = Form(None),
  title: Optional[str] = Form(None),
  db: Session = Depends(get_db),
):
  """Ingest a single document into the knowledge base.

  `case_id` may be omitted for a global document (legal references, SOPs, etc.).
  """
  content = await file.read()
  if not content:
    raise HTTPException(status_code=400, detail="Empty file")

  tag_list: Optional[List[str]] = None
  if tags:
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

  doc = ingest_document(
    db,
    case_id=case_id,
    file_name=file.filename or "upload",
    content=content,
    category=category,
    tags=tag_list,
    uploaded_by=uploaded_by,
    title=title,
  )
  return _kb_doc_to_json(doc)


@app.get("/kb/files")
def kb_files(
  case_id: Optional[str] = Query(None),
  include_global: bool = Query(True),
  db: Session = Depends(get_db),
) -> Any:
  q = db.query(KbDocument)
  if case_id is not None:
    if include_global:
      q = q.filter((KbDocument.case_id == case_id) | (KbDocument.case_id.is_(None)))
    else:
      q = q.filter(KbDocument.case_id == case_id)
  rows = q.order_by(KbDocument.created_at.desc()).all()
  return [_kb_doc_to_json(r) for r in rows]


@app.get("/kb/files/{doc_id}")
def kb_file(doc_id: str, db: Session = Depends(get_db)) -> Any:
  d = db.query(KbDocument).filter(KbDocument.id == doc_id).first()
  if not d:
    raise HTTPException(status_code=404, detail="Document not found")
  return _kb_doc_to_json(d)


@app.delete("/kb/files/{doc_id}")
def kb_delete(doc_id: str, db: Session = Depends(get_db)) -> Any:
  d = db.query(KbDocument).filter(KbDocument.id == doc_id).first()
  if not d:
    raise HTTPException(status_code=404, detail="Document not found")
  db.query(KbChunk).filter(KbChunk.document_id == doc_id).delete(synchronize_session=False)
  db.delete(d)
  db.commit()
  return {"ok": True}


class KbQueryRequest(BaseModel):
  question: str
  case_id: Optional[str] = None
  document_ids: Optional[List[str]] = None
  include_global: Optional[bool] = True
  tier: Optional[str] = "fast"
  style_level: Optional[str] = "simple"


@app.post("/kb/query")
async def kb_query(payload: KbQueryRequest, db: Session = Depends(get_db)) -> Any:
  """One-shot grounded Q&A over any mix of documents (case-scoped + global)."""
  ctx = retrieval_svc.build_context(
    db,
    case_id=payload.case_id,
    question=payload.question,
    document_ids=payload.document_ids,
    include_global=bool(payload.include_global),
  )
  try:
    content = await ai_service.call_ollama_rag(
      model=ai_service.resolve_model(payload.tier),
      messages=[{"role": "user", "content": payload.question}],
      context_block=ctx.get("context_block", ""),
      style_level=payload.style_level or "simple",
      case_id=payload.case_id,
    )
  except Exception as e:
    raise HTTPException(status_code=503, detail=f"AI service unavailable: {e}")
  return {"content": content, "citations": ctx.get("citations", [])}


@app.get("/explain")
def explain_term(
  term: str = Query(..., min_length=1),
  case_id: Optional[str] = Query(None),
  db: Session = Depends(get_db),
) -> Any:
  """Investigator-friendly explanation of a column / field / abbreviation.

  Pulls up to 3 sample values from the given case (if any) so officers can
  see what the field looks like in their own data.
  """
  return dict_svc.explain(db, term, case_id=case_id)


@app.post("/kb/search")
def kb_search(payload: KbQueryRequest, db: Session = Depends(get_db)) -> Any:
  """Return retrieval results only (no LLM generation). Handy for debugging."""
  ctx = retrieval_svc.build_context(
    db,
    case_id=payload.case_id,
    question=payload.question,
    document_ids=payload.document_ids,
    include_global=bool(payload.include_global),
  )
  return {
    "citations": ctx.get("citations", []),
    "structured_fact": ctx.get("structured_fact"),
    "entities_in_question": ctx.get("entities_in_question", {}),
    "context_block": ctx.get("context_block", ""),
  }


# -----------------------------------------------------------------------------
# Live MySQL connector (admin-configured external databases)
# -----------------------------------------------------------------------------


class MysqlConnectionBody(BaseModel):
  name: str
  host: str
  port: Optional[int] = 3306
  database: str
  username: str
  password: Optional[str] = None  # omitted on update to keep existing
  ssl_enabled: Optional[bool] = False
  notes: Optional[str] = None


@app.get("/mysql/connections")
def mysql_list(db: Session = Depends(get_db)) -> Any:
  rows = db.query(MysqlConnection).order_by(MysqlConnection.created_at.desc()).all()
  return [mysql_service.to_public_json(r) for r in rows]


@app.post("/mysql/connections")
def mysql_create(body: MysqlConnectionBody, db: Session = Depends(get_db)) -> Any:
  if not body.password:
    raise HTTPException(status_code=400, detail="password is required for new connections")
  conn = MysqlConnection(
    id=mysql_service.new_id(),
    name=body.name,
    host=body.host,
    port=int(body.port or 3306),
    database=body.database,
    username=body.username,
    password_encrypted=mysql_service.encrypt_password(body.password),
    ssl_enabled=bool(body.ssl_enabled),
    notes=body.notes,
  )
  db.add(conn)
  db.commit()
  return mysql_service.to_public_json(conn)


def _get_conn(db: Session, conn_id: str) -> MysqlConnection:
  row = db.query(MysqlConnection).filter(MysqlConnection.id == conn_id).first()
  if not row:
    raise HTTPException(status_code=404, detail="Connection not found")
  return row


@app.patch("/mysql/connections/{conn_id}")
def mysql_update(conn_id: str, body: MysqlConnectionBody, db: Session = Depends(get_db)) -> Any:
  conn = _get_conn(db, conn_id)
  conn.name = body.name
  conn.host = body.host
  conn.port = int(body.port or 3306)
  conn.database = body.database
  conn.username = body.username
  conn.ssl_enabled = bool(body.ssl_enabled)
  conn.notes = body.notes
  if body.password:
    conn.password_encrypted = mysql_service.encrypt_password(body.password)
  db.commit()
  return mysql_service.to_public_json(conn)


@app.delete("/mysql/connections/{conn_id}")
def mysql_delete(conn_id: str, db: Session = Depends(get_db)) -> Any:
  conn = _get_conn(db, conn_id)
  db.delete(conn)
  db.commit()
  return {"ok": True}


@app.post("/mysql/connections/{conn_id}/test")
def mysql_test(conn_id: str, db: Session = Depends(get_db)) -> Any:
  conn = _get_conn(db, conn_id)
  return mysql_service.test_connection(db, conn)


@app.get("/mysql/connections/{conn_id}/schema")
def mysql_schema(conn_id: str, db: Session = Depends(get_db)) -> Any:
  conn = _get_conn(db, conn_id)
  try:
    return mysql_service.list_schema(conn)
  except Exception as e:
    raise HTTPException(status_code=502, detail=str(e))


@app.get("/mysql/connections/{conn_id}/tables/{table}/sample")
def mysql_table_sample(conn_id: str, table: str, limit: int = 50, db: Session = Depends(get_db)) -> Any:
  conn = _get_conn(db, conn_id)
  try:
    return mysql_service.sample_table(conn, table, limit=limit)
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
    raise HTTPException(status_code=502, detail=str(e))


class MysqlQueryBody(BaseModel):
  sql: str
  max_rows: Optional[int] = 500


@app.post("/mysql/connections/{conn_id}/query")
def mysql_query(conn_id: str, body: MysqlQueryBody, db: Session = Depends(get_db)) -> Any:
  conn = _get_conn(db, conn_id)
  try:
    return mysql_service.run_query(conn, body.sql, max_rows=int(body.max_rows or 500))
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
    raise HTTPException(status_code=502, detail=str(e))

