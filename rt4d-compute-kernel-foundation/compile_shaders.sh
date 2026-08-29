#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL_DIR="$SCRIPT_DIR/kernels/vulkan"
OUTPUT_DIR="${1:-$SCRIPT_DIR/spirv}"

mkdir -p "$OUTPUT_DIR"

if ! command -v glslc &>/dev/null; then
    echo "ERROR: glslc not found"
    exit 1
fi

echo "=== Compiling RT4D diagnostic compute shaders ==="
for f in "$KERNEL_DIR"/*.comp.glsl; do
    [ -f "$f" ] || continue
    name=$(basename "$f" .glsl)
    out="$OUTPUT_DIR/${name}.spv"
    echo "  $name -> $out"
    glslc -fshader-stage=compute "$f" -o "$out"
done
echo "=== Done ==="
ls -la "$OUTPUT_DIR"/*.spv
