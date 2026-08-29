#!/usr/bin/env bash
# Hardware-oracle runner for Mesa RADV. Refuses to stamp a receipt on
# lavapipe/CPU. This script does not invent an AMD GPU.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${RT4D_BUILD_DIR:-$ROOT/build}"
RECEIPT="${1:-$ROOT/receipts/rt4d-kernel-vulkan-radv-v0.1.json}"
ICD="${RT4D_RADV_ICD:-/usr/share/vulkan/icd.d/radeon_icd.json}"

if [[ ! -x "$BUILD/rt4d_hardware_oracle" ]]; then
  echo "ERROR: build rt4d_hardware_oracle first (cmake --build $BUILD)" >&2
  exit 1
fi
if [[ ! -f "$ICD" ]]; then
  echo "ERROR: RADV ICD not found: $ICD" >&2
  exit 1
fi
has_drm=0
if compgen -G "/dev/dri/renderD*" >/dev/null ||
   compgen -G "/dev/dri/card*" >/dev/null; then
  has_drm=1
fi
if [[ "$has_drm" -ne 1 ]]; then
  echo "ERROR: no DRM render node; this machine cannot bind RADV to a GPU" >&2
  exit 1
fi

unset DISPLAY
export VK_ICD_FILENAMES="$ICD"

exec "$BUILD/rt4d_hardware_oracle" --require-gpu --require-amd-radv \
  "$ROOT/fixtures/pentachora-v0.1.rt4d" \
  "$BUILD/spirv/bvh4d_pentachoron_traverse.comp.spv" \
  "$BUILD/spirv/matvec_clean.comp.spv" \
  "$RECEIPT"
