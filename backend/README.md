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

Set `OLLAMA_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `phi3:mini`). Used only for non-structured chat replies.
