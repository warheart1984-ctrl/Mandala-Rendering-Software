#!/usr/bin/env bash
# render-glb-cycles.sh — Blender Cycles photoreal render of exported GLB
#
# Usage:
#   ./render-glb-cycles.sh input.glb output.png [samples] [width] [height]
#
# Requires: Blender 3.0+ on PATH, or BLENDER_PATH pointing at the binary.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${SCRIPT_DIR}/render-glb-cycles.py"

GLB="${1:-output/test/scene.glb}"
OUT="${2:-output/test/cycles.png}"
SAMPLES="${3:-256}"
WIDTH="${4:-1024}"
HEIGHT="${5:-1024}"

if [[ ! -f "$GLB" ]]; then
    echo "ERROR: GLB not found: $GLB"
    exit 1
fi

if [[ ! -f "$PY" ]]; then
    echo "ERROR: Missing $PY"
    exit 1
fi

BLENDER_BIN="${BLENDER_PATH:-blender}"

echo "[Cycles] Rendering $GLB -> $OUT (samples=$SAMPLES, ${WIDTH}x${HEIGHT})"
"$BLENDER_BIN" -b -P "$PY" -- "$GLB" "$OUT" "$SAMPLES" "$WIDTH" "$HEIGHT"
