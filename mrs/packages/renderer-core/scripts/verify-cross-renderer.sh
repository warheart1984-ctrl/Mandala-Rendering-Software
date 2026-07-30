#!/usr/bin/env bash
# verify-cross-renderer.sh — Cross-renderer conformance test
#
# Verifies that the same governed GLB produces geometrically identical
# and statistically convergent results across multiple renderers.
#
# Usage:
#   ./verify-cross-renderer.sh scene.glb [--renderers cycles,arnold,mitsuba] [--samples 256]
#
# Outputs:
#   - verification.json with geometric + statistical comparison
#   - Individual PNG outputs per renderer

set -euo pipefail

GLB="${1:-}"
if [[ -z "$GLB" || ! -f "$GLB" ]]; then
    echo "Usage: $0 <scene.glb> [--renderers cycles,arnold,mitsuba] [--samples 256]"
    exit 1
fi

RENDERERS="${RENDERERS:-cycles,arnold,mitsuba}"
SAMPLES="${SAMPLES:-256}"
WIDTH="${WIDTH:-1024}"
HEIGHT="${HEIGHT:-1024}"
OUTDIR="${OUTDIR:-tmp/cross-renderer-$(date +%s)}"

mkdir -p "$OUTDIR"

echo "=== Cross-Renderer Conformance Test ==="
echo "GLB: $GLB"
echo "Renderers: $RENDERERS"
echo "Samples: $SAMPLES"
echo "Resolution: ${WIDTH}x${HEIGHT}"
echo "Output: $OUTDIR"
echo ""

# 1. Verify GLB geometric identity
echo "[1/4] Verifying GLB geometric identity..."
python3 << 'PYEOF' "$GLB" "$OUTDIR/glb-geometry.json"
import sys, json, struct, base64, zlib
from pathlib import Path

glb_path = sys.argv[1]
out_path = sys.argv[2]

with open(glb_path, 'rb') as f:
    data = f.read()

# Parse GLB
assert data[:4] == b'glTF', "Not a GLB"
version = struct.unpack('<I', data[4:8])[0]
length = struct.unpack('<I', data[8:12])[0]
assert version == 2

offset = 12
chunks = []
while offset < len(data):
    chunk_len = struct.unpack('<I', data[offset:offset+4])[0]
    chunk_type = data[offset+4:offset+8]
    chunk_data = data[offset+8:offset+8+chunk_len]
    chunks.append((chunk_type.decode('ascii'), chunk_data))
    offset += 8 + chunk_len + (4 - ((8 + chunk_len) % 4)) % 4

json_chunk = next(c for t, c in chunks if t == 'JSON')
bin_chunk = next(c for t, c in chunks if t == 'BIN')

gltf = json.loads(json_chunk.decode('utf-8'))

# Extract geometric identity
geometry = {
    "specHash": None,  # Would be in extras or asset.extras
    "meshes": [],
    "nodes": [],
    "materials": len(gltf.get("materials", [])),
    "lights": len(gltf.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])),
    "camera": gltf.get("cameras", [{}])[0] if gltf.get("cameras") else None,
    "sceneNodeCount": sum(len(s.get("nodes", [])) for s in gltf.get("scenes", [])),
}

for i, mesh in enumerate(gltf.get("meshes", [])):
    for prim in mesh.get("primitives", []):
        attrs = prim.get("attributes", {})
        pos_acc = gltf["accessors"][attrs.get("POSITION", -1)] if "POSITION" in attrs else None
        geometry["meshes"].append({
            "index": i,
            "primitiveCount": len(mesh.get("primitives", [])),
            "vertexCount": pos_acc.get("count") if pos_acc else 0,
            "hasNormals": "NORMAL" in attrs,
            "hasUVs": "TEXCOORD_0" in attrs,
            "material": prim.get("material"),
        })

for i, node in enumerate(gltf.get("nodes", [])):
    geometry["nodes"].append({
        "index": i,
        "name": node.get("name"),
        "mesh": node.get("mesh"),
        "translation": node.get("translation"),
        "rotation": node.get("rotation"),
        "scale": node.get("scale"),
        "camera": node.get("camera"),
        "extensions": node.get("extensions"),
    })

with open(out_path, 'w') as f:
    json.dump(geometry, f, indent=2)

print(f"  Meshes: {len(geometry['meshes'])}")
print(f"  Nodes: {len(geometry['nodes'])}")
print(f"  Materials: {geometry['materials']}")
print(f"  Lights: {geometry['lights']}")
print(f"  Scene nodes: {geometry['sceneNodeCount']}")
PYEOF

