#!/usr/bin/env bash
# Start Jarvis Memory Board on port 8001 (idempotent).
# If health check already succeeds, exits 0. Otherwise starts uvicorn
# in background and waits for /health.
#
# Prefer project .venv (pinned FastAPI/Starlette). System/user site-packages
# (e.g. FastAPI 0.116 + Starlette 1.6) raise TypeError on Router on_startup.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${JARVIS_PORT:-8001}"
HOST_BIND="${JARVIS_HOST:-127.0.0.1}"
BASE="${JARVIS_MEMORYBOARD_URL:-http://127.0.0.1:$PORT}"
LOG_DIR="$ROOT/data"
LOG_FILE="$LOG_DIR/jarvis.log"
ERR_LOG="$LOG_DIR/jarvis.err.log"
PID_FILE="$LOG_DIR/jarvis.pid"

mkdir -p "$LOG_DIR"

test_healthy() {
  curl -sf -o /dev/null -w '%{http_code}' --max-time 2 "$BASE/health" 2>/dev/null | grep -q '200'
}

# Prefer health; also honor live pidfile / listeners so we do not spawn duplicates
# when curl is blocked (sandbox) or briefly flaky.
already_running() {
  if test_healthy; then
    return 0
  fi
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN && return 0
  elif command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" >/dev/null 2>&1 && return 0
  fi
  return 1
}

if already_running; then
  echo "[ok] Jarvis Memory Board already running at $BASE"
  exit 0
fi

# Prefer project venv — do not fall back to ~/.local (incompatible Starlette).
PYTHON=""
for candidate in \
  "$ROOT/.venv/bin/python" \
  "$ROOT/.venv/bin/python3"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  cat >&2 <<HINT
ERROR: Project venv not found at:
  $ROOT/.venv/bin/python

Create and install (from jarvis-memoryboard):
  cd "$ROOT"
  python3 -m venv .venv
  .venv/bin/pip install -U pip
  .venv/bin/pip install -e ".[dev]"

Then re-run: bash scripts/start-memoryboard.sh
HINT
  exit 1
fi

# Resolve site-packages for this venv (python3.11 / 3.12 / …).
SITE=""
for d in "$ROOT/.venv/lib"/python*/site-packages; do
  if [ -d "$d" ]; then
    SITE="$d"
    break
  fi
done
if [ -z "$SITE" ]; then
  echo "ERROR: No site-packages under $ROOT/.venv/lib/python*/" >&2
  echo "Hint: .venv/bin/pip install -e \"$ROOT\"" >&2
  exit 1
fi

# Local app first, then venv packages (avoids stale editable / system bleed).
export PYTHONPATH="${ROOT}:${SITE}${PYTHONPATH:+:${PYTHONPATH}}"

if ! "$PYTHON" -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "[info] Installing jarvis-memoryboard into project .venv (editable)..."
  "$PYTHON" -m pip install -e "$ROOT" --quiet
fi

echo "[info] Starting Jarvis Memory Board with $PYTHON"
echo "[info] ROOT=$ROOT"
echo "[info] PYTHONPATH=$PYTHONPATH"

cd "$ROOT"
nohup "$PYTHON" -m uvicorn app.main:app \
  --host "$HOST_BIND" \
  --port "$PORT" \
  --log-level warning \
  >> "$LOG_FILE" 2>> "$ERR_LOG" &

echo $! > "$PID_FILE"

# Wait for health
deadline=$((SECONDS + 20))
while [ $SECONDS -lt $deadline ]; do
  if test_healthy; then
    echo "[ok] Jarvis Memory Board live at $BASE (pid $(cat "$PID_FILE"))"
    exit 0
  fi
  sleep 0.4
done

echo "ERROR: Service did not become healthy within 20s. Check $LOG_FILE and $ERR_LOG" >&2
exit 1
