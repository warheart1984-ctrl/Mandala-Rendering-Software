#!/usr/bin/env bash
set -euo pipefail

SHADERS=(
  "rt4d_raygen.comp:RAYGEN"
  "rt4d_bvh_tight.comp:BVH"
  "rt4d_shade_full.comp:SHADE"
  "rt4d_shade_ggx.comp:SHADE_GGX"
  "rt4d_bvh.comp:BVH_LEGACY"
  "rt4d_resolve.comp:RESOLVE"
)

OUTDIR="spirv_rt4d"
mkdir -p "$OUTDIR"

for pair in "${SHADERS[@]}"; do
  file=$(echo $pair | cut -d: -f1)
  name=$(echo $pair | cut -d: -f2)
  if [ ! -f "$file" ]; then
    echo "Missing $file, skipping"
    continue
  fi
  echo "Compiling $file -> $OUTDIR/${name}.spv"
  if command -v glslc &> /dev/null; then
    glslc -fshader-stage=compute -O "$file" -o "$OUTDIR/${name}.spv"
  elif command -v glslangValidator &> /dev/null; then
    glslangValidator -V -S comp -e main "$file" -o "$OUTDIR/${name}.spv"
  else
    echo "No glslc/glslangValidator found. Creating placeholder."
    echo "PLACEHOLDER SPIR-V for $file" > "$OUTDIR/${name}.spv"
  fi
done

echo "SPIR-V compiled to $OUTDIR"
ls -lh "$OUTDIR"
