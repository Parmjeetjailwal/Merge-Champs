#!/usr/bin/env bash
#
# Installs all dependencies, sets up the database schema (+ demo data),
# builds both apps, and runs the QA Management Application.
#
# Usage:
#   bash setup-and-run.sh              # full setup, build, and run on http://localhost:4000
#   SKIP_SEED=1 bash setup-and-run.sh  # skip loading demo data
#   PORT=8080 bash setup-and-run.sh    # run on a custom port
#
set -euo pipefail

# Always operate from the directory this script lives in (the qa-app root).
cd "$(dirname "$0")"

# --- Prerequisite check ---------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js 18+ and npm are required. Install from https://nodejs.org and re-run." >&2
  exit 1
fi
echo "Using Node $(node -v) / npm $(npm -v)"

# --- 1. Install dependencies ----------------------------------------------
echo "==> Installing root tooling..."
npm install
echo "==> Installing backend dependencies..."
(cd backend && npm install)
echo "==> Installing frontend dependencies..."
(cd frontend && npm install)

# --- 2. Database: Prisma client + schema (+ demo data) --------------------
echo "==> Generating Prisma client and applying the database schema..."
(cd backend && npm run db:generate && npm run db:push)
if [ "${SKIP_SEED:-0}" != "1" ]; then
  echo "==> Seeding demo data..."
  (cd backend && npm run seed)
fi

# --- 3. Build both apps ---------------------------------------------------
echo "==> Building backend..."
(cd backend && npm run build)
echo "==> Building frontend..."
(cd frontend && npm run build)

# --- 4. Run (single server serves the API + the built UI) -----------------
PORT="${PORT:-4000}"
echo ""
echo "==> Starting the QA app on http://localhost:${PORT}  (press Ctrl+C to stop)"
(cd backend && PORT="$PORT" npm start)
