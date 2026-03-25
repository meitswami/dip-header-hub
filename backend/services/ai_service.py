import os
from typing import List, Dict, Any, Tuple

import httpx
from sqlalchemy.orm import Session

from ..models import (
  Case,
  CaseAnalysisSummary,
  NumberIntelligence,
  ContactGraph,
)


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")


def _extract_last_user(messages: List[Dict[str, Any]]) -> str:
  for msg in reversed(messages):
    if msg.get("role") == "user":
      return str(msg.get("content") or "")
  return ""


def detect_intent(query: str, numbers: List[str]) -> Tuple[str, Dict[str, Any]]:
  q = query.lower()
  # A) Direct interconnection
  if (
    any(k in q for k in ["direct call", "directly call", "interconnection", "interaction between", "link between"])
    and len(numbers) >= 2
  ):
    return "direct_interconnection", {"a": numbers[0], "b": numbers[1]}
  # B) Common contacts
  if any(k in q for k in ["common", "overlap", "shared contact"]) and len(numbers) >= 2:
    return "common_contacts", {"a": numbers[0], "b": numbers[1]}
  # C) Number summary
  if any(k in q for k in ["total", "summary", "interaction pattern", "call details", "frequency"]) and numbers:
    return "number_summary", {"n": numbers[0]}
  # D) Case summary
  if any(
    k in q
    for k in [
      "case summary",
      "how many cdr",
      "how many records",
      "how many calls",
      "total calls in this case",
      "total records in this case",
      "overall stats",
      "overall summary",
      "cdr count",
      "record count",
    ]
  ):
    return "case_summary", {}
  # E) Top contacts for a number
  if any(
    k in q
    for k in [
      "top contact",
      "who does",
      "most called",
      "most calling",
      "frequent contact",
    ]
  ) and numbers:
    return "top_contacts", {"n": numbers[0]}
  # F) Most active numbers
  if any(
    k in q
    for k in [
      "most active",
      "top numbers",
      "highest call",
      "who has the most calls",
      "busiest numbers",
    ]
  ):
    return "most_active", {}
  return "llm", {}


def handle_direct_interconnection(db: Session, case_id: str, a: str, b: str) -> str:
  edge = (
    db.query(ContactGraph)
    .filter(
      ContactGraph.case_id == case_id,
      (
        (ContactGraph.number_1 == a) & (ContactGraph.number_2 == b)
      )
      | (
        (ContactGraph.number_1 == b) & (ContactGraph.number_2 == a)
      ),
    )
    .first()
  )
  if not edge or (edge.total_calls or 0) <= 0:
    return f"There are no direct calls recorded between {a} and {b} in this case."
  return f"Yes, {a} and {b} have {edge.total_calls} total calls in this case."


def handle_common_contacts(db: Session, case_id: str, a: str, b: str) -> str:
  # neighbors of a
  rows_a = (
    db.query(ContactGraph)
    .filter(
      ContactGraph.case_id == case_id,
      (ContactGraph.number_1 == a) | (ContactGraph.number_2 == a),
    )
    .all()
  )
  rows_b = (
    db.query(ContactGraph)
    .filter(
      ContactGraph.case_id == case_id,
      (ContactGraph.number_1 == b) | (ContactGraph.number_2 == b),
    )
    .all()
  )
  na = set()
  nb = set()
  for e in rows_a:
    if e.number_1 == a:
      na.add(e.number_2)
    if e.number_2 == a:
      na.add(e.number_1)
  for e in rows_b:
    if e.number_1 == b:
      nb.add(e.number_2)
    if e.number_2 == b:
      nb.add(e.number_1)
  common = sorted({x for x in na if x in nb and x not in (a, b)})
  if not common:
    return f"No common contacts found between {a} and {b}."
  top = ", ".join(common[:10])
  tail = f" (and {len(common) - 10} more)" if len(common) > 10 else ""
  return f"{a} and {b} share {len(common)} common contacts: {top}{tail}."


def handle_number_summary(db: Session, case_id: str, n: str) -> str:
  intel = (
    db.query(NumberIntelligence)
    .filter(NumberIntelligence.case_id == case_id, NumberIntelligence.phone_number == n)
    .first()
  )
  if not intel:
    return f"No precomputed summary available for {n} in this case."
  x = intel.total_incoming_calls or 0
  y = intel.total_outgoing_calls or 0
  z = intel.total_calls or 0
  u = intel.unique_contacts or 0
  return f"For {n}: Incoming {x}, Outgoing {y}, Total {z}, Unique contacts {u}."


def handle_case_summary(db: Session, case_id: str) -> str:
  summary = (
    db.query(CaseAnalysisSummary)
    .filter(CaseAnalysisSummary.case_id == case_id)
    .first()
  )
  if not summary:
    return "No precomputed case summary available. Upload CDR data and rebuild intelligence."
  cdr = summary.total_cdr_records or 0
  uniq = summary.total_unique_numbers or 0
  calls = summary.total_calls or 0
  night = round(summary.night_call_percentage or 0)
  ipdr = summary.total_ipdr_records or 0
  tower = summary.total_tower_records or 0
  return f"This case has {cdr} CDR records, {uniq} unique numbers, {calls} total calls, about {night}% at night. IPDR: {ipdr} records; Tower: {tower} records."


