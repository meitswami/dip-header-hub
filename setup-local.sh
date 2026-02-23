#!/usr/bin/env bash
set -euo pipefail

# ===========================================
# CDR Investigation Platform - Local Setup
# ===========================================
# Prerequisites:
#   1. Docker Desktop (running)
#   2. Node.js >= 18
#   3. Supabase CLI:  npm install -g supabase
#
# Usage:
#   chmod +x setup-local.sh
#   ./setup-local.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== CDR Investigation Platform - Local Setup ===${NC}"

# --- Check prerequisites ---
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $1 is not installed. $2${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1 found${NC}"
}

check_cmd "docker" "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
check_cmd "node" "Install Node.js >= 18: https://nodejs.org"
check_cmd "supabase" "Install: npm install -g supabase"

# Check Docker is running
if ! docker info &>/dev/null; then
  echo -e "${RED}✗ Docker is not running. Please start Docker Desktop first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# --- Install Node dependencies ---
echo -e "\n${YELLOW}Installing Node dependencies...${NC}"
npm install

# --- Start Supabase locally ---
echo -e "\n${YELLOW}Starting local Supabase (PostgreSQL, Auth, Storage, Edge Functions)...${NC}"
echo -e "${YELLOW}This will automatically apply all migrations from supabase/migrations/${NC}"
supabase start

# --- Extract keys from supabase status ---
echo -e "\n${YELLOW}Extracting local Supabase credentials...${NC}"
API_URL=$(supabase status --output json 2>/dev/null | grep -o '"API URL":"[^"]*"' | cut -d'"' -f4 || echo "http://localhost:54321")
ANON_KEY=$(supabase status --output json 2>/dev/null | grep -o '"anon key":"[^"]*"' | cut -d'"' -f4 || echo "")
SERVICE_KEY=$(supabase status --output json 2>/dev/null | grep -o '"service_role key":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -z "$ANON_KEY" ]; then
  echo -e "${YELLOW}Could not auto-extract keys. Run 'supabase status' and copy them manually.${NC}"
  echo -e "${YELLOW}Then update your .env file.${NC}"
else
  # --- Create .env ---
  cat > .env <<EOF
VITE_SUPABASE_URL=${API_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local
EOF
  echo -e "${GREEN}✓ .env created with local credentials${NC}"
fi

# --- Create initial admin user ---
echo -e "\n${YELLOW}=== Create Admin User ===${NC}"
echo -e "You can create a user via the local Supabase Studio at:"
echo -e "  ${GREEN}http://localhost:54323${NC}"
echo -e "Or sign up through the app after starting it."

# --- Edge Functions ---
echo -e "\n${YELLOW}=== Edge Functions ===${NC}"
echo -e "To run edge functions locally:"
echo -e "  ${GREEN}supabase functions serve${NC}"
echo -e ""
echo -e "Set secrets for edge functions:"
echo -e "  ${GREEN}echo 'LOVABLE_API_KEY=your-key' >> supabase/.env${NC}"
echo -e "  ${GREEN}supabase functions serve --env-file supabase/.env${NC}"

# --- Storage Buckets ---
echo -e "\n${YELLOW}Creating storage buckets...${NC}"
# These will be created via the seed script or manually
echo -e "Storage buckets (evidence, knowledge-base, case-documents) need to be"
echo -e "created via Supabase Studio at ${GREEN}http://localhost:54323/storage${NC}"

# --- Start the app ---
echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo -e ""
echo -e "Start the development server:"
echo -e "  ${GREEN}npm run dev${NC}"
echo -e ""
echo -e "Access points:"
echo -e "  App:             ${GREEN}http://localhost:5173${NC}"
echo -e "  Supabase Studio: ${GREEN}http://localhost:54323${NC}"
echo -e "  Supabase API:    ${GREEN}${API_URL}${NC}"
echo -e ""
echo -e "To stop Supabase:"
echo -e "  ${GREEN}supabase stop${NC}"
echo -e ""
echo -e "To reset database (re-apply all migrations):"
echo -e "  ${GREEN}supabase db reset${NC}"
