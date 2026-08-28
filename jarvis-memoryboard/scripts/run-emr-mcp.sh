#!/usr/bin/env bash
# Start EMR Recall MCP stdio server (requires memoryboard on :8001).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JARVIS_MEMORYBOARD_URL="${JARVIS_MEMORYBOARD_URL:-http://127.0.0.1:8001}"
cd "$ROOT"
exec python -m mcp_server
