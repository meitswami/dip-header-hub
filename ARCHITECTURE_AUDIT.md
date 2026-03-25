# DIP — Architecture Audit

---

## 1️⃣ DATA LAYER

### Database tables used in investigation logic

| Table | Primary key | Columns (Row shape) |
|-------|-------------|---------------------|
| **cases** | id | id, title, fir_number, sections, status, complainant, accused, description, case_date, created_at, updated_at, created_by |
| **cdr_records** | id | id, case_id, calling_number, called_number, call_date, call_type, duration, imei, imsi, cell_id, tower_lat, tower_lng, tower_location, operator, roaming, file_id, raw_data, created_at |
| **ipdr_records** | id | id, case_id, msisdn, session_start, session_end, source_ip, destination_ip, source_port, destination_port, data_volume, protocol, imei, imsi, cell_id, tower_lat, tower_lng, tower_location, file_id, raw_data, created_at |
| **tower_dump_records** | id | id, case_id, mobile_number, event_time, call_type, duration, imei, imsi, cell_id, tower_lat, tower_lng, tower_location, file_id, raw_data, created_at |
| **sdr_records** | id | id, case_id, mobile_number, subscriber_name, address, activation_date, operator, circle, id_type, id_number, file_id, raw_data, created_at |
| **evidence_logs** | id | id, case_id, file_name, file_path, file_hash, file_size, record_count, upload_type, uploaded_by, created_at |
| **data_procurements** | id | id, case_id, evidence_log_id, data_type, phone_number, period_from, period_to, operator_name, request_ref_no, notes, procured_by, status, created_at |
| **aliases** | id | id, case_id, phone_number, alias_name, confidence, created_at, created_by, photo_url |
| **person_profiles** | id | id, case_id, name, role, phone_numbers, notes, photo_url, created_at, created_by |
| **investigation_insights** | id | id, case_id, insight_type, title, description, severity, data, created_at |
| **chat_logs** | id | id, case_id, user_id, role, content, sql_query, result_snapshot, created_at |
| **contact_graph** | id | id, case_id, number_1, number_2, total_calls, first_contact, last_contact. Unique (case_id, number_1, number_2). |
| **case_analysis_summary** | id | id, case_id, total_cdr_records, total_unique_numbers, total_ipdr_records, total_tower_records, total_calls, night_call_percentage, frequent_contact_threshold, generated_at. Unique (case_id). |
| **number_intelligence** | id | id, case_id, phone_number, total_incoming_calls, total_outgoing_calls, total_calls, unique_contacts, night_call_percentage, top_contacts (jsonb), extra_metrics (jsonb), last_computed_at. Unique (case_id, phone_number). |
| **geofences** | id | id, case_id, name, lat, lng, radius_meters, created_at, created_by |
| **geofence_alerts** | id | id, case_id, geofence_id, record_id, record_type, phone_number, event_time, distance_meters, created_at |
| **activity_logs** | id | id, case_id, user_id, action, details, created_at |
| **case_tasks** | id | id, case_id, title, description, status, assigned_to, due_date, created_by, created_at, updated_at |
| **case_assignments** | id | id, case_id, user_id, case_role, created_at |
| **data_access_grants** | id | id, case_id, evidence_log_id, granted_to, granted_by, created_at |
| **case_documents** | id | id, case_id, title, file_path, file_type, file_size, uploaded_by, created_at |
| **case_notes** | id | id, case_id, content, user_id, created_at, updated_at |
| **knowledge_base_documents** | id | id, title, file_path, file_type, content, uploaded_by, created_at |
| **knowledge_base_chunks** | id | id, document_id, chunk_index, chunk_text, created_at |
| **notifications** | id | id, user_id, title, message, notification_type, read, case_id, link, sender_id, created_at |

### Existing indexes (CDR / IPDR / Tower)

