"""
Regex-based entity extraction for investigation-grade text.

Extracts the identifiers that matter for CDR/IPDR/SDR/Tower analysis so
retrieval can do "entity-bridge" matching even when semantic similarity is
low (e.g. a phone number mentioned inside a large paragraph of unrelated
narration).
"""
from __future__ import annotations

import re
from typing import Dict, List, Set

# Indian mobile numbers are 10 digits starting 6-9. We also allow 11-15 digit
# forms for international variants seen in operator dumps.
_RE_PHONE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{9})(?!\d)")
_RE_PHONE_LONG = re.compile(r"(?<!\d)(\d{11,15})(?!\d)")
_RE_IMEI = re.compile(r"(?<!\d)(\d{15})(?!\d)")
_RE_IMSI = re.compile(r"(?<!\d)(\d{14,15})(?!\d)")
_RE_IP = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Simple date detectors for DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
_RE_DATE = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b"
)
# Cell/CGI identifiers commonly look like 4+ digit codes grouped by hyphens or
# a 10-16 digit "LAC-CI" style blob. Keep this broad; it is only a hint.
_RE_CELL = re.compile(r"\b\d{3,5}-\d{3,6}\b")

# Money amounts (INR) - crude but helpful for financial sections of charge sheets.
_RE_MONEY = re.compile(
    r"(?:Rs\.?|INR|₹)\s?\d{1,3}(?:,\d{2,3})*(?:\.\d+)?",
    re.IGNORECASE,
)


def _uniq(seq: List[str], limit: int = 50) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for x in seq:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
        if len(out) >= limit:
            break
    return out


def extract_entities(text: str) -> Dict[str, List[str]]:
    """Extract the standard investigation entities from a chunk of text.

    Returns a dict with keys: phone, imei, ip, email, date, cell, money.
    Values are de-duplicated lists. All values are strings.
    """
    if not text:
        return {
            "phone": [],
            "imei": [],
            "ip": [],
            "email": [],
            "date": [],
            "cell": [],
            "money": [],
        }

    phones_short = [m.group(1) for m in _RE_PHONE.finditer(text)]
    phones_long = [m.group(1) for m in _RE_PHONE_LONG.finditer(text)]
    imeis = [m.group(1) for m in _RE_IMEI.finditer(text)]

    # IMEI-matched tokens are also 15 digits and would double-count as long
    # phones. Subtract them from phones_long.
    imei_set = set(imeis)
    phones_long = [p for p in phones_long if p not in imei_set]

    phones = _uniq(phones_short + phones_long)
    return {
        "phone": phones,
        "imei": _uniq(imeis),
        "ip": _uniq(_RE_IP.findall(text)),
        "email": _uniq(_RE_EMAIL.findall(text)),
        "date": _uniq(_RE_DATE.findall(text), limit=200),
        "cell": _uniq(_RE_CELL.findall(text)),
        "money": _uniq(_RE_MONEY.findall(text)),
    }


def detect_language(text: str) -> str:
    """Very cheap language detection: any Devanagari -> 'mixed' or 'hi'."""
    if not text:
        return "en"
    has_deva = bool(re.search(r"[\u0900-\u097F]", text))
    has_latin = bool(re.search(r"[A-Za-z]", text))
    if has_deva and has_latin:
        return "mixed"
    if has_deva:
        return "hi"
    return "en"
