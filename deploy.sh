#!/bin/bash
# ============================================================
# Veele — VPS deploy script
# Usage:  bash deploy.sh [--app backoffice|personeel|klant|api|all]
# Default: deploys all apps
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${1:-all}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

cd "$PROJECT_DIR"

# ── 1. Git pull ───────────────────────────────────────────────────────────────
log "Pulling latest code..."
git pull --ff-only || die "git pull failed. Resolve conflicts first."

# ── 2. Dependencies ───────────────────────────────────────────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile

# ── 3. Build & restart helpers ────────────────────────────────────────────────

build_and_restart_backoffice() {
  log "Building backoffice..."
  PORT=3000 pnpm --filter @workspace/backoffice run build

  if pm2 describe veele &>/dev/null; then
    log "Restarting PM2 process: veele"
    pm2 restart veele
  else
    warn "PM2 process 'veele' not found — starting it now"
    pm2 start \
      "PORT=3000 pnpm --filter @workspace/backoffice run start" \
      --name veele \
      --cwd "$PROJECT_DIR"
  fi
}

build_and_restart_personeel() {
  log "Building personeel-pwa..."
  PORT=3002 BASE_PATH=/personeel/ pnpm --filter @workspace/personeel-pwa run build

  if pm2 describe veele-personeel &>/dev/null; then
    log "Restarting PM2 process: veele-personeel"
    pm2 restart veele-personeel
  else
    warn "PM2 process 'veele-personeel' not found — starting it now"
    pm2 start \
      "PORT=3002 BASE_PATH=/personeel/ pnpm --filter @workspace/personeel-pwa run start" \
      --name veele-personeel \
      --cwd "$PROJECT_DIR"
  fi
}

build_and_restart_klant() {
  log "Building klant-pwa..."
  PORT=3003 BASE_PATH=/klant/ pnpm --filter @workspace/klant-pwa run build

  if pm2 describe veele-klant &>/dev/null; then
    log "Restarting PM2 process: veele-klant"
    pm2 restart veele-klant
  else
    warn "PM2 process 'veele-klant' not found — starting it now"
    pm2 start \
      "PORT=3003 BASE_PATH=/klant/ pnpm --filter @workspace/klant-pwa run start" \
      --name veele-klant \
      --cwd "$PROJECT_DIR"
  fi
}

build_and_restart_api() {
  log "Building API server..."
  pnpm --filter @workspace/api-server run build

  if pm2 describe veele-api &>/dev/null; then
    log "Restarting PM2 process: veele-api"
    pm2 restart veele-api
  else
    warn "PM2 process 'veele-api' not found — starting it now"
    pm2 start \
      "pnpm --filter @workspace/api-server run start" \
      --name veele-api \
      --cwd "$PROJECT_DIR"
  fi
}

# ── 4. Run selected apps ──────────────────────────────────────────────────────

case "$APP" in
  backoffice)
    build_and_restart_backoffice
    ;;
  personeel)
    build_and_restart_personeel
    ;;
  klant)
    build_and_restart_klant
    ;;
  api)
    build_and_restart_api
    ;;
  all)
    build_and_restart_backoffice
    build_and_restart_personeel
    build_and_restart_klant
    build_and_restart_api
    ;;
  *)
    die "Unknown app '$APP'. Use: backoffice | personeel | klant | api | all"
    ;;
esac

# ── 5. Save PM2 state ─────────────────────────────────────────────────────────
log "Saving PM2 process list..."
pm2 save

log "Done. PM2 status:"
pm2 status