- **cdr_records:** `idx_cdr_records_case_calling` on (case_id, calling_number); `idx_cdr_records_case_called` on (case_id, called_number); `idx_cdr_records_call_date` on (call_date).
- **ipdr_records:** `idx_ipdr_records_case_source_ip` on (case_id, source_ip); `idx_ipdr_records_case_destination_ip` on (case_id, destination_ip) (in 20260303082000). Migration 20260303080000 creates an index on (case_id, ip_address); an earlier migration (20260223071428) defines the table with source_ip/destination_ip and no ip_address, so if that schema is active the ip_address index is invalid or unused.
- **tower_dump_records:** `idx_tower_dump_records_case_mobile` on (case_id, mobile_number); `idx_tower_dump_records_cell_id` on (cell_id).
- **case_analysis_summary:** `idx_case_analysis_summary_case_id` on (case_id).
- **contact_graph:** `idx_contact_graph_case_number1` on (case_id, number_1); `idx_contact_graph_case_number2` on (case_id, number_2).
- **number_intelligence:** `idx_number_intel_case_phone` on (case_id, phone_number).

### How Excel (.xlsx / .csv) files are parsed and inserted

- **Parsing:** `src/lib/dataParser.ts`. Uses SheetJS (xlsx). `parseSpreadsheet(file)` for generic .xlsx/.csv: CSV via `file.text()` then `XLSX.read(..., { type: 'string', cellDates: true })`; binary via `file.arrayBuffer()` then `XLSX.read(..., { type: 'array', cellDates: true })`. First sheet only; `sheet_to_json` with defval null; headers = keys of first row; rows = array of objects. For CDR, `parseSpreadsheetBestHeaders(file, columnMap)` tries startRow 0..15 and picks the row that yields the most mapped columns via `autoMapColumns(headers, columnMap)`.
- **Column maps:** CDR_COLUMN_MAP, IPDR_COLUMN_MAP, SDR_COLUMN_MAP, TOWER_COLUMN_MAP map DB column names to lists of header aliases (normalized: lowercased, non-alphanumeric to `_`). `mapRowToRecord(row, mapping)` builds one record per row: each (dbCol, fileCol) in mapping → `record[dbCol] = row[fileCol]` (with Date→ISOString). Keys are the map keys (e.g. calling_number, called_number; for IPDR the map uses ip_address as a key; DB table has source_ip/destination_ip — alignment is parser/insert responsibility).
- **Insert path:** `src/pages/DataUpload.tsx` `handleProcessAll`. User selects case + data type (cdr / ipdr / tower_dump / sdr). Per file: optional alias insert; SHA-256 file hash; upload to Supabase storage `evidence` bucket; `evidence_logs` insert (case_id, file_name, file_path, file_hash, file_size, upload_type, uploaded_by); `data_procurements` insert; `records = rows.map(row => ({ case_id, ...mapRowToRecord(row, entry.mapping), raw_data: row, file_id }))`; insert into `typeConfig.table` (cdr_records, ipdr_records, tower_dump_records, or sdr_records) in batches of 500. After all files for the case, `supabase.rpc('rebuild_case_intelligence', { p_case_id: selectedCase })` is called. If upload type is cdr, `runAutoAnalysis(selectedCase)` runs (JavaScript over fetched CDR) and inserts into `investigation_insights`.

### Pre-aggregation / summary tables

- **case_analysis_summary:** One row per case; total_cdr_records, total_unique_numbers, total_ipdr_records, total_tower_records, total_calls, night_call_percentage, frequent_contact_threshold, generated_at. Populated/updated by `rebuild_case_intelligence(case_id)`.
- **contact_graph:** Undirected pairs (number_1, number_2) with total_calls, first_contact, last_contact per (case_id, number_1, number_2). number_1 &lt; number_2 by convention. Populated by same function.
- **number_intelligence:** Per (case_id, phone_number): total_incoming_calls, total_outgoing_calls, total_calls, unique_contacts, night_call_percentage, top_contacts (jsonb), extra_metrics (jsonb), last_computed_at. Populated by same function.

---

## 2️⃣ INTELLIGENCE LAYER

### Where counts, intersections, and common contacts are computed

