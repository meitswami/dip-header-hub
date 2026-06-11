"""
Field dictionary service.

Answers the "what does this column / term mean?" question investigator-friendly,
with optional examples pulled from the case data. The dictionary itself lives in
backend/data/field_dictionary.json so it can be edited without touching code.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models import CdrRecord, IpdrRecord, SdrRecord, TowerDumpRecord

_DICT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "field_dictionary.json")

_cache: Optional[Dict[str, Any]] = None


def _normalize(token: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (token or "").strip().lower()).strip("_")


def _load() -> Dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache
    try:
        with open(_DICT_PATH, "r", encoding="utf-8") as f:
            _cache = json.load(f)
    except Exception:
        _cache = {"version": 0, "terms": [], "abbreviations": {}}
    return _cache


def _build_index() -> Dict[str, Dict[str, Any]]:
    data = _load()
    idx: Dict[str, Dict[str, Any]] = {}
    for term in data.get("terms", []):
        key = _normalize(term.get("key", ""))
        if key:
            idx[key] = term
        for alias in term.get("aliases", []):
            idx[_normalize(alias)] = term
    return idx


def _best_match(term: str) -> Optional[Dict[str, Any]]:
    if not term:
        return None
    idx = _build_index()
    norm = _normalize(term)
    if norm in idx:
        return idx[norm]
    # Substring fallback: try to match partial column header names
    for k, v in idx.items():
        if norm and (norm in k or k in norm):
            return v
    # rapidfuzz fuzzy match
    try:
        from rapidfuzz import process, fuzz  # type: ignore

        match = process.extractOne(norm, list(idx.keys()), scorer=fuzz.WRatio)
        if match and match[1] >= 78:
            return idx[match[0]]
    except Exception:
        pass
    return None


def _abbreviation(term: str) -> Optional[str]:
    if not term:
        return None
    abbr = _load().get("abbreviations", {})
    key = _normalize(term).replace("_", "").upper()
    if key.lower() in abbr:
        return abbr[key.lower()]
    # Try the original (e.g. "CGI")
    return abbr.get(term.lower())


def _examples_from_case(
    db: Session, *, case_id: Optional[str], field_key: str
) -> List[str]:
    """Pull up to 3 sample values for this field from the case's tables."""
    if not case_id or not field_key:
        return []
    # Map dictionary field keys to (model, attribute). Unknown keys return [].
    candidates: List[Tuple[Any, str]] = [
        (CdrRecord, field_key),
        (IpdrRecord, field_key),
        (SdrRecord, field_key),
        (TowerDumpRecord, field_key),
    ]
    samples: List[str] = []
    for model, attr in candidates:
        if not hasattr(model, attr):
            continue
        col = getattr(model, attr)
        try:
            rows = (
                db.query(col)
                .filter(model.case_id == case_id)
                .filter(col.isnot(None))
                .distinct()
                .limit(3)
                .all()
            )
            for r in rows:
                v = r[0] if isinstance(r, tuple) else r
                if v is None:
                    continue
                s = str(v)
                if s and s not in samples:
                    samples.append(s)
                if len(samples) >= 3:
                    break
        except Exception:
            continue
        if samples:
            break
    return samples


def explain(db: Session, term: str, case_id: Optional[str] = None) -> Dict[str, Any]:
    """Return a human-readable explanation for an investigation term."""
    term = (term or "").strip()
    if not term:
        return {
            "term": "",
            "matched": False,
            "message": "Provide a term (column name, field, or abbreviation) to explain.",
        }

    matched = _best_match(term)
    abbrev = _abbreviation(term)
    if matched is None and abbrev is None:
        return {
            "term": term,
            "matched": False,
            "message": f"No dictionary entry for '{term}'. Try a CDR/IPDR/SDR column name.",
        }

    result: Dict[str, Any] = {"term": term, "matched": True}
    if matched is not None:
        result.update(
            {
                "key": matched.get("key"),
                "category": matched.get("category"),
                "short": matched.get("short"),
                "short_hi": matched.get("short_hi"),
                "detail": matched.get("detail"),
                "detail_hi": matched.get("detail_hi"),
                "aliases": matched.get("aliases", []),
                "examples": _examples_from_case(db, case_id=case_id, field_key=matched.get("key", "")),
            }
        )
    if abbrev:
        result["abbreviation"] = abbrev
    return result
