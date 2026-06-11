"""
Hybrid retrieval for investigation Q&A.

Combines three signals:
  1) Semantic similarity over document chunks (dense vectors)
  2) Entity-bridge lookup (exact substring match for phones/IMEIs/IPs
     extracted from the user's question)
  3) Case-level structured signals (counts, top numbers, contact graph)
     produced by the existing ai_service intent handlers — these do not
     need the LLM and are merged verbatim into the grounded context.

The output is a single "context pack" of passages with citations that the
chat endpoint feeds to the local LLM for final narration.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from . import ai_service
from . import embeddings as emb_svc
from . import vectorstore as vs
from . import reranker as rerank_svc
from .entity_extract import extract_entities


MAX_SEMANTIC = 8
MAX_ENTITY = 6
MAX_CHARS_PER_CITATION = 700
MAX_TOTAL_CHARS = 4500


def _truncate(text: str, limit: int = MAX_CHARS_PER_CITATION) -> str:
    if not text:
        return ""
    text = text.strip().replace("\r", " ")
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _locator(item: Dict[str, Any]) -> str:
    parts: List[str] = []
    if item.get("section"):
        parts.append(str(item["section"]))
    if item.get("page") is not None and not item.get("section"):
        parts.append(f"p.{item['page']}")
    if item.get("row_index") is not None:
        parts.append(f"row {item['row_index']}")
    return ", ".join(parts)


def _citation_for(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    return {
        "index": index,
        "document_id": item.get("document_id"),
        "chunk_id": item.get("id"),
        "file_name": item.get("file_name"),
        "title": item.get("doc_title"),
        "source_type": item.get("doc_source_type"),
        "locator": _locator(item),
        "score": round(float(item.get("score", 0.0)), 4),
        "preview": _truncate(item.get("text", ""), 240),
    }


def _merge_results(
    semantic: List[Dict[str, Any]],
    entity: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    """Dedupe by chunk id, preferring the higher score; cap to `limit`."""
    by_id: Dict[str, Dict[str, Any]] = {}
    for item in semantic + entity:
        cid = item.get("id")
        if not cid:
            continue
        current = by_id.get(cid)
        if current is None or item.get("score", 0) > current.get("score", 0):
            by_id[cid] = item
    merged = sorted(by_id.values(), key=lambda x: -float(x.get("score", 0)))
    return merged[:limit]


def _structured_hint(db: Session, case_id: str, question: str, numbers: List[str]) -> Optional[str]:
    """Run the existing structured intents; return their string output if any."""
    intent, params = ai_service.detect_intent(question.lower(), numbers)
    if intent == "direct_interconnection":
        return ai_service.handle_direct_interconnection(db, case_id, params["a"], params["b"])
    if intent == "common_contacts":
        return ai_service.handle_common_contacts(db, case_id, params["a"], params["b"])
    if intent == "number_summary":
        return ai_service.handle_number_summary(db, case_id, params["n"])
    if intent == "case_summary":
        return ai_service.handle_case_summary(db, case_id)
    if intent == "top_contacts":
        return ai_service.handle_top_contacts_for_number(db, case_id, params["n"])
    if intent == "most_active":
        return ai_service.handle_most_active_numbers(db, case_id)
    return None


def build_context(
    db: Session,
    *,
    case_id: Optional[str],
    question: str,
    document_ids: Optional[List[str]] = None,
    include_global: bool = True,
    use_reranker: Optional[bool] = None,
) -> Dict[str, Any]:
    """Produce a grounded context pack for the given question.

    Returns:
      {
        "structured_fact": "...optional one-liner from SQL/precomputed stats...",
        "passages": [ {index, text, file_name, locator, ...}, ... ],
        "citations": [ {index, file_name, locator, preview, ...}, ... ],
        "entities_in_question": { phone: [...], imei: [...], ... },
        "context_block": "<<<text the LLM sees>>>",
      }
    """
    question = question or ""
    ents = extract_entities(question)
    flat_terms: List[str] = []
    for k in ("phone", "imei", "ip", "email"):
        flat_terms.extend(ents.get(k, []) or [])

    # 1) Structured signal from existing handlers
    structured = None
    if case_id:
        numbers_in_q = re.findall(r"\b\d{10}\b", question)
        try:
            structured = _structured_hint(db, case_id, question, numbers_in_q)
        except Exception:
            structured = None

    # 2) Semantic retrieval
    semantic_hits: List[Dict[str, Any]] = []
    try:
        q_vec = emb_svc.embed_one(question)
        semantic_hits = vs.semantic_search(
            db,
            q_vec,
            case_id=case_id,
            document_ids=document_ids,
            include_global=include_global,
            top_k=MAX_SEMANTIC,
        )
    except RuntimeError:
        # Embedding model not available — continue with entity-only retrieval.
        semantic_hits = []

    # 3) Entity-bridge retrieval
    entity_hits = vs.entity_search(
        db,
        flat_terms,
        case_id=case_id,
        document_ids=document_ids,
        include_global=include_global,
        limit=MAX_ENTITY,
    )

    # Keep a wider pool before reranking so the cross-encoder has options.
    merged = _merge_results(semantic_hits, entity_hits, limit=(MAX_SEMANTIC + MAX_ENTITY) * 2)

    # Optional cross-encoder rescoring. Off by default (see reranker.is_enabled()).
    rerank_enabled = use_reranker if use_reranker is not None else rerank_svc.is_enabled()
    if rerank_enabled and question and merged:
        passages = [m.get("text", "") or "" for m in merged]
        scores = rerank_svc.rerank(question, passages)
        if scores:
            # Combine: 70% cross-encoder + 30% original hybrid score (keeps entity
            # hits strong when the cross-encoder is ambivalent).
            _min = min(scores)
            _max = max(scores)
            span = (_max - _min) or 1.0
            for m, s in zip(merged, scores):
                norm = (s - _min) / span
                m["score"] = 0.7 * norm + 0.3 * float(m.get("score", 0.0))
            merged.sort(key=lambda r: -float(r.get("score", 0)))

    merged = merged[: MAX_SEMANTIC + MAX_ENTITY // 2]

    citations: List[Dict[str, Any]] = []
    passage_lines: List[str] = []
    total_chars = 0
    for idx, item in enumerate(merged, start=1):
        text = _truncate(item.get("text", ""))
        if not text:
            continue
        locator = _locator(item)
        header = f"[{idx}] {item.get('file_name') or item.get('doc_title') or 'source'}"
        if locator:
            header += f" ({locator})"
        line = f"{header}\n{text}"
        if total_chars + len(line) > MAX_TOTAL_CHARS:
            break
        passage_lines.append(line)
        total_chars += len(line)
        citations.append(_citation_for(item, idx))

    context_parts: List[str] = []
    if structured:
        context_parts.append(f"CASE FACTS (precomputed):\n{structured}")
    if passage_lines:
        context_parts.append("DOCUMENT EVIDENCE:\n" + "\n\n".join(passage_lines))

    return {
        "structured_fact": structured,
        "passages": [
            {
                "index": c["index"],
                "file_name": c["file_name"],
                "locator": c["locator"],
                "text": passage_lines[i - 1].split("\n", 1)[1] if i - 1 < len(passage_lines) else "",
            }
            for i, c in enumerate(citations, start=1)
        ],
        "citations": citations,
        "entities_in_question": ents,
        "context_block": "\n\n".join(context_parts) if context_parts else "",
    }
