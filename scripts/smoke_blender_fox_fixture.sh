#!/usr/bin/env bash
# Live-smoke Blender import of the fox sculptor fixture GLB via runtime/bin/blender.
# Status on success: partial / verified-via-flatpak (not native blender pipeline).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/runtime/bin:$PATH"
OUT="${MRS_BLENDER_SMOKE_OUT:-$ROOT/mrs/adapters/storyforge-boundary/contract/evidence/blender-fox}"
mkdir -p "$OUT"
cd "$ROOT/mrs/packages/sovereign-sculptor"
if [[ ! -f dist/src/cli.js ]]; then
  npm run build
fi
node dist/src/cli.js fixture fox --out "$OUT"
GLB="$OUT/fox/fox-character-fixture.glb"
if [[ ! -f "$GLB" ]]; then
  echo "missing $GLB" >&2
  exit 1
fi
LOG="$OUT/blender-fox-import.log"
# Flatpak needs host paths; wrapper execs org.blender.Blender when native missing.
set +e
"$ROOT/runtime/bin/blender" --background --python "$ROOT/scripts/import_rt4d_glb.py" -- "$GLB" >"$LOG" 2>&1
rc=$?
set -e
cat "$LOG"
BLEND="${GLB%.glb}.blend"
IMPORT_LOG="${GLB%.glb}.import.log"
python3 - <<PY
import json, os, sys
glb = "$GLB"
blend = "$BLEND"
log = "$IMPORT_LOG"
wrapper_log = "$LOG"
evidence = {
  "statusTag": "partial" if os.path.isfile(blend) else "declared",
  "blenderKind": "verified-via-flatpak" if os.path.isfile(blend) else "unverified",
  "nativeBlenderPipeline": False,
  "glb": glb,
  "blend": blend if os.path.isfile(blend) else None,
  "importLog": log if os.path.isfile(log) else None,
  "wrapperLog": wrapper_log,
  "wrapperExit": $rc,
}
text = open(wrapper_log, encoding="utf-8", errors="replace").read()
evidence["armatureNote"] = "no-armature-object" if "no ARMATURE" in text or "no-armature-object" in text else (
  "armature-present" if "Found armature" in text else "unknown"
)
evidence["claim"] = "Flatpak Blender imported fox fixture GLB. Not a native blender pipeline. Not production sculpt."
out = os.path.join(os.path.dirname(glb), "blender-fox-smoke-evidence.json")
open(out, "w", encoding="utf-8").write(json.dumps(evidence, indent=2) + "\n")
print(json.dumps(evidence, indent=2))
sys.exit(0 if evidence["statusTag"] == "partial" else 1)
PY