- **SQL (PostgreSQL):** In `rebuild_case_intelligence(p_case_id)` (migration 20260303082000): case-level counts and night % from cdr_records via CTEs; contact_graph from cdr_records with LEAST/GREATEST pair normalization; number_intelligence from cdr_records with directional legs and top-3 contacts per number. All run at upload time (after batch insert), not per chat request.
- **JavaScript (frontend) for “common contacts” in chat:** In `AIChat.tsx`, when the query matches common-contact/overlap and two 10-digit numbers are found: full `contact_graph` for the case is fetched (no limit), then neighbor sets for each number are built in JS and intersected to list common contacts. So intersection logic is in JS; data is pre-aggregated in contact_graph.
- **JavaScript (auto-analysis):** `runAutoAnalysis(caseId)` in `src/lib/autoAnalysis.ts` fetches all cdr_records for the case (no limit), then in memory: contact counts, late-night filter, IMEI grouping, tower diversity, contact pairs; results written to `investigation_insights`. Runs after CDR upload, not during chat.

### Computation: SQL vs JavaScript loops

- **SQL:** All of `rebuild_case_intelligence` (case summary, contact_graph, number_intelligence) is PL/pgSQL and SQL. No row-by-row loops in application for these aggregates.
- **JavaScript loops:** Used in (1) AIChat common-contact branch: one `.from('contact_graph').select(...).eq('case_id', selectedCase)` then building Sets and intersecting in JS; (2) autoAnalysis: full CDR fetch then forEach/count/filter in JS.

### Contact graph / summary table

- **contact_graph** exists; one row per (case_id, number_1, number_2) with total_calls, first_contact, last_contact. number_1 &lt; number_2. Built from cdr_records by `rebuild_case_intelligence`.
- **case_analysis_summary** and **number_intelligence** exist as above.

### Heavy computation during chat request

- **Edge function (single intelligence source):** All telecom analysis is done in the edge via SQL/RPC only. Deterministic intents (no LLM): (A) direct interconnection (contact_graph); (B) common contacts (get_common_contacts RPC); (C) number summary (number_intelligence); (D) case summary (case_analysis_summary); (E) top contacts for a number (number_intelligence.top_contacts); (F) most active numbers (number_intelligence ordered by total_calls). LLM only for narrative/summarise/format; context is compact; no raw CDR/IPDR/Tower/SDR rows sent to LLM. No frontend fallback; on edge failure UI shows "AI service unavailable. Try again."
- **Primary path (edge function):** No heavy computation. Edge function reads only precomputed tables: case_analysis_summary, contact_graph (limit 50), number_intelligence (limit 50), plus cases, aliases, person_profiles, investigation_insights, geofences, geofence_alerts (limit 50/20). Builds a text context and sends to Ollama. No raw CDR scan.
- **Structured-query path (frontend):** For “direct call / interconnection” and “common contacts,” frontend queries contact_graph only (one filtered query for direct; one full-case fetch for common contacts). For “interaction pattern,” frontend queries number_intelligence for one number. No raw CDR in these paths.
- **Fallback path (frontend direct to Ollama):** When edge function is unavailable, frontend fetches up to 3000 cdr_records, 1500 ipdr_records, 1500 tower_dump_records, 500 sdr_records, plus persons, aliases, evidence_logs, data_procurements, then builds a large caseContext string and sends it to Ollama. So in fallback, heavy data fetch and string build happen during the chat request; no server-side aggregation.

---

## 3️⃣ AI LAYER

### Ollama model (default and configurable)

- **Default:** `phi3:mini`. Env: `OLLAMA_MODEL` (edge), and in frontend `localStorage` key `dip-ollama-settings` with `{ url, model }` (default model `phi3:mini`).
- **Configurable:** Frontend sends `ollamaUrl` and `ollamaModel` in the body to the ai-chat edge function. Edge uses `ollamaModel || DEFAULT_OLLAMA_MODEL`. Frontend reads url/model from `localStorage.getItem('dip-ollama-settings')` (Settings page and AIChat).

