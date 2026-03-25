#!/usr/bin/env bash
set -euo pipefail

# ===========================================
# DIP — Digital Investigation Platform
# Complete Offline Setup Script
# ===========================================
# This sets up DIP to run fully offline with:
#   - Local PostgreSQL + Supabase Auth/Storage
#   - Ollama for AI (local LLM)
#   - Static frontend served by nginx
#
# Usage:
#   chmod +x setup-local.sh
#   ./setup-local.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════╗"
echo "║   DIP - Digital Investigation Platform        ║"
echo "║   Offline Setup                               ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# --- Check prerequisites ---
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $1 is not installed. $2${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1 found${NC}"
}

check_cmd "docker" "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
check_cmd "ollama" "Install Ollama: https://ollama.ai/download"

# Check Docker is running
if ! docker info &>/dev/null; then
  echo -e "${RED}✗ Docker is not running. Please start Docker Desktop first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check Ollama is running
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo -e "${YELLOW}⚠ Ollama is not running. Starting it...${NC}"
  ollama serve &
  sleep 3
  if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo -e "${RED}✗ Could not start Ollama. Please run 'ollama serve' manually.${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✓ Ollama is running${NC}"

# --- Check/Pull AI Models ---
echo -e "\n${YELLOW}=== AI Models ===${NC}"

# Check RAM and recommend model
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024)}' || echo "8000000")
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
echo -e "System RAM: ${CYAN}${TOTAL_RAM_GB}GB${NC}"

if [ "$TOTAL_RAM_GB" -le 8 ]; then
  echo -e "${YELLOW}Recommended model for ${TOTAL_RAM_GB}GB RAM: phi3:mini (~2.3GB)${NC}"
  DEFAULT_MODEL="phi3:mini"
else
  echo -e "${YELLOW}Recommended model: mistral:7b (~4GB)${NC}"
  DEFAULT_MODEL="mistral:7b"
fi

# Pull the text model
if ! ollama list | grep -q "${DEFAULT_MODEL}"; then
  echo -e "${YELLOW}Pulling ${DEFAULT_MODEL}... (this may take a few minutes)${NC}"
  ollama pull "${DEFAULT_MODEL}"
else
  echo -e "${GREEN}✓ ${DEFAULT_MODEL} already available${NC}"
fi

# Optionally pull vision model for OCR
echo -e "\n${YELLOW}Vision model (llava:7b) is needed for document OCR.${NC}"
echo -e "${YELLOW}It requires ~4.5GB RAM. On 8GB systems, it may cause slowdowns.${NC}"
read -p "Pull llava:7b for OCR support? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  if ! ollama list | grep -q "llava:7b"; then
    echo -e "${YELLOW}Pulling llava:7b...${NC}"
    ollama pull llava:7b
  else
    echo -e "${GREEN}✓ llava:7b already available${NC}"
  fi
fi

# --- Create .env for docker-compose ---
echo -e "\n${YELLOW}Creating environment configuration...${NC}"
if [ ! -f .env.local ]; then
  cat > .env.local <<EOF
# DIP Offline Configuration
POSTGRES_PASSWORD=dip_secure_password_2024
JWT_SECRET=super-secret-jwt-token-for-dip-offline-mode-change-in-production
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=${DEFAULT_MODEL}
EOF
  echo -e "${GREEN}✓ .env.local created${NC}"
else
  echo -e "${GREEN}✓ .env.local already exists (skipping)${NC}"
fi

# --- Build and start ---
echo -e "\n${YELLOW}Building and starting DIP...${NC}"
docker compose --env-file .env.local up --build -d

echo -e "\n${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   DIP is starting up!                         ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo -e ""
echo -e "  App:          ${CYAN}http://localhost:8080${NC}"
echo -e "  Supabase API: ${CYAN}http://localhost:8000${NC}"
echo -e "  Ollama:       ${CYAN}http://localhost:11434${NC}"
echo -e "  PostgreSQL:   ${CYAN}localhost:54322${NC}"
echo -e ""
echo -e "  AI Model:     ${CYAN}${DEFAULT_MODEL}${NC}"
echo -e ""
echo -e "${YELLOW}First start may take 1-2 minutes for DB migrations.${NC}"
echo -e ""
echo -e "Commands:"
echo -e "  ${GREEN}docker compose logs -f${NC}         # View logs"
echo -e "  ${GREEN}docker compose down${NC}            # Stop"
echo -e "  ${GREEN}docker compose down -v${NC}         # Stop + reset DB"
echo -e ""
echo -e "${YELLOW}Sign up at http://localhost:8080 — emails auto-confirm in offline mode.${NC}"
