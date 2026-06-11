"""
Optional cross-encoder re-ranker.

Semantic (dense) retrieval is fast but not always the most precise. A small
cross-encoder rescorer reorders the top-K candidates so the most directly
relevant passage lands first — at a cost of a few hundred ms.

Off by default. Enable with DIP_USE_RERANKER=1 (or pass
`build_context(..., use_reranker=True)` in tests).

Uses `cross-encoder/ms-marco-MiniLM-L-6-v2` (~90 MB). Loaded lazily so startup
stays fast; the first request after enabling pays the one-off load cost.
"""
from __future__ import annotations

import os
import threading
from typing import List, Optional

MODEL_NAME = os.getenv(
    "DIP_RERANKER_MODEL",
    "cross-encoder/ms-marco-MiniLM-L-6-v2",
)


def is_enabled() -> bool:
    v = (os.getenv("DIP_USE_RERANKER", "") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


_model = None
_lock = threading.Lock()
_error: Optional[str] = None


def _load():
    global _model, _error
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            from sentence_transformers import CrossEncoder  # type: ignore

            _model = CrossEncoder(MODEL_NAME)
        except Exception as e:  # pragma: no cover - optional
            _error = f"Failed to load re-ranker '{MODEL_NAME}': {e}"
            raise RuntimeError(_error) from e
    return _model


def status() -> dict:
    return {"loaded": _model is not None, "model": MODEL_NAME, "enabled": is_enabled(), "error": _error}


def rerank(query: str, passages: List[str]) -> List[float]:
    """Return one score per passage. Higher = more relevant.

    Returns an empty list if the model cannot be loaded.
    """
    if not passages:
        return []
    try:
        model = _load()
    except RuntimeError:
        return []
    pairs = [(query, p) for p in passages]
    try:
        scores = model.predict(pairs, convert_to_numpy=True)
        return [float(s) for s in scores]
    except Exception:
        return []
