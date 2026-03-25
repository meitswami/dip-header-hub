from collections import defaultdict
from datetime import datetime, time
from typing import Dict, Iterable, Tuple

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..models import (
  CdrRecord,
  CaseAnalysisSummary,
  ContactGraph,
  NumberIntelligence,
)


def rebuild_case_intelligence(db: Session, case_id: str) -> None:
  """
  Python translation of the Supabase rebuild_case_intelligence(case_id) logic.
  Uses only existing CDR rows to rebuild:
    - case_analysis_summary
    - contact_graph
    - number_intelligence
  """
  # Clear existing intel
  db.execute(delete(NumberIntelligence).where(NumberIntelligence.case_id == case_id))
  db.execute(delete(ContactGraph).where(ContactGraph.case_id == case_id))
  db.execute(delete(CaseAnalysisSummary).where(CaseAnalysisSummary.case_id == case_id))

  # Load CDRs for case into memory (only needed fields)
  cdr_rows = (
    db.query(
      CdrRecord.calling_number,
      CdrRecord.called_number,
      CdrRecord.call_date,
    )
    .filter(CdrRecord.case_id == case_id)
    .all()
  )

  if not cdr_rows:
    db.commit()
    return

  total_cdr_records = len(cdr_rows)
  all_numbers = set()
  total_calls = total_cdr_records

  night_calls = 0
  per_number_counts: Dict[str, Dict[str, int]] = defaultdict(
    lambda: {
      "in": 0,
      "out": 0,
      "total": 0,
    }
  )
  per_number_contacts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
  pair_edges: Dict[Tuple[str, str], Dict[str, object]] = {}

  for row in cdr_rows:
    a = (row.calling_number or "").strip()
    b = (row.called_number or "").strip()
    if not a or not b:
      continue

    all_numbers.add(a)
    all_numbers.add(b)

    # night calls: 0–3h local
    if row.call_date:
      dt = row.call_date
      if isinstance(dt, str):
        try:
          dt = datetime.fromisoformat(dt)
        except Exception:
          dt = None
      if isinstance(dt, datetime):
        if time(0, 0) <= dt.time() <= time(3, 59, 59):
          night_calls += 1

    # per-number totals
    per_number_counts[a]["out"] += 1
    per_number_counts[a]["total"] += 1
    per_number_counts[b]["in"] += 1
    per_number_counts[b]["total"] += 1

    # contacts
    per_number_contacts[a][b] += 1
    per_number_contacts[b][a] += 1

    # undirected pair for contact_graph
    key = (a, b) if a <= b else (b, a)
    edge = pair_edges.get(key)
    dt_val = None
    if row.call_date:
      if isinstance(row.call_date, datetime):
        dt_val = row.call_date
      else:
        try:
          dt_val = datetime.fromisoformat(str(row.call_date))
        except Exception:
          dt_val = None
    if not edge:
      pair_edges[key] = {
        "total_calls": 1,
        "first_contact": dt_val,
        "last_contact": dt_val,
      }
    else:
      edge["total_calls"] = int(edge["total_calls"]) + 1
      if dt_val:
        if not edge["first_contact"] or dt_val < edge["first_contact"]:
          edge["first_contact"] = dt_val
        if not edge["last_contact"] or dt_val > edge["last_contact"]:
          edge["last_contact"] = dt_val

  # case_analysis_summary
  total_unique_numbers = len(all_numbers)
  night_pct = (night_calls / total_calls * 100.0) if total_calls > 0 else 0.0

  summary = CaseAnalysisSummary(
    id=_uuid(),
    case_id=case_id,
    total_cdr_records=total_cdr_records,
    total_unique_numbers=total_unique_numbers,
    total_ipdr_records=0,
    total_tower_records=0,
    total_calls=total_calls,
    night_call_percentage=night_pct,
    generated_at=datetime.utcnow(),
  )
  db.add(summary)

  # contact_graph
  for (n1, n2), v in pair_edges.items():
    db.add(
      ContactGraph(
        id=_uuid(),
        case_id=case_id,
        number_1=n1,
        number_2=n2,
        total_calls=int(v["total_calls"]),
        first_contact=v["first_contact"],
        last_contact=v["last_contact"],
      )
    )

  # number_intelligence
  for num, counts in per_number_counts.items():
    total = counts["total"]
    night_pct_num = night_pct  # simple reuse of case-level %; refine if needed
    contacts = per_number_contacts[num]
    top = sorted(contacts.items(), key=lambda kv: kv[1], reverse=True)[:3]
    top_contacts = [
      {"number": other, "total_calls": cnt} for other, cnt in top
    ]
    db.add(
      NumberIntelligence(
        id=_uuid(),
        case_id=case_id,
        phone_number=num,
        total_incoming_calls=counts["in"],
        total_outgoing_calls=counts["out"],
        total_calls=total,
        unique_contacts=len(contacts),
        night_call_percentage=night_pct_num,
        top_contacts=top_contacts,
        extra_metrics=None,
        last_computed_at=datetime.utcnow(),
      )
    )

  db.commit()


def _uuid() -> str:
  # local helper to avoid importing uuid everywhere
  import uuid

  return str(uuid.uuid4())