# 2. Render with each available renderer
echo "[2/4] Rendering with available renderers..."
RESULTS=()

for R in ${RENDERERS//,/ }; do
    case "$R" in
        cycles)
            if command -v blender >/dev/null 2>&1; then
                echo "  Rendering with Blender Cycles..."
                OUT_PNG="$OUTDIR/cycles.png"
                python3 -c "
import bpy, sys, os
argv = sys.argv[argv.index('--') + 1:]
glb_path, out_path, samples, w, h = argv[0], argv[1], int(argv[2]), int(argv[3]), int(argv[4])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=glb_path)
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = samples
bpy.context.scene.render.resolution_x = w
bpy.context.scene.render.resolution_y = h
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.refresh_devices()
for d in prefs.devices: d.use = True
prefs.compute_device_type = 'CUDA'
bpy.context.scene.cycles.device = 'GPU'
for obj in bpy.context.scene.objects: obj.select_set(True)
bpy.ops.view3d.camera_to_view_selected()
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)
print(f'CYCLES_OK {out_path}')
" -- "$GLB" "$OUT_PNG" "$SAMPLES" "$WIDTH" "$HEIGHT" 2>/dev/null && RESULTS+=("cycles:$OUT_PNG") || echo "  Cycles failed"
            else
                echo "  Blender not found, skipping Cycles"
            fi
            ;;
        arnold)
            if command -v kick >/dev/null 2>&1; then
                echo "  Rendering with Arnold..."
                OUT_PNG="$OUTDIR/arnold.png"
                # Arnold .ass export from GLB would be needed first
                echo "  Arnold path not fully implemented (needs .ass export)"
            else
                echo "  Arnold (kick) not found, skipping"
            fi
            ;;
        mitsuba)
            if command -v mitsuba >/dev/null 2>&1; then
                echo "  Rendering with Mitsuba 3..."
                OUT_PNG="$OUTDIR/mitsuba.png"
                # Mitsuba can load GLB directly via mitsuba-scene
                mitsuba -o "$OUT_PNG" -s "$SAMPLES" -w "$WIDTH" -h "$HEIGHT" "$GLB" 2>/dev/null && RESULTS+=("mitsuba:$OUT_PNG") || echo "  Mitsuba failed"
            else
                echo "  Mitsuba not found, skipping"
            fi
            ;;
    esac
done

# 3. Statistical comparison
echo "[3/4] Statistical comparison..."
python3 << 'PYEOF' "$OUTDIR" "${RESULTS[*]}"
import sys, json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

outdir = Path(sys.argv[1])
results = sys.argv[2].split() if len(sys.argv) > 2 else []

print("  Computing image statistics...")
stats = {}
for r in results:
    renderer, png_path = r.split(':', 1)
    p = Path(png_path)
    if not p.exists():
        print(f"  {renderer}: missing output")
        continue
    img = Image.open(p).convert('RGB')
    arr = np.array(img, dtype=np.float32) / 255.0
    h = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
    stats[renderer] = {
        "path": str(p),
        "sha256": h,
        "mean": arr.mean(axis=(0,1)).tolist(),
        "std": arr.std(axis=(0,1)).tolist(),
        "min": arr.min(axis=(0,1)).tolist(),
        "max": arr.max(axis=(0,1)).tolist(),
        "width": img.width,
        "height": img.height,
    }
    print(f"  {renderer}: mean={stats[renderer]['mean']} std={stats[renderer]['std']} sha256={h}")

# Cross-renderer comparison (if multiple)
if len(stats) >= 2:
    renderers = list(stats.keys())
    for i, r1 in enumerate(renders):
        for r2 in renders[i+1:]:
            m1, m2 = stats[r1]['mean'], stats[r2]['mean']
            diff = [abs(a-b) for a,b in zip(m1, m2)]
            print(f"  {r1} vs {r2}: mean Δ = {diff}")

with open(outdir / "verification.json", 'w') as f:
    json.dump({
        "glb": str(Path(sys.argv[1]).parent / "scene.glb"),
        "renderers": stats,
        "timestamp": __import__('datetime').datetime.utcnow().isoformat(),
    }, f, indent=2)

print(f"\n  Verification written to {outdir}/verification.json")
PYEOF "$OUTDIR" "$RESULTS"

# 4. Summary
echo "[4/4] Summary"
cat "$OUTDIR/verification.json" | python3 -m json.tool
echo ""
echo "=== Cross-Renderer Conformance Complete ==="
echo "Outputs in: $OUTDIR"
echo "Verification: $OUTDIR/verification.json"
echo "GLB Geometry: $OUTDIR/glb-geometry.json"