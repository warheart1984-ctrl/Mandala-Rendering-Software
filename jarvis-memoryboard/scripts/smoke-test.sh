#!/usr/bin/env bash
# Smoke-test Continuity Ledger GET/POST against a live server.

set -euo pipefail

BASE="${JARVIS_MEMORYBOARD_URL:-http://127.0.0.1:8001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Continuity Ledger smoke test ==="
echo "Base: $BASE"

# Health check
health=$(curl -sf --max-time 5 "$BASE/health")
status=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
schema=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['schema'])")
count=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['memory_count'])")
if [ "$status" != "ok" ]; then
  echo "FAIL: health returned status=$status"
  exit 1
fi
echo "[ok] GET /health status=$status schema=$schema memories=$count"

# Board
board=$(curl -sf --max-time 5 "$BASE/api/jarvis/memory/board")
board_id=$(echo "$board" | python3 -c "import sys,json; print(json.load(sys.stdin)['memory_board']['board_id'])")
echo "[ok] GET /api/jarvis/memory/board id=$board_id"

# Retrieve live
live=$(curl -sf --max-time 5 "$BASE/api/jarvis/memory/retrieve?truth_scope=live&limit=5")
live_count=$(echo "$live" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['memories']))")
selections=$(echo "$live" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['selections']))")
echo "[ok] GET retrieve live_count=$live_count selections=$selections"

# Create memory
ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
created=$(curl -sf --max-time 5 -X POST "$BASE/api/jarvis/memory" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"Smoke test Continuity Ledger entry at $ts\",
    \"source_agent\": \"smoke-test.sh\",
    \"session_id\": \"smoke-session\",
    \"type\": \"fact\",
    \"confidence\": 0.4,
    \"status\": \"draft\",
    \"subject\": \"smoke-test\",
    \"evidence\": [{\"kind\": \"script\", \"ref\": \"scripts/smoke-test.sh\", \"note\": \"automated smoke\"}],
    \"tags\": [\"smoke-test\", \"jarvis-memoryboard\"]
  }")
mem_id=$(echo "$created" | python3 -c "import sys,json; print(json.load(sys.stdin)['memory']['id'])")
sha=$(echo "$created" | python3 -c "import sys,json; print(json.load(sys.stdin)['memory']['content_sha256'][:12])")
echo "[ok] POST /api/jarvis/memory id=$mem_id sha=$sha..."

# Session start hook
hook="$ROOT/agent-hooks/jarvis_session_start.py"
if [ -f "$hook" ] && command -v python3 &>/dev/null; then
  out=$(echo '{"session_id":"smoke-session","composer_mode":"agent","is_background_agent":false}' | python3 -X utf8 "$hook")
  ctx_file="$ROOT/.cursor/hooks/state/jarvis-live-context.md"
  has_ctx=$(echo "$out" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('additional_context') else 'no')")
  if [ "$has_ctx" = "yes" ]; then
    echo "[ok] sessionStart hook emitted context"
  else
    echo "[warn] sessionStart hook did not emit additional_context"
  fi
fi

echo "=== ALL SMOKE CHECKS PASSED ==="
