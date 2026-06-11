"""
Simple, portable vector store backed by SQLite via SQLAlchemy.

Embeddings are stored as base64-encoded float32 bytes on KbChunk.embedding.
Similarity search is a brute-force cosine over NumPy, which is plenty fast
for per-case knowledge bases of up to ~50k chunks (< 30ms).

We deliberately avoid requiring a native extension (sqlite-vec/FAISS) so the
backend installs cleanly on Windows, Linux and macOS with only pip.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
from sqlalchemy.orm import Session

from ..models import KbChunk, KbDocument
from .embeddings import unpack_vector


def _filter_query(
    db: Session,
    case_id: Optional[str],
    document_ids: Optional[List[str]] = None,
    include_global: bool = True,
):
    q = db.query(KbChunk)
    if document_ids:
        q = q.filter(KbChunk.document_id.in_(document_ids))
    else:
        # Case chunks + (optional) global knowledge-base chunks (case_id IS NULL)
        if case_id is not None:
            if include_global:
                q = q.filter((KbChunk.case_id == case_id) | (KbChunk.case_id.is_(None)))
            else:
                q = q.filter(KbChunk.case_id == case_id)
    return q


def _materialize_embeddings(chunks: List[KbChunk]) -> np.ndarray:
    vecs: List[np.ndarray] = []
    for c in chunks:
        emb = c.embedding
        if not emb:
            vecs.append(None)  # type: ignore[arg-type]
            continue
        try:
            vecs.append(unpack_vector(emb))
        except Exception:
            vecs.append(None)  # type: ignore[arg-type]
    valid = [(i, v) for i, v in enumerate(vecs) if v is not None]
    if not valid:
        return np.zeros((0, 0), dtype=np.float32)
    dim = valid[0][1].shape[0]
    matrix = np.zeros((len(chunks), dim), dtype=np.float32)
    for i, v in valid:
        if v.shape[0] == dim:
            matrix[i] = v
    return matrix


def semantic_search(
    db: Session,
    query_vec: np.ndarray,
    *,
    case_id: Optional[str],
    document_ids: Optional[List[str]] = None,
    include_global: bool = True,
    top_k: int = 12,
    min_score: float = 0.15,
) -> List[Dict[str, Any]]:
    """Return top_k chunks ranked by cosine similarity with query_vec.

    Each result: { id, document_id, case_id, text, page, section, row_index,
                   score, entities, doc_title, doc_source_type, file_name }
    """
    q = _filter_query(db, case_id, document_ids, include_global)
    chunks = q.all()
    if not chunks:
        return []

    matrix = _materialize_embeddings(chunks)
    if matrix.size == 0:
        return []

    # Cosine: embeddings are already L2-normalized at ingest time, so dot = cosine.
    # Normalize the query defensively.
    qv = query_vec.astype(np.float32, copy=False)
    norm = float(np.linalg.norm(qv))
    if norm > 0:
        qv = qv / norm
    scores = matrix @ qv
    order = np.argsort(-scores)[: max(top_k * 3, top_k)]

    # Join with document info in one batched query
    doc_ids = list({chunks[i].document_id for i in order})
    docs = {
        d.id: d
        for d in db.query(KbDocument).filter(KbDocument.id.in_(doc_ids)).all()
    }

    results: List[Dict[str, Any]] = []
    for i in order:
        score = float(scores[i])
        if score < min_score:
            continue
        c = chunks[i]
        d = docs.get(c.document_id)
        results.append(
            {
                "id": c.id,
                "document_id": c.document_id,
                "case_id": c.case_id,
                "text": c.text,
                "page": c.page,
                "section": c.section,
                "row_index": c.row_index,
                "score": score,
                "entities": c.entities or {},
                "doc_title": d.title if d else None,
                "doc_source_type": d.source_type if d else None,
                "file_name": d.file_name if d else None,
            }
        )
        if len(results) >= top_k:
            break
    return results


def entity_search(
    db: Session,
    terms: List[str],
    *,
    case_id: Optional[str],
    document_ids: Optional[List[str]] = None,
    include_global: bool = True,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Find chunks that literally contain any of the given entity terms.

    Uses a LIKE scan. Intended for phone/IMEI/IP lookups where exact
    substring match is the correct semantics (semantic search alone misses
    these).
    """
    if not terms:
        return []
    q = _filter_query(db, case_id, document_ids, include_global)
    filters = []
    for t in terms:
        if not t:
            continue
        filters.append(KbChunk.text.contains(t))
    if not filters:
        return []
    from sqlalchemy import or_

    q = q.filter(or_(*filters)).limit(limit * 3)
    chunks = q.all()
    if not chunks:
        return []

    doc_ids = list({c.document_id for c in chunks})
    docs = {
        d.id: d
        for d in db.query(KbDocument).filter(KbDocument.id.in_(doc_ids)).all()
    }

    results: List[Dict[str, Any]] = []
    terms_lc = [t.lower() for t in terms if t]
    for c in chunks:
        text_lc = (c.text or "").lower()
        hits = sum(1 for t in terms_lc if t in text_lc)
        if hits == 0:
            continue
        d = docs.get(c.document_id)
        results.append(
            {
                "id": c.id,
                "document_id": c.document_id,
                "case_id": c.case_id,
                "text": c.text,
                "page": c.page,
                "section": c.section,
                "row_index": c.row_index,
                "score": 0.5 + 0.05 * hits,  # treat entity hits as strong signal
                "entities": c.entities or {},
                "doc_title": d.title if d else None,
                "doc_source_type": d.source_type if d else None,
                "file_name": d.file_name if d else None,
                "entity_hits": hits,
            }
        )
    results.sort(key=lambda r: -r["score"])
    return results[:limit]
