#!/usr/bin/env bash
# Install Jarvis Memory Board as a systemd user service.
# Creates ~/.config/systemd/user/jarvis-memoryboard.service
# then enables linger (boot without login), enables, and starts it.
# Restart=always brings it back after crash, kill, or unclean exit.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${JARVIS_PORT:-8001}"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/jarvis-memoryboard.service"
LOG_DIR="$ROOT/data"
LOG_FILE="$LOG_DIR/jarvis.log"

# Prefer the project venv (pinned FastAPI). System/user site-packages have
# historically failed with Starlette Router on_startup mismatches.
PYTHON=""
for candidate in \
  "$ROOT/.venv/bin/python" \
  "$ROOT/.venv/bin/python3" \
  "$HOME/.local/bin/python3" \
  "$HOME/.venv/bin/python" \
  "$(command -v python3 2>/dev/null || true)" \
  "$(command -v python 2>/dev/null || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "ERROR: No Python found. Install Python 3.11+ or set PATH." >&2
  exit 1
fi

if ! "$PYTHON" -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "[info] Installing jarvis-memoryboard into $PYTHON ..."
  "$PYTHON" -m pip install -e "$ROOT" --quiet
fi

mkdir -p "$LOG_DIR" "$SERVICE_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Jarvis Memory Board (Continuity Ledger)
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart="$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port $PORT --log-level warning
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE

[Install]
WantedBy=default.target
EOF

# User services survive reboot only with linger (start without a login session).
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" >/dev/null 2>&1 || true
fi

systemctl --user daemon-reload
systemctl --user enable jarvis-memoryboard.service
systemctl --user restart jarvis-memoryboard.service

echo "[ok] JarvisMemoryBoard service installed and started."
echo "     Service: $SERVICE_FILE"
echo "     Python:  $PYTHON"
echo "     Port:    $PORT"
echo "     Log:     $LOG_FILE"
echo ""
echo "Status:     systemctl --user status jarvis-memoryboard"
echo "Stop:       systemctl --user stop jarvis-memoryboard"
echo "Restart:    systemctl --user restart jarvis-memoryboard"
echo "Uninstall:  systemctl --user disable --now jarvis-memoryboard && rm $SERVICE_FILE"
