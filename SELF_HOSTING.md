# Self-Hosting Guide — DIP (Digital Investigation Platform)

Run the entire platform offline on your own machine. No cloud dependency required.

---

## Option A: Docker Compose (Recommended — One Command)

The simplest way to get everything running locally.

### Prerequisites

| Tool | Install |
|------|---------|
| **Docker Desktop** | [docker.com](https://www.docker.com/products/docker-desktop) |

### Quick Start

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd <project-folder>

# 2. Start everything (PostgreSQL, Auth, Storage, Vite dev server)
docker compose up

# 3. Open the app
open http://localhost:5173
```

### Access Points

| Service | URL |
|---------|-----|
| **App** | http://localhost:5173 |
| **Supabase Studio** (DB admin) | http://localhost:54323 |
| **PostgreSQL** | `localhost:54322` (user: `postgres`, pass: `postgres`) |

### Commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f app

# Stop (preserves data)
docker compose down

# Stop and delete ALL data
docker compose down -v

# Rebuild after code changes
docker compose up --build
```

---

## Option B: Supabase CLI + Manual Setup

More control, runs Supabase services individually via Docker.

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Docker Desktop** | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Supabase CLI** | Latest | `npm install -g supabase` |

### Quick Start

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd <project-folder>

# 2. Run the setup script (installs deps, starts Supabase, creates .env)
chmod +x setup-local.sh
./setup-local.sh

# 3. Start the app
npm run dev
```

Open **http://localhost:5173** in your browser.

### Manual Setup

```bash
# Install dependencies
npm install

# Start local Supabase (applies all migrations automatically)
supabase start

# Check the output for your local credentials
supabase status

# Create .env from the template
cp .env.example .env
# Edit .env with the API URL and anon key from `supabase status`

# Start dev server
npm run dev
```

---

## What `supabase start` Does

1. **Spins up Docker containers** for PostgreSQL, Auth (GoTrue), Storage, PostgREST, and Realtime
2. **Applies all migrations** from `supabase/migrations/` — recreates all 18+ tables, RLS policies, functions, and triggers
3. **Runs `supabase/seed.sql`** — creates storage buckets and their policies
4. **Provides local endpoints**:
   - API: `http://localhost:54321`
   - Studio (DB admin UI): `http://localhost:54323`
   - Inbucket (email testing): `http://localhost:54324`

---

## Edge Functions (AI Chat, KB Processing, Data Export)

```bash
# Serve edge functions locally
supabase functions serve --env-file supabase/.env

# Create supabase/.env with required secrets:
echo "LOVABLE_API_KEY=your-api-key-here" > supabase/.env
```

Edge functions will be available at `http://localhost:54321/functions/v1/<function-name>`.

### Available Edge Functions

| Function | Purpose |
|----------|---------|
| `ai-chat` | AI analyst chat powered by LLM |
| `kb-query` | Knowledge base semantic search |
| `process-kb-document` | Document chunking for KB |
| `data-export` | Admin data export (JSON/SQL) |

---

## Data Export (Admin)

Admins can export all case data from the app UI at **Admin → Data Export**, or call the edge function directly:

```bash
# Export all data as JSON
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:54321/functions/v1/data-export?format=json" > export.json

# Export single case as SQL
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:54321/functions/v1/data-export?format=sql&case_id=CASE_UUID" > case.sql

# Import into another Supabase instance
psql postgresql://postgres:postgres@localhost:54322/postgres < case.sql
```

---

## Creating Your First Admin User

1. Open the app at `http://localhost:5173`
2. Sign up with email/password
3. Confirm email via **Inbucket** at `http://localhost:54324`
4. Promote yourself to admin:

```bash
# Open Supabase Studio
open http://localhost:54323

# Or via SQL:
supabase db execute "INSERT INTO user_roles (user_id, role) 
  SELECT id, 'admin' FROM auth.users WHERE email = 'your@email.com';"
```

---

## Exporting & Importing Data

### Export from Cloud (if you have data to migrate)

```bash
# Export schema + data as SQL dump
supabase db dump --data-only > data-export.sql

# Or use the Data Export feature in the app UI (Admin → Data Export)
```

### Import into Local

```bash
# Import data into your local instance
psql postgresql://postgres:postgres@localhost:54322/postgres < data-export.sql
```

---

## Resetting the Database

```bash
# Drops everything and re-applies all migrations + seed
supabase db reset
```

---

## Stopping & Cleanup

```bash
# Stop all Supabase containers (preserves data)
supabase stop

# Stop and remove all data
supabase stop --no-backup
```

---

## Production Deployment

For production, build and serve the frontend with nginx:

```bash
# Build the production Docker image
docker build -t dip-app .

# Run it
docker run -p 80:80 \
  -e VITE_SUPABASE_URL=http://your-supabase-host:54321 \
  -e VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key \
  dip-app
```

---

## Project Structure (Self-Hosting Relevant)

```
├── docker-compose.yml        # One-command local setup
├── Dockerfile                # Production build (nginx)
├── nginx.conf                # Nginx config for SPA routing
├── setup-local.sh            # Supabase CLI setup script
├── .env.example              # Template for local environment variables
├── supabase/
│   ├── config.toml           # Supabase local config
│   ├── migrations/           # All database migrations (auto-applied)
│   ├── seed.sql              # Storage buckets & initial data
│   └── functions/            # Edge functions (ai-chat, kb-query, data-export, etc.)
└── src/                      # React frontend
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `docker compose up` fails | Make sure Docker Desktop is running |
| `supabase start` fails | Make sure Docker Desktop is running |
| Can't sign up | Check Inbucket at `localhost:54324` for confirmation emails |
| Edge functions error | Create `supabase/.env` with required API keys |
| Port conflicts | Stop other services on ports 5173, 54321-54324 |
| Missing tables | Run `supabase db reset` to re-apply all migrations |
| Data export 403 | Ensure your user has the `admin` role in `user_roles` |
