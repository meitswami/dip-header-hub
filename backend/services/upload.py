"""
Excel/CSV parsing and record insertion. Mirrors src/lib/dataParser.ts column maps.
"""
import io
import re
import hashlib
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from ..models import (
    Case,
    CdrRecord,
    IpdrRecord,
    TowerDumpRecord,
    SdrRecord,
    EvidenceLog,
    DataProcurement,
    Alias,
)
from .intelligence import rebuild_case_intelligence

# Column maps: db_column -> list of header aliases (normalized: lower, non-alphanumeric -> _)
CDR_COLUMN_MAP = {
    "calling_number": [
        "calling_number", "caller", "a_party", "calling_no", "from_number", "source_number",
        "msisdn_a", "calling_party", "target_a_party_number", "target_no", "target_number",
        "msisdn", "bharti_airtel_limited", "subscriber_number", "subscriber_msisdn", "subscriber",
        "party_a", "owner_number",
    ],
    "called_number": [
        "called_number", "called", "b_party", "called_no", "to_number", "destination_number",
        "msisdn_b", "called_party", "b_party_number", "b_party_no", "_empty_2", "_empty_1",
        "other_party", "party_b", "contact_number",
    ],
    "call_date": ["call_date", "date", "datetime", "timestamp", "call_time", "start_time", "call_start"],
    "duration": ["duration", "call_duration", "duration_sec", "dur", "talk_time"],
    "call_type": ["call_type", "type", "service_type", "call_category", "toc"],
    "imei": ["imei", "imei_number", "device_id"],
    "imsi": ["imsi", "imsi_number"],
    "cell_id": ["cell_id", "cell", "cgi", "lac_ci", "tower_id", "site_id"],
    "tower_location": ["location", "address", "site_name", "tower_location", "cell_location"],
    "tower_lat": ["lat", "latitude"],
    "tower_lng": ["lng", "longitude", "long"],
    "operator": ["operator", "network", "provider", "carrier"],
}

IPDR_COLUMN_MAP = {
    "msisdn": ["msisdn", "phone", "mobile_number"],
    "source_ip": ["ip_address", "source_ip", "ip", "src_ip", "nat_ip"],
    "destination_ip": ["destination_ip", "dest_ip", "dst_ip"],
    "source_port": ["source_port", "src_port", "port"],
    "destination_port": ["destination_port", "dest_port", "dst_port"],
    "protocol": ["protocol", "proto"],
    "session_start": ["timestamp", "date", "datetime", "time"],
    "data_volume": ["bytes_transferred", "bytes", "data_volume", "volume"],
    "duration": ["duration", "session_duration"],
    "cell_id": ["cell_id", "cgi"],
    "tower_location": ["location", "site_name"],
    "imei": ["imei"],
}

TOWER_COLUMN_MAP = {
    "cell_id": ["cell_id", "cgi", "tower_id", "site_id"],
    "imei": ["imei"],
    "imsi": ["imsi"],
    "mobile_number": ["msisdn", "mobile", "phone_number"],
    "event_time": ["timestamp", "date", "datetime"],
    "tower_location": ["location", "site_name", "address"],
    "tower_lat": ["lat", "latitude"],
    "tower_lng": ["lng", "longitude"],
    "duration": ["duration"],
}

SDR_COLUMN_MAP = {
    "mobile_number": ["phone_number", "msisdn", "mobile", "number"],
    "subscriber_name": ["subscriber_name", "name", "customer_name"],
    "address": ["address", "addr", "residential_address"],
    "activation_date": ["activation_date", "activation", "start_date"],
    "operator": ["operator", "network", "provider"],
    "circle": ["circle", "plan_type", "plan", "tariff"],
    "id_type": ["id_proof_type", "id_type", "document_type"],
    "id_number": ["id_proof_number", "id_number", "document_number"],
}

TYPE_CONFIG = {
    "cdr": {"model": CdrRecord, "column_map": CDR_COLUMN_MAP},
    "ipdr": {"model": IpdrRecord, "column_map": IPDR_COLUMN_MAP},
    "tower_dump": {"model": TowerDumpRecord, "column_map": TOWER_COLUMN_MAP},
    "sdr": {"model": SdrRecord, "column_map": SDR_COLUMN_MAP},
}


def _norm(h: Any) -> str:
    """
    Normalize a header value to a comparable token:
    - Accepts any type (some Excel headers can be floats/NaN).
    - Returns empty string for null/NaN so it simply won't match.
    """
    if h is None:
        return ""
    # Handle pandas NaN / NA which often come through as float
    try:
        import pandas as pd  # local import to avoid cycles at module load
        if isinstance(h, float) and pd.isna(h):
            return ""
    except Exception:
        # If pandas is not available here for some reason, just continue.
        if isinstance(h, float):
            return ""
    s = str(h).strip().lower()
    return re.sub(r"[^a-z0-9_]", "_", s)


def auto_map_columns(headers: List[str], column_map: Dict[str, List[str]]) -> Dict[str, str]:
    mapping = {}
    normalized = [_norm(h) for h in headers]
    for db_col, aliases in column_map.items():
        for alias in aliases:
            try:
                idx = normalized.index(alias)
                mapping[db_col] = headers[idx]
                break
            except ValueError:
                continue
    return mapping


def _parse_date(v: Any) -> Optional[datetime]:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, pd.Timestamp):
        return v.to_pydatetime()
    try:
        return pd.to_datetime(v)
    except Exception:
        return None