def handle_top_contacts_for_number(db: Session, case_id: str, n: str) -> str:
  intel = (
    db.query(NumberIntelligence)
    .filter(NumberIntelligence.case_id == case_id, NumberIntelligence.phone_number == n)
    .first()
  )
  if not intel:
    return f"No precomputed data for {n} in this case."
  top = intel.top_contacts or []
  if not isinstance(top, list) or not top:
    return f"No top contacts stored for {n} in this case."
  parts = []
  for item in top[:10]:
    num = (item or {}).get("number") or (item or {}).get("phone_number") or "?"
    cnt = (item or {}).get("total_calls") or (item or {}).get("count") or "?"
    parts.append(f"{num} ({cnt} calls)")
  return f"Top contacts for {n}: {', '.join(parts)}."


def handle_most_active_numbers(db: Session, case_id: str) -> str:
  rows = (
    db.query(NumberIntelligence)
    .filter(NumberIntelligence.case_id == case_id)
    .order_by(NumberIntelligence.total_calls.desc())
    .limit(10)
    .all()
  )
  if not rows:
    return "No number intelligence available for this case."
  parts = [f"{r.phone_number} ({r.total_calls or 0} calls)" for r in rows]
  return f"Most active numbers in this case: {', '.join(parts)}."


def build_compact_context(db: Session, case_id: str) -> str:
  parts: list[str] = []

  case = db.query(Case).filter(Case.id == case_id).first()
  if case:
    parts.append(
      f"CASE: {case.title} | FIR: {case.fir_number or 'N/A'} | Sections: {case.sections or 'N/A'} | Status: {case.status or 'N/A'}"
    )
    if case.complainant:
      parts.append(f"Complainant: {case.complainant}")
    if case.accused:
      parts.append(f"Accused: {case.accused}")
    if case.description:
      parts.append(f"Description: {case.description}")

  summary = (
    db.query(CaseAnalysisSummary)
    .filter(CaseAnalysisSummary.case_id == case_id)
    .first()
  )
  if summary:
    parts.append(
      f"SUMMARY: CDR={summary.total_cdr_records or 0} | Unique numbers={summary.total_unique_numbers or 0} | Total calls={summary.total_calls or 0} | Night%={summary.night_call_percentage or 0}"
    )

  intel_rows = (
    db.query(NumberIntelligence)
    .filter(NumberIntelligence.case_id == case_id)
    .order_by(NumberIntelligence.total_calls.desc())
    .limit(20)
    .all()
  )
  if intel_rows:
    parts.append(
      "TOP NUMBERS: "
      + "; ".join(
        f"{r.phone_number}: total={r.total_calls} in={r.total_incoming_calls} out={r.total_outgoing_calls} unique={r.unique_contacts} night%={r.night_call_percentage or 0}"
        for r in intel_rows
      )
    )

  edges = (
    db.query(ContactGraph)
    .filter(ContactGraph.case_id == case_id)
    .order_by(ContactGraph.total_calls.desc())
    .limit(20)
    .all()
  )
  if edges:
    parts.append(
      "TOP PAIRS: "
      + "; ".join(f"{e.number_1}↔{e.number_2}={e.total_calls}" for e in edges)
    )

  return "\n".join(parts) or "No case data available."


def trim_response(text: str) -> str:
  if not text:
    return text
  import re

  no_newlines = re.sub(r"\s+", " ", text).strip()
  sentences = [s for s in re.split(r"(?<=[.!?])\s+", no_newlines) if s]
  joined = " ".join(sentences[:2]).strip()
  return joined[:250].rstrip()


async def call_ollama_narrative(case_id: str, messages: List[Dict[str, Any]], style_level: str, db: Session) -> str:
  context = build_compact_context(db, case_id)
  style = (
    "Use precise forensic-investigation language; keep sentences short and direct."
    if style_level == "expert"
    else "Use clear investigative language; keep sentences simple."
    if style_level == "intermediate"
    else "Use very simple, plain language; use short everyday words and short sentences."
  )

  system_prompt = (
    "You are a senior Digital Investigation AI Analyst for Indian law enforcement. "
    "You have access ONLY to precomputed summaries and tables already computed in the database (no raw CDR/IPDR/Tower/SDR rows).\n\n"
    "=== CASE DATA ===\n"
    f"{context}\n\n"
    "Rules:\n"
    "- There is exactly one intelligence source: the database.\n"
    "- All telecom analysis (counts, intersections, common contacts, frequencies, timelines) is performed outside this model using SQL/RPC/precomputed tables.\n"
    "- You MUST NOT derive or imagine any new numeric results; any numbers you mention must already appear in CASE DATA or in the user's question.\n"
    '- If a requested telecom metric is not clearly present in CASE DATA, reply: "Insufficient data for this case."\n'
    "- Maximum 2 short sentences, no bullet lists, no line breaks, no ethical or limitation commentary.\n"
    f"Style: {style}\n"
    f"Case ID: {case_id}"
  )

  payload = {
    "model": OLLAMA_MODEL,
    "messages": [{"role": "system", "content": system_prompt}, *messages],
    "stream": False,
    "options": {"temperature": 0.1, "num_predict": 80, "top_p": 0.9},
  }

  async with httpx.AsyncClient(timeout=60.0) as client:
    resp = await client.post(f"{OLLAMA_URL}/v1/chat/completions", json=payload)
    resp.raise_for_status()
    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "") or ""
    return trim_response(content)

