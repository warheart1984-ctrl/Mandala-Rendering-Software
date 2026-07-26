#!/bin/sh
# Genblaze + renderer-core container entrypoint (partial).
# On first boot, runs the engine3d demo tick (Node, no browser/Unreal host).
# Marker: /app/data/.engine3d-first-run
# Override: ENGINE3D_FIRST_RUN_ALWAYS=1 re-runs every start.
# Does not claim 4D render enforcement - only demo loop evidence.

set -eu

MARKER="${ENGINE3D_FIRST_RUN_MARKER:-/app/data/.engine3d-first-run}"
DEMO_SCRIPT="${ENGINE3D_DEMO_SCRIPT:-/app/renderer-core/scripts/engine3d-demo.mjs}"
FRAMES="${ENGINE3D_DEMO_FRAMES:-12}"

should_run=0
if [ "${ENGINE3D_FIRST_RUN_ALWAYS:-0}" = "1" ]; then
  should_run=1
elif [ ! -f "$MARKER" ]; then
  should_run=1
fi

if [ "$should_run" = "1" ]; then
  echo "[engine3d] first-run demo (partial): node $DEMO_SCRIPT $FRAMES"
  if node "$DEMO_SCRIPT" "$FRAMES"; then
    mkdir -p "$(dirname "$MARKER")"
    date -u +"ok %Y-%m-%dT%H:%M:%SZ" > "$MARKER" || true
    echo "[engine3d] first-run demo complete; marker=$MARKER"
  else
    echo "[engine3d] first-run demo failed (non-fatal for web boot); exit=$?"
  fi
else
  echo "[engine3d] skip first-run demo (marker present: $MARKER)"
fi

exec "$@"
