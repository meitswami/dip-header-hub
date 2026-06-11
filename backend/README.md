# DIP Backend (FastAPI)

Lightweight local backend for the Digital Investigation Platform. No Supabase or Docker required.

## Setup

From the **repository root**:

```bash
pip install -r backend/requirements.txt
```

## Database and where data is stored

- **SQLite (default):** If `DIP_DB_URL` is not set, all data is stored in a single SQLite file: **`dip.db`** in the directory from which you start the server (typically the repo root).  
  So when you run from repo root, uploaded and parsed data (CDR, IPDR, Tower, SDR, evidence logs, data procurements, case summaries, contact graph, number intelligence) is stored in **`dip.db`** at the repo root. The uploaded Excel/CSV file itself is **not** saved to disk—only the parsed records are written to the database.
- **PostgreSQL:** Set `DIP_DB_URL=postgresql+psycopg2://user:password@localhost:5432/dip`; then all data is stored in that PostgreSQL database.

## Run

From the **repository root**:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

On Windows PowerShell, from repo root you can instead run: `.\run_backend.bat` (the `.\` is required).

Frontend: from repo root run `npm run dev`. App at `http://localhost:5173`; API at `http://localhost:8000` (or set `VITE_API_URL`).

## Endpoints

- `POST /chat` — Intent routing; SQL/RPC for telecom queries, Ollama for narrative.
- `POST /upload` — Excel/CSV parse, insert CDR/IPDR/Tower/SDR, rebuild intelligence.
- `GET /cases`, `POST /cases`, `GET /cases/{id}`, `GET /cases/{id}/summary`, `GET /cases/{id}/stats`
- `GET /cases/{id}/aliases`, `POST /aliases`, `DELETE /aliases/{id}`
- `GET /cases/{id}/person_profiles`, `POST /person_profiles`, `PATCH /person_profiles/{id}`
- `GET /cases/{id}/cdr`, `GET /cases/{id}/cdr_sample?number=`, `GET /cases/{id}/numbers?q=`
- `GET /cases/{id}/chat_logs`, `GET /cases/{id}/summary_stats`

## Ollama

Set `OLLAMA_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `qwen2.5:3b-instruct`) for the fast chat tier. The accurate tier uses `OLLAMA_MODEL_ACCURATE` (default `qwen2.5:7b-instruct`). Pull them once:

```bash
ollama pull qwen2.5:3b-instruct
ollama pull qwen2.5:7b-instruct
```

## Knowledge Base / RAG endpoints

- `POST /kb/upload` — ingest a document (PDF, DOCX, PPTX, XLSX/CSV/TSV, TXT, SQL, images). `case_id` optional (omit for global KB).
- `GET  /kb/files` — list ingested documents (filter by `case_id`, `include_global`).
- `DELETE /kb/files/{id}` — remove a document and its chunks.
- `POST /kb/query` — grounded Q&A over the KB, returns `{ content, citations[] }`.
- `POST /kb/search` — retrieval only (no LLM), handy for debugging rankings.
- `GET  /kb/status` — embedding + reranker + chat-model status.
- `POST /chat/stream` — Server-Sent Events chat: first frame is `{type:"meta", citations}`, then many `{type:"delta", content}`, finally `{type:"done"}`.

Environment variables:

| Var | Default | Meaning |
| --- | --- | --- |
| `DIP_EMBEDDING_MODEL` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | Local embedding model (Hindi + English) |
| `DIP_USE_RERANKER` | `0` | Set `1` to enable cross-encoder rescoring |
| `DIP_RERANKER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Rescorer model |
| `DIP_KB_MAX_CHUNKS` | `5000` | Per-document chunk cap (bounds very large files) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `qwen2.5:3b-instruct` | Fast-tier chat model |
| `OLLAMA_MODEL_ACCURATE` | `qwen2.5:7b-instruct` | Accurate-tier chat model |
| `DIP_SECRET_KEY` | *(dev-only default)* | Fernet key (base64 32B) used to encrypt MySQL passwords. **Set a unique value in production.** |

OCR for images / scanned PDFs requires the Tesseract binary + language packs (`eng`, `hin`) installed system-wide. Windows: <https://github.com/UB-Mannheim/tesseract/wiki>.

## External MySQL connector

Admin-only. Saves (host, port, database, username, encrypted password) in `mysql_connections`. Endpoints:

- `GET/POST/PATCH/DELETE /mysql/connections[/{id}]`
- `POST /mysql/connections/{id}/test` — verify connectivity
- `GET  /mysql/connections/{id}/schema` — list tables + columns via `information_schema`
- `GET  /mysql/connections/{id}/tables/{table}/sample?limit=50`
- `POST /mysql/connections/{id}/query` — body `{ sql, max_rows }`. **Only** `SELECT / SHOW / DESCRIBE / EXPLAIN` accepted; multi-statement batches rejected; 15s session timeout; max 500 rows/query.

## Field dictionary / `/explain`

- `GET /explain?term=msisdn&case_id=...` returns a human-readable definition plus up to 3 example values from the given case. The underlying dictionary is `backend/data/field_dictionary.json` — edit freely to add more terms.