def map_row_to_record(row: Dict[str, Any], mapping: Dict[str, str], db_columns: List[str]) -> Dict[str, Any]:
    out = {}
    for db_col, file_col in mapping.items():
        if db_col not in db_columns:
            continue
        raw = row.get(file_col)
        if raw is None or (isinstance(raw, float) and pd.isna(raw)):
            out[db_col] = None
            continue
        if "date" in db_col or "time" in db_col or db_col in ("first_contact", "last_contact", "activation_date", "session_start", "event_time"):
            out[db_col] = _parse_date(raw)
        else:
            out[db_col] = raw
    return out


def read_spreadsheet(content: bytes, filename: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    name = filename.lower()
    if name.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content), encoding="utf-8", on_bad_lines="skip")
    else:
        df = pd.read_excel(io.BytesIO(content), sheet_name=0, engine="openpyxl")
    if df.empty:
        return [], []
    headers = list(df.columns)
    rows = df.replace({pd.NA: None}).to_dict("records")
    return headers, rows


def read_spreadsheet_best_headers(content: bytes, filename: str, column_map: Dict[str, List[str]]) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Try multiple start rows (0..15) and pick the one with most mapped columns (for CDR with title rows)."""
    name = filename.lower()
    if name.endswith(".csv"):
        full_df = pd.read_csv(io.BytesIO(content), encoding="utf-8", on_bad_lines="skip", header=None)
    else:
        full_df = pd.read_excel(io.BytesIO(content), sheet_name=0, engine="openpyxl", header=None)
    if full_df.empty:
        return [], []

    best_headers, best_rows, best_count = [], [], 0
    for start in range(min(16, len(full_df))):
        df = full_df.iloc[start:]
        df.columns = df.iloc[0]
        df = df[1:].reset_index(drop=True)
        if df.empty:
            continue
        headers = list(df.columns)
        mapping = auto_map_columns(headers, column_map)
        if len(mapping) > best_count:
            best_count = len(mapping)
            best_headers = headers
            best_rows = df.replace({pd.NA: None}).to_dict("records")
    if best_headers:
        return best_headers, best_rows
    headers = list(full_df.iloc[0])
    rows = full_df[1:].replace({pd.NA: None}).to_dict("records")
    return headers, rows


def file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def process_upload(
    db: Session,
    case_id: str,
    data_type: str,
    file_content: bytes,
    filename: str,
    *,
    uploaded_by: Optional[str] = None,
    phone_number: Optional[str] = None,
    period_from: Optional[str] = None,
    period_to: Optional[str] = None,
    notes: Optional[str] = None,
    alias_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parse file, insert records, create evidence_log + data_procurement, rebuild intelligence.
    Returns { "inserted": N, "evidence_log_id": "...", "error": optional }.
    """
    if data_type not in TYPE_CONFIG:
        return {"inserted": 0, "error": f"Unknown data_type: {data_type}"}

    config = TYPE_CONFIG[data_type]
    model_class = config["model"]
    column_map = config["column_map"]

    # Duplicate check by file hash
    fhash = file_hash(file_content)
    existing = db.query(EvidenceLog).filter(
        EvidenceLog.case_id == case_id,
        EvidenceLog.file_hash == fhash,
    ).first()
    if existing:
        return {"inserted": 0, "error": "Duplicate file — this exact file has already been uploaded", "evidence_log_id": existing.id}

    # Parse
    if data_type == "cdr":
        headers, rows = read_spreadsheet_best_headers(file_content, filename, column_map)
    else:
        headers, rows = read_spreadsheet(file_content, filename)
    mapping = auto_map_columns(headers, column_map)
    if not mapping:
        return {"inserted": 0, "error": "No columns could be mapped from the file"}

    db_columns = [c.key for c in model_class.__table__.columns if c.key not in ("id", "raw_data")]
    records = []
    for row in rows:
        rec = map_row_to_record(row, mapping, db_columns)
        rec["case_id"] = case_id
        rec["id"] = str(uuid.uuid4())
        rec["raw_data"] = row
        records.append(rec)

    # Evidence log
    file_path = f"{uploaded_by or 'local'}/{case_id}/{int(datetime.utcnow().timestamp())}_{filename}"
    evidence = EvidenceLog(
        id=str(uuid.uuid4()),
        case_id=case_id,
        file_name=filename,
        file_path=file_path,
        file_hash=fhash,
        file_size=len(file_content),
        record_count=len(records),
        upload_type=data_type,
        uploaded_by=uploaded_by,
    )
    db.add(evidence)
    db.flush()

    # Data procurement
    dp = DataProcurement(
        id=str(uuid.uuid4()),
        case_id=case_id,
        evidence_log_id=evidence.id,
        procured_by=uploaded_by,
        phone_number=phone_number,
        data_type=data_type,
        period_from=_parse_date(period_from) if period_from else None,
        period_to=_parse_date(period_to) if period_to else None,
        notes=notes,
        status="uploaded",
    )
    db.add(dp)

    # Optional alias for detected number
    if phone_number and alias_name:
        existing_alias = db.query(Alias).filter(
            Alias.case_id == case_id,
            Alias.phone_number == phone_number,
        ).first()
        if not existing_alias:
            db.add(Alias(
                id=str(uuid.uuid4()),
                case_id=case_id,
                phone_number=phone_number,
                alias_name=alias_name,
                created_by=uploaded_by,
            ))

    # Insert records in batches
    BATCH = 500
    inserted = 0
    for i in range(0, len(records), BATCH):
        batch = records[i : i + BATCH]
        for r in batch:
            r["file_id"] = evidence.id
        db.bulk_insert_mappings(model_class, batch)
        inserted += len(batch)
    db.commit()

    # Rebuild intelligence for this case
    try:
        rebuild_case_intelligence(db, case_id)
    except Exception:
        pass
    return {"inserted": inserted, "evidence_log_id": evidence.id}
