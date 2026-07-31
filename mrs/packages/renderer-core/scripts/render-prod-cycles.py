#!/usr/bin/env python3
"""
render-prod-cycles.py — Production Cycles render with USD export + ACEScg color.

Invoked by Blender:
  blender -b -P render-prod-cycles.py -- input.glb output.png [samples] [width] [height] [export-usd]

When --export-usd is in argv[5], exports output.usd alongside the PNG.
OCIO env var (if set) points to a custom OCIO config for ACEScg support.
"""

import bpy
import os
import sys
from mathutils import Vector

argv = sys.argv
if "--" not in argv:
    raise SystemExit("Usage: blender -b -P render-prod-cycles.py -- glb out.png [samples] [width] [height] [--export-usd]")
argv = argv[argv.index("--") + 1:]
if len(argv) < 2:
    raise SystemExit("Need at least glb_path and out_path")

glb_path = argv[0]
out_path = argv[1]
samples = int(argv[2]) if len(argv) > 2 and argv[2].isdigit() else 256
width = int(argv[3]) if len(argv) > 3 and argv[3].isdigit() else 1024
height = int(argv[4]) if len(argv) > 4 and argv[4].isdigit() else 1024
export_usd = "--export-usd" in argv

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.import_scene.gltf(filepath=glb_path)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = samples
scene.cycles.seed = 0
scene.cycles.use_animated_seed = False
scene.render.resolution_x = width
scene.render.resolution_y = height
scene.render.resolution_percentage = 100
scene.cycles.use_denoising = True

# ── Color Management (ACEScg if OCIO env set, else AgX) ──────────────
ocio_path = os.environ.get("OCIO")
if ocio_path and os.path.isfile(ocio_path):
    scene.view_settings.view_transform = "ACES 2.0 - SDR 100 nits (Rec.709)"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB - Display"
else:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"

# ── GPU / CPU ─────────────────────────────────────────────────────────
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.refresh_devices()
    for device in prefs.devices:
        device.use = True
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

# ── Camera ────────────────────────────────────────────────────────────
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
        direction = Vector(center) - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    else:
        cam_obj.location = (4.0, 3.0, 4.0)
        cam_obj.rotation_euler = (1.1, 0.0, 0.8)

# ── World light ───────────────────────────────────────────────────────
if not scene.world:
    scene.world = bpy.data.worlds.new("MRS_World")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.04, 0.045, 0.055, 1.0)
    bg.inputs[1].default_value = 0.35

# ── USD Export (before render, while scene is intact) ─────────────────
if export_usd:
    usd_path = os.path.splitext(out_path)[0] + ".usd"
    try:
        bpy.ops.wm.usd_export(
            filepath=usd_path,
            selected_objects_only=False,
            export_animation=False,
            export_uvmaps=True,
            export_normals=True,
            export_materials=True,
            export_armatures=True,
            export_shapekeys=True,
            generate_preview_surface=True,
            evaluation_mode='RENDER',
        )
        print(f"[USD] Exported to {usd_path}")
    except Exception as e:
        print(f"[USD] Export failed: {e}")

# ── Render ────────────────────────────────────────────────────────────
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)
print(f"[Cycles] Rendered to {out_path} camera={scene.camera.name if scene.camera else None}")
if ocio_path:
    print(f"[Color] OCIO config: {ocio_path} view={scene.view_settings.view_transform}")
else:
    print(f"[Color] View: {scene.view_settings.view_transform} display={scene.display_settings.display_device}")
