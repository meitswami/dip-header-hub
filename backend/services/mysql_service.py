"""
Readonly MySQL connector.

Admins save connection details; every subsequent call opens a short-lived
SQLAlchemy engine against that server, runs an introspection / SELECT, and
closes. Passwords are encrypted at rest with Fernet (symmetric AES).

Safety rails:
  - Only statements whose first non-comment keyword is SELECT or SHOW are
    allowed. Anything else raises ValueError BEFORE touching the server.
  - Every query is capped at `max_rows` (default 500) and wrapped in a
    short `SET SESSION MAX_EXECUTION_TIME` hint (MySQL 5.7.4+).
  - Introspection uses `information_schema`; no user input is interpolated
    into table/column identifiers.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ..models import MysqlConnection

DEFAULT_MAX_ROWS = 500
DEFAULT_TIMEOUT_MS = 15_000


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------


def _get_fernet():
    """Return a Fernet instance using DIP_SECRET_KEY (base64-encoded 32 bytes).

    If no key is configured, a deterministic dev key is derived from a constant
    salt. This is intentionally weak — production deployments MUST set
    DIP_SECRET_KEY to a unique value.
    """
    try:
        from cryptography.fernet import Fernet
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "cryptography is not installed. Run: pip install -r backend/requirements.txt"
        ) from e

    key = os.getenv("DIP_SECRET_KEY")
    if not key:
        # Deterministic dev-only key. NOT for production.
        import base64
        import hashlib

        seed = hashlib.sha256(b"dip-local-dev-key").digest()
        key = base64.urlsafe_b64encode(seed).decode("ascii")
    if isinstance(key, str):
        key_bytes = key.encode("ascii")
    else:
        key_bytes = key
    return Fernet(key_bytes)


def encrypt_password(plain: str) -> str:
    if not plain:
        return ""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_password(token: str) -> str:
    if not token:
        return ""
    return _get_fernet().decrypt(token.encode("ascii")).decode("utf-8")


# ---------------------------------------------------------------------------
# Engine builder
# ---------------------------------------------------------------------------


def _engine_for(conn: MysqlConnection) -> Engine:
    """Create a short-lived engine bound to `conn`. Caller disposes it."""
    from urllib.parse import quote_plus

    password = decrypt_password(conn.password_encrypted or "")
    user = quote_plus(conn.username or "")
    pw = quote_plus(password)
    host = conn.host or "127.0.0.1"
    port = int(conn.port or 3306)
    db = conn.database or ""
    url = f"mysql+pymysql://{user}:{pw}@{host}:{port}/{db}?charset=utf8mb4"
    connect_args: Dict[str, Any] = {"connect_timeout": 8}
    if conn.ssl_enabled:
        connect_args["ssl"] = {"ssl_disabled": False}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True, future=True)


# ---------------------------------------------------------------------------
# SELECT-only guard
# ---------------------------------------------------------------------------


_COMMENT_RE = re.compile(r"(--[^\n]*\n|/\*.*?\*/)", re.DOTALL)
_SAFE_FIRST_KEYWORDS = {"select", "show", "describe", "desc", "explain", "with"}


def _first_keyword(sql: str) -> str:
    s = _COMMENT_RE.sub(" ", sql).strip()
    m = re.match(r"[A-Za-z]+", s)
    return (m.group(0).lower() if m else "")


def assert_readonly(sql: str) -> None:
    """Raise ValueError if `sql` is not a single SELECT/SHOW/... statement."""
    if not sql or not sql.strip():
        raise ValueError("Query is empty.")
    # Reject multi-statement batches: find semicolons outside strings (heuristic)
    # Allow one trailing semicolon.
    stripped = sql.strip().rstrip(";")
    if ";" in stripped:
        raise ValueError("Only a single statement is allowed per request.")
    kw = _first_keyword(sql)
    if kw not in _SAFE_FIRST_KEYWORDS:
        raise ValueError(
            f"Only SELECT / SHOW / DESCRIBE / EXPLAIN queries are allowed (got '{kw}')."
        )


# ---------------------------------------------------------------------------
# Public API used by endpoints
# ---------------------------------------------------------------------------


def mark_test(db: Session, conn: MysqlConnection, *, ok: bool, error: Optional[str]) -> None:
    conn.last_tested_at = datetime.utcnow()
    conn.last_test_ok = ok
    conn.last_test_error = (error or "")[:500] if not ok else None
    db.commit()


def test_connection(db: Session, conn: MysqlConnection) -> Dict[str, Any]:
    eng = _engine_for(conn)
    try:
        with eng.connect() as c:
            version = c.execute(text("SELECT VERSION()")).scalar()
        mark_test(db, conn, ok=True, error=None)
        return {"ok": True, "server_version": str(version) if version else None}
    except Exception as e:
        mark_test(db, conn, ok=False, error=str(e))
        return {"ok": False, "error": str(e)}
    finally:
        eng.dispose()


def list_schema(conn: MysqlConnection) -> Dict[str, Any]:
    """Return tables and columns from information_schema for this database."""
    eng = _engine_for(conn)
    try:
        with eng.connect() as c:
            tables = c.execute(
                text(
                    "SELECT table_name, table_rows "
                    "FROM information_schema.tables "
                    "WHERE table_schema = :db AND table_type = 'BASE TABLE' "
                    "ORDER BY table_name"
                ),
                {"db": conn.database},
            ).mappings().all()

            cols = c.execute(
                text(
                    "SELECT table_name, column_name, data_type, is_nullable, column_key "
                    "FROM information_schema.columns "
                    "WHERE table_schema = :db "
                    "ORDER BY table_name, ordinal_position"
                ),
                {"db": conn.database},
            ).mappings().all()

        cols_by_table: Dict[str, List[Dict[str, Any]]] = {}
        for row in cols:
            tbl = row["table_name"]
            cols_by_table.setdefault(tbl, []).append(
                {
                    "name": row["column_name"],
                    "type": row["data_type"],
                    "nullable": row["is_nullable"] == "YES",
                    "key": row["column_key"],
                }
            )

        return {
            "database": conn.database,
            "tables": [
                {
                    "name": t["table_name"],
                    "estimated_rows": int(t["table_rows"] or 0),
                    "columns": cols_by_table.get(t["table_name"], []),
                }
                for t in tables
            ],
        }
    finally:
        eng.dispose()


def sample_table(conn: MysqlConnection, table_name: str, limit: int = 50) -> Dict[str, Any]:
    if not re.match(r"^[A-Za-z0-9_]+$", table_name or ""):
        raise ValueError("Invalid table name.")
    eng = _engine_for(conn)
    try:
        with eng.connect() as c:
            rows = c.execute(
                text(f"SELECT * FROM `{table_name}` LIMIT :lim"),
                {"lim": max(1, min(int(limit or 50), DEFAULT_MAX_ROWS))},
            ).mappings().all()
        return {
            "table": table_name,
            "columns": list(rows[0].keys()) if rows else [],
            "rows": [dict(r) for r in rows],
            "count": len(rows),
        }
    finally:
        eng.dispose()


def run_query(conn: MysqlConnection, sql: str, max_rows: int = DEFAULT_MAX_ROWS) -> Dict[str, Any]:
    assert_readonly(sql)
    eng = _engine_for(conn)
    try:
        with eng.connect() as c:
            # Best-effort statement timeout. MySQL 5.7.4+ supports it as a hint.
            try:
                c.execute(text(f"SET SESSION MAX_EXECUTION_TIME = {int(DEFAULT_TIMEOUT_MS)}"))
            except Exception:
                pass
            result = c.execute(text(sql))
            rows = []
            keys = list(result.keys()) if hasattr(result, "keys") else []
            for i, r in enumerate(result.mappings()):
                if i >= max_rows:
                    break
                rows.append(dict(r))
        return {"columns": keys, "rows": rows, "count": len(rows), "truncated": len(rows) >= max_rows}
    finally:
        eng.dispose()


# ---------------------------------------------------------------------------
# JSON shaping for API responses
# ---------------------------------------------------------------------------


def to_public_json(conn: MysqlConnection) -> Dict[str, Any]:
    """Serialize a connection without leaking the encrypted password."""
    return {
        "id": conn.id,
        "name": conn.name,
        "host": conn.host,
        "port": conn.port,
        "database": conn.database,
        "username": conn.username,
        "ssl_enabled": bool(conn.ssl_enabled),
        "notes": conn.notes,
        "created_at": conn.created_at.isoformat() if conn.created_at else None,
        "last_tested_at": conn.last_tested_at.isoformat() if conn.last_tested_at else None,
        "last_test_ok": conn.last_test_ok,
        "last_test_error": conn.last_test_error,
    }


def new_id() -> str:
    return str(uuid.uuid4())
