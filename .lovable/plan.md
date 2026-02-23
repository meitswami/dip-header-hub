
# Digital Investigation Platform — Implementation Plan

## Overview
A professional, web-based investigation platform for law enforcement with AI-assisted analysis, case management, CDR/IPDR/SDR data processing, and forensic reporting. Built with React + Supabase + Lovable AI.

---

## 1. Authentication & Role-Based Access
- Login page with email/password authentication
- Three roles: **Admin**, **Investigator**, **Viewer**
- Admin can manage users and assign roles
- Investigators can create cases, upload data, and run queries
- Viewers have read-only access to assigned cases
- Separate `user_roles` table (security best practice)
- Officer profiles with name, badge number, department

## 2. Dashboard
- Overview of active cases with status indicators
- Recent activity feed (uploads, queries, insights)
- Quick stats: total cases, pending analysis, recent alerts
- Case search and filtering
- Professional, dark-themed investigation UI

## 3. Case Management
- Create/edit/archive cases
- Each case stores: FIR number, sections, date, complainant, accused details, status
- Case-level isolation — all data tied to a `case_id`
- Case metadata panel showing FIR structured data
- Assign officers to cases

## 4. Data Upload Module
- Upload CDR, IPDR, Tower Dump, and SDR files (Excel .xlsx/.xls/.csv)
- Column mapping interface — auto-detect and normalize column names
- Preview data before import
- Store file SHA256 hash for evidence integrity
- Upload history with file metadata and hash verification
- Supabase Storage for raw file retention

## 5. Database Schema (Supabase)
Core tables, all with `case_id` foreign key:
- `cases` — case details and status
- `case_metadata` — structured FIR data
- `cdr_records` — call detail records
- `ipdr_records` — IP detail records  
- `tower_dump_records` — tower dump data
- `sdr_records` — subscriber detail records
- `aliases` — name/photo/confidence for numbers
- `person_profiles` — suspect/witness profiles with photo URLs
- `evidence_logs` — file upload audit trail with SHA256 hashes
- `chat_logs` — investigation chat history with SQL snapshots
- `investigation_insights` — auto-generated findings
- `user_roles` — role-based access control
- `profiles` — officer profiles

Indexed on: mobile_number, other_party, date, imei, case_id

## 6. AI Investigation Chat
- ChatGPT-style interface with streaming responses
- **Left panel**: Case selector
- **Center**: Chat conversation with the AI analyst
- **Right panel**: Structured results display (tables, charts)
- AI converts natural language questions → SQL queries → explains results
- System prompt enforces: no fabrication, returns `INSUFFICIENT_DATA` or `NO_DATA_FOUND` when appropriate
- All chats logged with the generated SQL and result snapshots
- Powered by Lovable AI (free, no API key needed)

## 7. Auto-Analysis Engine
When CDR data is uploaded, automatically detect and surface:
- **Frequent contacts** — top contacted numbers
- **Late night patterns** — calls between 11 PM – 5 AM
- **Tower movement anomalies** — unusual location changes
- **IMEI change tracking** — device swaps
- **Contact clustering** — groups of interconnected numbers
- Results stored as "Investigation Insights" per case

## 8. SDR & Alias System
- Upload SDR data and join with CDR during queries
- Add aliases to phone numbers with:
  - Name, photo (stored in Supabase Storage), confidence level
- Display alias + profile photo alongside CDR/query results
- Search across aliases

## 9. Legal Knowledge Base
- Pre-loaded reference data for IPC, CrPC, IT Act, Indian Evidence Act
- AI can reference these when answering legal questions
- Clearly separated from case data
- Searchable reference panel

## 10. Export & Reporting
- **PDF export**: Structured forensic report with case details, FIR info, query asked, SQL generated, results, timestamps, file hash references
- **Excel export**: Raw query results as downloadable spreadsheet
- Report templates with official formatting
- Audit trail included in reports

## 11. Multi-Language Support
- UI supports English and Hindi labels
- AI chat handles English, Hindi, and Hinglish queries

## 12. UI Design
- Professional, dark investigation dashboard theme
- Sidebar navigation with case list
- Serious, minimal design — no playful elements
- Responsive but optimized for desktop use
- Key screens: Login → Dashboard → Case Detail → Data Upload → AI Chat → Reports → Admin Panel

---

## Not Included (requires separate tooling)
- Offline .exe packaging (use Tauri/Electron separately)
- Local AI models (llama.cpp, Whisper, Coqui TTS)
- Offline OCR (Tesseract/PaddleOCR)
- SQLite local database
- OSINT module (would need external API access)
- Speech-to-Text / Text-to-Speech
