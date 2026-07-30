#!/usr/bin/env python3
"""
render-glb-cycles.py — Blender Cycles photoreal render of an exported GLB.

Invoked by Blender:
  blender -b -P render-glb-cycles.py -- input.glb output.png [samples] [width] [height]

Requires: Blender 3.0+ with Cycles. Drive-G-1: only claim photoreal when this
script writes a real PNG (governed-render records pixelsProduced from file existence).
"""

import bpy
import sys
from mathutils import Vector

argv = sys.argv
if "--" not in argv:
    raise SystemExit("Usage: blender -b -P render-glb-cycles.py -- glb out samples width height")
argv = argv[argv.index("--") + 1 :]
if len(argv) < 2:
    raise SystemExit("Need at least glb_path and out_path after --")

glb_path = argv[0]
out_path = argv[1]
samples = int(argv[2]) if len(argv) > 2 else 256
width = int(argv[3]) if len(argv) > 3 else 1024
height = int(argv[4]) if len(argv) > 4 else 1024

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.import_scene.gltf(filepath=glb_path)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = samples
# Fixed seed improves cross-run comparability; denoising may still be non-bit-identical.
scene.cycles.seed = 0
scene.cycles.use_animated_seed = False
scene.render.resolution_x = width
scene.render.resolution_y = height
scene.render.resolution_percentage = 100
scene.cycles.use_denoising = True

try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.refresh_devices()
    for device in prefs.devices:
        device.use = True
    # Prefer whatever compute backend Blender exposes; fall back to CPU.
    for compute in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = compute
            scene.cycles.device = "GPU"
            break
        except Exception:
            continue
    else:
        scene.cycles.device = "CPU"
except Exception:
    scene.cycles.device = "CPU"

# Ensure an active camera exists. Imported glTF cameras are preferred; otherwise
# create one that frames selected mesh bounds (headless has no 3D View context).
cameras = [o for o in scene.objects if o.type == "CAMERA"]
if cameras:
    scene.camera = cameras[0]
else:
    cam_data = bpy.data.cameras.new("MRS_Cycles_Camera")
    cam_obj = bpy.data.objects.new("MRS_Cycles_Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    meshes = [o for o in scene.objects if o.type == "MESH"]
    if meshes:
        # World-space AABB of mesh objects
        mins = [float("inf")] * 3
        maxs = [float("-inf")] * 3
        for obj in meshes:
            for corner in obj.bound_box:
                w = obj.matrix_world @ Vector(corner)
                for i in range(3):
                    mins[i] = min(mins[i], w[i])
                    maxs[i] = max(maxs[i], w[i])
        center = [(mins[i] + maxs[i]) * 0.5 for i in range(3)]
        extent = max(maxs[i] - mins[i] for i in range(3))
        dist = max(2.5, extent * 1.8)
        cam_obj.location = (center[0] + dist * 0.7, center[1] + dist * 0.45, center[2] + dist * 0.7)
        # Point camera toward scene center
        direction = Vector(center) - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    else:
        cam_obj.location = (4.0, 3.0, 4.0)
        cam_obj.rotation_euler = (1.1, 0.0, 0.8)

# Basic world light so beauty is not pure black if punctual lights missing
if not scene.world:
    scene.world = bpy.data.worlds.new("MRS_World")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.04, 0.045, 0.055, 1.0)
    bg.inputs[1].default_value = 0.35

scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)
print(f"[Cycles] Rendered to {out_path} camera={scene.camera.name if scene.camera else None}")
