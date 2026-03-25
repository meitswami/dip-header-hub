import re
import uuid
from typing import Any, Dict, List, Optional
from collections import defaultdict

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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
)
from .services.intelligence import rebuild_case_intelligence
from .services import ai_service
from .services.upload import process_upload

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


class ChatResponse(BaseModel):
  content: str


class CaseSummaryResponse(BaseModel):
  id: str
  title: str
  summary: str


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, db: Session = Depends(get_db)) -> Any:
  case_id = payload.caseId
  messages = [m.model_dump() for m in payload.messages]
  last_user = ""
  for m in reversed(messages):
    if m.get("role") == "user":
      last_user = m.get("content") or ""
      break
  query = last_user.lower()
  numbers = re.findall(r"\b\d{10}\b", last_user)

  intent, params = ai_service.detect_intent(query, numbers)

  if intent == "direct_interconnection":
    txt = ai_service.handle_direct_interconnection(db, case_id, params["a"], params["b"])
  elif intent == "common_contacts":
    txt = ai_service.handle_common_contacts(db, case_id, params["a"], params["b"])
  elif intent == "number_summary":
    txt = ai_service.handle_number_summary(db, case_id, params["n"])
  elif intent == "case_summary":
    txt = ai_service.handle_case_summary(db, case_id)
  elif intent == "top_contacts":
    txt = ai_service.handle_top_contacts_for_number(db, case_id, params["n"])
  elif intent == "most_active":
    txt = ai_service.handle_most_active_numbers(db, case_id)
  else:
    # LLM only for narrative / formatting; no new telecom computation
    try:
      txt = await ai_service.call_ollama_narrative(
        case_id=case_id,
        messages=messages,
        style_level=payload.styleLevel or "simple",
        db=db,
      )
    except Exception:
      raise HTTPException(status_code=500, detail="AI service unavailable. Try again.")

  # Persist simple chat log (no business logic change)
  log_user = ChatLog(
    id=_uuid(),
    case_id=case_id,
    user_id=None,
    role="user",
    content=last_user,
  )
  log_ai = ChatLog(
    id=_uuid(),
    case_id=case_id,
    user_id=None,
    role="assistant",
    content=txt,
  )
  db.add_all([log_user, log_ai])
  db.commit()

  return ChatResponse(content=txt)


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

