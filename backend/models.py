from datetime import datetime
from typing import Optional

from sqlalchemy import (
  Column,
  String,
  Integer,
  DateTime,
  Text,
  ForeignKey,
  Float,
  Boolean,
  JSON,
  BigInteger,
)
from sqlalchemy.orm import relationship

from .database import Base


class Case(Base):
  __tablename__ = "cases"

  id = Column(String, primary_key=True, index=True)
  title = Column(String, nullable=False)
  fir_number = Column(String)
  sections = Column(String)
  status = Column(String)
  complainant = Column(String)
  accused = Column(String)
  description = Column(Text)
  case_date = Column(DateTime)
  created_at = Column(DateTime, default=datetime.utcnow)


class CdrRecord(Base):
  __tablename__ = "cdr_records"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  file_id = Column(String)
  calling_number = Column(String, index=True)
  called_number = Column(String, index=True)
  call_date = Column(DateTime, index=True)
  call_type = Column(String)
  duration = Column(Integer)
  imei = Column(String)
  imsi = Column(String)
  cell_id = Column(String)
  tower_lat = Column(Float)
  tower_lng = Column(Float)
  tower_location = Column(String)
  raw_data = Column(JSON)


class IpdrRecord(Base):
  __tablename__ = "ipdr_records"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  file_id = Column(String)
  msisdn = Column(String, index=True)
  source_ip = Column(String)
  destination_ip = Column(String)
  source_port = Column(Integer)
  destination_port = Column(Integer)
  data_volume = Column(BigInteger)
  protocol = Column(String)
  imei = Column(String)
  imsi = Column(String)
  cell_id = Column(String)
  tower_lat = Column(Float)
  tower_lng = Column(Float)
  tower_location = Column(String)
  raw_data = Column(JSON)


class TowerDumpRecord(Base):
  __tablename__ = "tower_dump_records"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  file_id = Column(String)
  mobile_number = Column(String, index=True)
  event_time = Column(DateTime, index=True)
  call_type = Column(String)
  duration = Column(Integer)
  imei = Column(String)
  imsi = Column(String)
  cell_id = Column(String)
  tower_lat = Column(Float)
  tower_lng = Column(Float)
  tower_location = Column(String)
  raw_data = Column(JSON)


class SdrRecord(Base):
  __tablename__ = "sdr_records"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  file_id = Column(String)
  mobile_number = Column(String, index=True)
  subscriber_name = Column(String)
  address = Column(String)
  activation_date = Column(DateTime)
  operator = Column(String)
  circle = Column(String)
  id_type = Column(String)
  id_number = Column(String)
  raw_data = Column(JSON)


class CaseAnalysisSummary(Base):
  __tablename__ = "case_analysis_summary"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), unique=True, index=True, nullable=False)
  total_cdr_records = Column(BigInteger, default=0)
  total_unique_numbers = Column(BigInteger, default=0)
  total_ipdr_records = Column(BigInteger, default=0)
  total_tower_records = Column(BigInteger, default=0)
  total_calls = Column(BigInteger, default=0)
  night_call_percentage = Column(Float, default=0.0)
  frequent_contact_threshold = Column(Integer)
  generated_at = Column(DateTime, default=datetime.utcnow)


class ContactGraph(Base):
  __tablename__ = "contact_graph"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  number_1 = Column(String, index=True)
  number_2 = Column(String, index=True)
  total_calls = Column(BigInteger, default=0)
  first_contact = Column(DateTime)
  last_contact = Column(DateTime)


class NumberIntelligence(Base):
  __tablename__ = "number_intelligence"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  phone_number = Column(String, index=True)
  total_incoming_calls = Column(BigInteger, default=0)
  total_outgoing_calls = Column(BigInteger, default=0)
  total_calls = Column(BigInteger, default=0)
  unique_contacts = Column(BigInteger, default=0)
  night_call_percentage = Column(Float, default=0.0)
  top_contacts = Column(JSON)
  extra_metrics = Column(JSON)
  last_computed_at = Column(DateTime, default=datetime.utcnow)


class ChatLog(Base):
  __tablename__ = "chat_logs"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, index=True, nullable=False)
  user_id = Column(String)
  role = Column(String, nullable=False)
  content = Column(Text, nullable=False)
  created_at = Column(DateTime, default=datetime.utcnow)


class EvidenceLog(Base):
  __tablename__ = "evidence_logs"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  file_name = Column(String, nullable=False)
  file_path = Column(String)
  file_hash = Column(String, index=True)
  file_size = Column(BigInteger)
  record_count = Column(Integer)
  upload_type = Column(String, index=True)
  uploaded_by = Column(String)
  created_at = Column(DateTime, default=datetime.utcnow)


class DataProcurement(Base):
  __tablename__ = "data_procurements"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  evidence_log_id = Column(String, ForeignKey("evidence_logs.id"))
  procured_by = Column(String)
  phone_number = Column(String)
  data_type = Column(String)
  period_from = Column(DateTime)
  period_to = Column(DateTime)
  notes = Column(Text)
  status = Column(String)
  created_at = Column(DateTime, default=datetime.utcnow)


class Alias(Base):
  __tablename__ = "aliases"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  phone_number = Column(String, index=True)
  alias_name = Column(String)
  created_by = Column(String)
  created_at = Column(DateTime, default=datetime.utcnow)


class PersonProfile(Base):
  __tablename__ = "person_profiles"

  id = Column(String, primary_key=True, index=True)
  case_id = Column(String, ForeignKey("cases.id"), index=True, nullable=False)
  name = Column(String, nullable=False)
  role = Column(String)
  phone_numbers = Column(JSON)  # list of strings
  notes = Column(Text)
  created_by = Column(String)
  created_at = Column(DateTime, default=datetime.utcnow)