### Parameters (temperature, num_predict, etc.)

- **Edge function (supabase/functions/ai-chat/index.ts):** Request to Ollama is `{ model, messages: [system, ...messages], stream: true }`. No `temperature`, `num_predict`, or `options` passed.
- **Frontend fallback (AIChat.tsx):** When calling Ollama directly, body includes `options: { num_predict: 80 }`. No temperature set.

### Average size of context sent to model

- **Edge path:** Context = case metadata (title, FIR, sections, status, complainant, accused, description) + aliases list + person_profiles list + investigation_insights list + precomputed analytics string (one summary line + up to 20 number_intelligence rows + up to 30 contact_graph edges) + geofences + up to 20 geofence_alerts + optional KB chunks (up to 15). No raw CDR rows. Typical size on the order of low thousands of characters to low tens of thousands depending on case size.
- **Fallback path:** Same metadata plus up to 3000 CDR rows (calling_number, called_number, call_date, call_type) concatenated into a single text block, plus 1500 IPDR, 1500 tower, 500 SDR, file mappings, person/alias lines. Can reach hundreds of thousands of characters for large cases.

### Whether raw CDR rows are sent to the model

- **Edge function:** No. Only precomputed summary, contact_graph rows (limit 50), and number_intelligence rows (limit 50) are included as text.
- **Fallback (frontend → Ollama):** Yes. Up to 3000 cdr_records (selected columns) are fetched and embedded in the system prompt as part of caseContext.

### Where the system prompt is constructed

- **Edge function:** In `supabase/functions/ai-chat/index.ts` inside the request handler: `caseContext` is built from DB reads, then `systemPrompt` is a template string that includes caseContext, optional kbContext, style (simple/intermediate/expert), and fixed rules. That prompt is sent as the first message in the `messages` array to Ollama.
- **Frontend fallback:** In `src/pages/AIChat.tsx` inside `sendMessage`, when `useFallback === true`: `caseContext` is built from the large Promise.all fetch (CDR/IPDR/tower/SDR/persons/aliases/evidence/procurements) and optional two-number common-contact logic; then `systemPrompt` is built with that caseContext and style line and sent with `options: { num_predict: 80 }` to `getOllamaFetchBase(url)` + `/v1/chat/completions`.

### Fallback behavior logic

- Frontend first tries `fetch(CHAT_URL, { method: 'POST', body: JSON.stringify({ messages, caseId, ollamaUrl, ollamaModel, styleLevel }) })` where CHAT_URL = `VITE_SUPABASE_URL/functions/v1/ai-chat`.
- If `!resp?.ok || !resp?.body`, `useFallback = true`. Frontend then fetches all case data (CDR 3000, IPDR 1500, tower 1500, SDR 500, persons, aliases, evidence, procurements), builds caseContext and systemPrompt, and calls Ollama at `getOllamaFetchBase(ollamaSettings.url)` with `options: { num_predict: 80 }`. Stream is consumed in the same way; after stream, `normalizeAndTrim` (max 2 sentences, 250 chars) is applied to the assistant reply.

---

## 4️⃣ REQUEST FLOW — "Do these two numbers interconnect?"

Step-by-step for the exact query: *Do these two numbers interconnect?* (with two 10-digit numbers in the message).

1. **UI (AIChat.tsx)**  
   User submits. `sendMessage()` runs: input trimmed, user message appended to state, input cleared, loading true, AbortController created.

2. **Structured-query detection (frontend)**  
   `normalizedQuery = userMsg.content.toLowerCase()`, `numbers = userMsg.content.match(/\d{10}/g) || []`.  
   Condition: `/direct(ly)? call|inter.?connection|interaction between|link between/.test(normalizedQuery) && numbers.length >= 2`.  
   The phrase “interconnect” matches `inter.?connection`; if two 10-digit numbers are present, this branch is taken.

