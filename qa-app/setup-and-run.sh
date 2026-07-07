#!/usr/bin/env bash
#
# One-shot bootstrapper for the QA Management Application.
#
# It will, in order:
#   1. Detect and (if missing) INSTALL the required tooling — Node.js + npm —
#      plus a download helper (curl/wget), using whatever package manager the
#      machine provides (apt, dnf/yum, pacman, zypper, apk, Homebrew, winget,
#      choco) and falling back to nvm when no suitable system installer works.
#   2. Install all project dependencies (root, backend, frontend).
#   3. Set up the database (Prisma client + schema, optional demo data).
#   4. Build both apps.
#   5. Run the test suite.
#   6. Start the app (single server serving the API + the built UI).
#
# Usage:
#   bash setup-and-run.sh                 # install (as needed), build, test, run on :4000
#   SKIP_SEED=1  bash setup-and-run.sh    # skip loading demo data
#   SKIP_TESTS=1 bash setup-and-run.sh    # skip running the test suite
#   NO_RUN=1     bash setup-and-run.sh    # do everything except start the server
#   PORT=8080    bash setup-and-run.sh    # run on a custom port
#   NODE_VERSION=22 bash setup-and-run.sh # target a specific Node major when installing
#
set -euo pipefail

# Always operate from the directory this script lives in (the qa-app root).
cd "$(dirname "$0")"

# ---- Configuration -------------------------------------------------------
REQUIRED_NODE_MAJOR="${NODE_VERSION:-20}"   # LTS major to install when Node is missing
MIN_NODE_MAJOR=18                            # minimum version the app supports

# ---- Pretty logging ------------------------------------------------------
if [ -t 1 ]; then
  C_INFO=$'\033[1;36m'; C_OK=$'\033[1;32m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_OFF=$'\033[0m'
else
  C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_OFF=''
fi
log()  { echo "${C_INFO}==>${C_OFF} $*"; }
ok()   { echo "${C_OK}OK:${C_OFF} $*"; }
warn() { echo "${C_WARN}WARN:${C_OFF} $*" >&2; }
err()  { echo "${C_ERR}ERROR:${C_OFF} $*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

# ---- Privilege / OS / package-manager detection --------------------------
SUDO=''
if [ "$(id -u)" -ne 0 ] && have sudo; then SUDO='sudo'; fi

# Run a command with root privileges (uses sudo -E when available, else as-is).
run_root() {
  if [ -n "$SUDO" ]; then $SUDO -E "$@"; else "$@"; fi
}

OS='unknown'
case "$(uname -s)" in
  Linux*)               OS='linux' ;;
  Darwin*)              OS='macos' ;;
  MINGW*|MSYS*|CYGWIN*) OS='windows' ;;
esac

PKG=''
for m in apt-get dnf yum pacman zypper apk brew winget choco; do
  if have "$m"; then PKG="$m"; break; fi
done

# Install one or more OS packages using whatever package manager exists.
pkg_install() {
  [ "$#" -eq 0 ] && return 0
  case "$PKG" in
    apt-get) run_root apt-get update -y && run_root apt-get install -y "$@" ;;
    dnf)     run_root dnf install -y "$@" ;;
    yum)     run_root yum install -y "$@" ;;
    pacman)  run_root pacman -Sy --noconfirm "$@" ;;
    zypper)  run_root zypper install -y "$@" ;;
    apk)     run_root apk add --no-cache "$@" ;;
    brew)    brew install "$@" ;;
    winget)  for p in "$@"; do winget install -e --id "$p" --accept-source-agreements --accept-package-agreements || true; done ;;
    choco)   choco install -y "$@" ;;
    *)       return 1 ;;
  esac
}

# ---- Download helper (curl or wget), installed if neither exists ----------
DOWNLOADER=''
ensure_downloader() {
  if have curl; then DOWNLOADER='curl'; return 0; fi
  if have wget; then DOWNLOADER='wget'; return 0; fi
  log "Installing a download tool (curl)..."
  pkg_install curl || pkg_install wget || true
  if have curl; then DOWNLOADER='curl'; return 0; fi
  if have wget; then DOWNLOADER='wget'; return 0; fi
  return 1
}

fetch() { # fetch <url> -> stdout
  if [ "$DOWNLOADER" = 'curl' ]; then curl -fsSL "$1"; else wget -qO- "$1"; fi
}

# ---- Node.js version helpers ---------------------------------------------
node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

node_ok() {
  have node || return 1
  have npm  || return 1
  local maj; maj="$(node_major)"
  [ -n "$maj" ] && [ "$maj" -ge "$MIN_NODE_MAJOR" ]
}

source_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && return 0
  return 1
}

