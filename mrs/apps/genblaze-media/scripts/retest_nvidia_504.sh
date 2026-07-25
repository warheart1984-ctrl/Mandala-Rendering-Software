#!/usr/bin/env bash
# Retest live Genblaze after a Render env update or redeploy.
set -euo pipefail

BASE="${BASE:-https://mandala-rendering-system-mrs.onrender.com}"

echo "== GET /health =="
curl -sS "$BASE/health" | python -c '
import json
import sys

health = json.load(sys.stdin)
timeouts = health.get("nvidia_timeouts") or {}
print("poll", timeouts.get("nvcf_poll_seconds"))
print("http_read", timeouts.get("http_read_seconds"))
print("empty_504_retry", health.get("empty_504_retry"))
print("warmup", health.get("nvidia_warmup"))
print("nim_status", health.get("nvidia_nim_status"))
print("ingest", health.get("image_ingest_routes"))
'

echo
echo "== POST /api/generate (may take several minutes) =="
curl -sS -X POST "$BASE/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"abstract 4D mandala tesseract geometry, neon lattice, no people"}'
echo