3. **Database (frontend, Supabase client)**  
   `supabase.from('contact_graph').select('number_1, number_2, total_calls').eq('case_id', selectedCase).or('and(number_1.eq.${a},number_2.eq.${b}),and(number_1.eq.${b},number_2.eq.${a})').limit(1)`.  
   Single row read from contact_graph (indexed by case_id and number_1/number_2). No backend/edge or Ollama is called.

4. **Response formation (frontend)**  
   If error: `replyAndReturn('Unable to read call link data right now.')`.  
   If no row or total_calls &lt;= 0: `replyAndReturn('There are no direct calls recorded between ${a} and ${b} in this case.')`.  
   Else: `replyAndReturn('Yes, ${a} and ${b} call each other with ${edge.total_calls} total calls in this case.')`.

5. **Persistence and UI update**  
   `replyAndReturn` appends the assistant message to state, inserts user and assistant rows into `chat_logs` (case_id, user_id, content, role), sets loading false, and returns. The rest of `sendMessage` (CHAT_URL fetch, Ollama, stream) is not executed.

6. **Rendering**  
   React state update causes the new assistant message to render in the chat UI (and optional TTS if enabled). No AI stream or backend is involved for this path.

So for this query: **UI → frontend detection → Supabase (contact_graph) → frontend reply string → chat_logs insert → UI update**. No backend function and no LLM are used when the structured “direct interconnection” branch is taken.

---

## 5️⃣ PERFORMANCE PROFILE

### Average CDR rows per case

- Not fixed in code. Depends on uploads. Batch insert is 500 rows per chunk; there is no hard cap on total rows per case.

### Maximum rows fetched per chat

- **Edge function:** No raw CDR fetch. Precomputed: contact_graph limit 50, number_intelligence limit 50; geofence_alerts limit 50; knowledge_base_chunks limit 15.
- **Frontend fallback:** cdr_records 3000, ipdr_records 1500, tower_dump_records 1500, sdr_records 500. So up to 6500 rows total per fallback chat request.
- **Frontend structured (common contacts):** One unbounded select on contact_graph for the case (all edges for that case_id). No limit in code.

### RAM usage during active chat

- Not measured in code. Dominant factors: (1) React state (messages array, possibly long caseContext in fallback); (2) fallback path: up to 3000 + 1500 + 1500 + 500 rows and a large string built from them; (3) streaming buffer and decoded text in AIChat. No explicit pooling or streaming of context; full context is held in memory for the request.

### Large arrays in memory

- **Fallback path:** Arrays `cdrRes.data` (up to 3000), `ipdrRes.data` (1500), `towerRes.data` (1500), `sdrRes.data` (500) and the derived `focusRows`/`rows` and built `caseContext` string are kept for the duration of the request. `caseContext` is then sent in the system prompt.
- **Common-contacts structured path:** Full `contact_graph` for the case is fetched into `data` and iterated to build `neighborsA` and `neighborsB` Sets. For cases with many distinct pairs, this can be a large array.
- **Other components:** CaseDataSummary fetches cdr_records limit 5000; TimelineReconstruction 2000 CDR + 1000 IPDR + 1000 tower; CommonNumberAnalysis 5000; CDRVisualization 1000; CrossCDRCommonNumbers 10000 CDR and 10000 tower_dump; TowerMap 500 CDR + 500 tower. These are not necessarily active during chat but show where large reads occur.

### Potential bottlenecks

- **Fallback path:** Single chat can pull 6500 rows and build a very large prompt; high memory and latency for large cases. Same flow also does multiple Promise.all fetches and string concatenation on the main thread.
- **contact_graph common-contacts path:** Unbounded select of all contact_graph rows for the case; for cases with many numbers/pairs, this can be large and slow.
- **Index consistency:** One migration indexes ipdr on `ip_address`; schema has `source_ip`/`destination_ip`. If that migration ran, the index may be invalid or on a non-existent column depending on DB state.
- **Rebuild on every upload:** `rebuild_case_intelligence` runs after all files in a batch; for very large batches or cases, this single RPC can be slow and blocks the “Import complete” toast.
- **No pagination:** Chat history load fetches all chat_logs for the case ordered by created_at; large histories increase load time and memory.
