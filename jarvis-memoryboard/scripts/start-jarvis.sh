#!/usr/bin/env bash
# Start Jarvis Memory Board server (foreground launcher).
# For systemd autostart, see install-autostart.sh instead.
# Prefer project .venv — see start-memoryboard.sh for rationale.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${JARVIS_PORT:-8001}"
HOST_BIND="${JARVIS_HOST:-127.0.0.1}"
LOG="$ROOT/data/jarvis.log"

mkdir -p "$ROOT/data"

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
  echo "[$(date)] ERROR: no project .venv at $ROOT/.venv — run: python3 -m venv .venv && .venv/bin/pip install -e ." >> "$LOG"
  echo "ERROR: Project venv missing at $ROOT/.venv" >&2
  echo "Hint: cd \"$ROOT\" && python3 -m venv .venv && .venv/bin/pip install -e ." >&2
  exit 1
fi

SITE=""
for d in "$ROOT/.venv/lib"/python*/site-packages; do
  if [ -d "$d" ]; then
    SITE="$d"
    break
  fi
done
export PYTHONPATH="${ROOT}:${SITE}${PYTHONPATH:+:${PYTHONPATH}}"

echo "[$(date)] Starting Jarvis Memory Board on ${HOST_BIND}:$PORT with $PYTHON..." >> "$LOG"
cd "$ROOT"
"$PYTHON" -m uvicorn app.main:app --host "$HOST_BIND" --port "$PORT" --log-level warning >> "$LOG" 2>&1
echo "[$(date)] Jarvis Memory Board exited with code $?" >> "$LOG"
