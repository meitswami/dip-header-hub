"""
Local embedding model wrapper.

Uses sentence-transformers' paraphrase-multilingual-MiniLM-L12-v2 (~120MB),
which supports English + Hindi (and 50+ languages) with 384-dim vectors.

The model is lazy-loaded on first use to keep backend startup fast. If
sentence-transformers is not installed (optional at install time), a clear
RuntimeError is raised only when embeddings are actually requested.
"""
from __future__ import annotations

import base64
import os
import threading
from typing import List, Optional

import numpy as np

MODEL_NAME = os.getenv(
    "DIP_EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
EMBED_DIM = 384

_model = None
_model_lock = threading.Lock()
_model_error: Optional[str] = None


def _load_model():
    """Lazy-load the embedding model. Thread-safe."""
    global _model, _model_error
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        try:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(MODEL_NAME)
        except Exception as e:  # pragma: no cover - surface at runtime
            _model_error = (
                f"Failed to load embedding model '{MODEL_NAME}': {e}. "
                "Run: pip install -r backend/requirements.txt"
            )
            raise RuntimeError(_model_error) from e
    return _model


def model_status() -> dict:
    """Cheap status check without triggering a model load."""
    return {
        "loaded": _model is not None,
        "model": MODEL_NAME,
        "dim": EMBED_DIM,
        "error": _model_error,
    }


def embed_texts(texts: List[str], batch_size: int = 32) -> np.ndarray:
    """Return an (N, dim) float32 numpy array of L2-normalized embeddings."""
    if not texts:
        return np.zeros((0, EMBED_DIM), dtype=np.float32)
    model = _load_model()
    vectors = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return vectors.astype(np.float32, copy=False)


def embed_one(text: str) -> np.ndarray:
    return embed_texts([text])[0]


def pack_vector(vec: np.ndarray) -> str:
    """Serialize a float32 vector to a base64 string for JSON storage."""
    if vec.dtype != np.float32:
        vec = vec.astype(np.float32)
    return base64.b64encode(vec.tobytes()).decode("ascii")


def unpack_vector(packed: str) -> np.ndarray:
    raw = base64.b64decode(packed)
    return np.frombuffer(raw, dtype=np.float32)