# ---- Node.js installation strategies -------------------------------------
install_node_brew() {
  if ! have brew; then
    log "Installing Homebrew..."
    ensure_downloader || return 1
    NONINTERACTIVE=1 /bin/bash -c "$(fetch https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || return 1
    for p in /opt/homebrew/bin/brew /usr/local/bin/brew "$HOME/.linuxbrew/bin/brew" /home/linuxbrew/.linuxbrew/bin/brew; do
      [ -x "$p" ] && eval "$("$p" shellenv)" && break
    done
  fi
  brew install "node@${REQUIRED_NODE_MAJOR}" || brew install node || return 1
  brew link --overwrite --force "node@${REQUIRED_NODE_MAJOR}" 2>/dev/null || true
}

install_node_nodesource() {
  ensure_downloader || return 1
  case "$PKG" in
    apt-get)
      fetch "https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | run_root bash - || return 1
      run_root apt-get install -y nodejs || return 1
      ;;
    dnf|yum)
      fetch "https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | run_root bash - || return 1
      run_root "$PKG" install -y nodejs || return 1
      ;;
    *) return 1 ;;
  esac
}

install_node_syspkg() {
  case "$PKG" in
    pacman|zypper|apk) pkg_install nodejs npm ;;
    winget)            pkg_install OpenJS.NodeJS.LTS ;;
    choco)             pkg_install nodejs-lts ;;
    *)                 return 1 ;;
  esac
}

install_node_nvm() {
  ensure_downloader || return 1
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    log "Installing nvm (Node Version Manager)..."
    fetch "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh" | bash || return 1
  fi
  source_nvm || return 1
  nvm install "$REQUIRED_NODE_MAJOR" || nvm install --lts || return 1
  nvm use "$REQUIRED_NODE_MAJOR" >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
  nvm alias default "$REQUIRED_NODE_MAJOR" >/dev/null 2>&1 || true
}

ensure_node() {
  if node_ok; then
    ok "Node $(node -v) / npm $(npm -v) already installed."
    return 0
  fi
  # nvm may be installed but not yet sourced in this shell.
  if source_nvm && node_ok; then
    ok "Node $(node -v) / npm $(npm -v) (via nvm)."
    return 0
  fi

  warn "Node.js ${MIN_NODE_MAJOR}+ / npm not found (or too old). Installing Node ${REQUIRED_NODE_MAJOR}..."
  case "$OS" in
    macos)   install_node_brew || install_node_nvm || true ;;
    windows) install_node_syspkg || install_node_nvm || true ;;
    linux)
      case "$PKG" in
        apt-get|dnf|yum)   install_node_nodesource || install_node_nvm || true ;;
        pacman|zypper|apk) install_node_syspkg     || install_node_nvm || true ;;
        brew)              install_node_brew       || install_node_nvm || true ;;
        *)                 install_node_nvm || true ;;
      esac
      ;;
    *) install_node_nvm || true ;;
  esac

  source_nvm || true          # in case the nvm path was used
  hash -r 2>/dev/null || true # forget cached command locations

  if node_ok; then
    ok "Installed Node $(node -v) / npm $(npm -v)."
  else
    err "Automatic Node.js installation failed."
    err "Please install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org and re-run this script."
    exit 1
  fi
}

# ==========================================================================
log "Environment: os=${OS}, package-manager=${PKG:-none}, privilege=$([ -n "$SUDO" ] && echo sudo || echo root/direct)"

# --- 0. Prerequisite tooling ----------------------------------------------
ensure_node
echo "Using Node $(node -v) / npm $(npm -v)"

# --- 1. Install dependencies ----------------------------------------------
log "Installing root tooling..."
npm install
log "Installing backend dependencies..."
(cd backend && npm install)
log "Installing frontend dependencies..."
(cd frontend && npm install)

# --- 2. Database: Prisma client + schema (+ demo data) --------------------
if [ ! -f backend/.env ]; then
  log "Creating backend/.env with default settings..."
  cat > backend/.env <<'EOF'
DATABASE_URL="file:./dev.db"
PORT=4000
EOF
fi
log "Generating Prisma client and applying the database schema..."
(cd backend && npm run db:generate && npm run db:push)
if [ "${SKIP_SEED:-0}" != "1" ]; then
  log "Seeding demo data..."
  (cd backend && npm run seed)
fi

# --- 3. Build both apps ---------------------------------------------------
log "Building backend..."
(cd backend && npm run build)
log "Building frontend..."
(cd frontend && npm run build)

# --- 4. Test --------------------------------------------------------------
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  log "Running the test suite..."
  (cd backend && npm test)
else
  warn "SKIP_TESTS=1 set — skipping tests."
fi

# --- 5. Run (single server serves the API + the built UI) -----------------
if [ "${NO_RUN:-0}" = "1" ]; then
  ok "Setup, build, and tests complete. NO_RUN=1 set — not starting the server."
  exit 0
fi
PORT="${PORT:-4000}"
echo ""
log "Starting the QA app on http://localhost:${PORT}  (press Ctrl+C to stop)"
(cd backend && PORT="$PORT" npm start)
