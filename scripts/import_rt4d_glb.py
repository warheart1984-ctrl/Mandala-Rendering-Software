"""
RT4D → Blender Import Helper

Imports GLB files exported by the RT4D pipeline into Blender with:
- Armature setup (already in GLB)
- Pose animation from 4D rotation planes
- Skin layer material assignment
- Camera + lighting setup for preview

Usage (Linux / any OS with Blender on PATH):
  blender --background --python scripts/import_rt4d_glb.py -- path/to/character.glb

Status: declared helper — not live-smoke-tested in CI. GLB is a fixture hull, not an anatomical fox.

Status: declared unless `blender` is on PATH. Not a live widget smoke.

Usage:
  blender --background --python import_rt4d_glb.py -- path/to/character.glb

Or from Blender's scripting tab:
  exec(open('import_rt4d_glb.py').read())
"""

import sys
import os
import json
import math

def import_glb(filepath):
    """Import a GLB file into Blender."""
    import bpy

    # Clear existing scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=filepath)

    print(f"[RT4D] Imported GLB: {filepath}")
    print(f"[RT4D] Objects: {[obj.name for obj in bpy.data.objects]}")
    types = {obj.name: obj.type for obj in bpy.data.objects}
    print(f"[RT4D] ObjectTypes: {types}")

    return bpy.data.objects

def setup_armature():
    """Find and configure the imported armature."""
    import bpy

    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if armature:
        print(f"[RT4D] Found armature: {armature.name}")
        bpy.context.view_layer.objects.active = armature
        armature.select_set(True)
        armature.data.display_type = 'OCTAHEDRAL'
    else:
        print("[RT4D] Honest: no ARMATURE object in this GLB (fixture mesh may still have bones as nodes).")

    return armature

def apply_fox_warrior_skin():
    """Apply fox warrior skin materials to imported meshes."""
    import bpy

    # Material presets
    presets = {
        "fox-fur": {"color": (0.83, 0.46, 0.23), "roughness": 0.85, "metallic": 0.0},
        "fox-belly": {"color": (0.96, 0.90, 0.82), "roughness": 0.9, "metallic": 0.0},
        "leather-dark": {"color": (0.16, 0.10, 0.05), "roughness": 0.45, "metallic": 0.05},
        "armor-metal": {"color": (0.29, 0.29, 0.35), "roughness": 0.3, "metallic": 0.8},
        "cloth-dark": {"color": (0.10, 0.10, 0.18), "roughness": 0.75, "metallic": 0.0},
    }

    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue

        name_lower = obj.name.lower()

        # Match mesh name to preset
        preset_name = None
        if any(k in name_lower for k in ['body', 'fur', 'tail']):
            preset_name = 'fox-fur'
        elif any(k in name_lower for k in ['belly', 'chest']):
            preset_name = 'fox-belly'
        elif any(k in name_lower for k in ['leather', 'strap']):
            preset_name = 'leather-dark'
        elif any(k in name_lower for k in ['armor', 'metal']):
            preset_name = 'armor-metal'
        elif any(k in name_lower for k in ['cloth', 'fabric']):
            preset_name = 'cloth-dark'

        if preset_name and obj.data.materials:
            mat = obj.data.materials[0]
            preset = presets[preset_name]
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs['Base Color'].default_value = (*preset["color"], 1.0)
                bsdf.inputs['Roughness'].default_value = preset["roughness"]
                bsdf.inputs['Metallic'].default_value = preset["metallic"]
            print(f"[RT4D] Applied {preset_name} to {obj.name}")

def create_pose_animation(armature, rotation_planes, duration=2.0, fps=24):
    """Create pose animation from 4D rotation planes."""
    import bpy

    if not armature or armature.type != 'ARMATURE':
        print("[RT4D] No armature found, skipping pose animation")
        return

    # Extract speeds
    speeds = {"XW": 0, "YW": 0, "ZW": 0}
    for rp in rotation_planes:
        speeds[rp["plane"]] = rp["speed"]

    frame_count = int(duration * fps)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frame_count + 1
    scene.render.fps = fps

    # Bone → plane influence mapping
    bone_influences = {
        "spine": {"XW": 0.3},
        "chest": {"XW": 0.4},
        "neck": {"YW": 0.4},
        "head": {"YW": 0.5},
        "tail": {"ZW": 0.5},
        "shoulder_L": {"XW": 0.2, "ZW": 0.2},
        "shoulder_R": {"XW": 0.2, "ZW": -0.2},
        "ear_L": {"YW": 0.3, "ZW": 0.15},
        "ear_R": {"YW": 0.3, "ZW": -0.15},
    }

    for frame in range(frame_count + 1):
        scene.frame_set(frame + 1)
        t = frame / fps
        phase = t * math.pi * 2

        for pose_bone in armature.pose.bones:
            influence = bone_influences.get(pose_bone.name, {})
            rx = sum(math.sin(phase * speeds.get(plane, 0)) * 0.3 * inf
                     for plane, inf in influence.items() if plane == "XW")
            ry = sum(math.sin(phase * speeds.get(plane, 0)) * 0.3 * inf
                     for plane, inf in influence.items() if plane == "YW")
            rz = sum(math.sin(phase * speeds.get(plane, 0)) * 0.3 * inf
                     for plane, inf in influence.items() if plane == "ZW")

            pose_bone.rotation_mode = 'XYZ'
            pose_bone.rotation_euler = (rx, ry, rz)
            pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame + 1)

    print(f"[RT4D] Created {frame_count + 1} pose keyframes at {fps} fps")

def setup_camera_and_lighting():
    """Set up a three-point lighting rig and camera."""
    import bpy

    # Camera
    cam = bpy.data.cameras.new("RT4D_Camera")
    cam_obj = bpy.data.objects.new("RT4D_Camera", cam)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (0, -3, 1.5)
    cam_obj.rotation_euler = (math.radians(75), 0, 0)
    bpy.context.scene.camera = cam_obj

    # Key light
    key = bpy.data.lights.new("KeyLight", 'AREA')
    key.energy = 200
    key.color = (1, 1, 1)
    key.size = 2
    key_obj = bpy.data.objects.new("KeyLight", key)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = (3, -2, 4)
    key_obj.rotation_euler = (math.radians(-45), 0, math.radians(30))

    # Fill light
    fill = bpy.data.lights.new("FillLight", 'AREA')
    fill.energy = 80
    fill.color = (0.6, 0.7, 1.0)
    fill.size = 3
    fill_obj = bpy.data.objects.new("FillLight", fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (-3, -1, 2)

    # Rim light
    rim = bpy.data.lights.new("RimLight", 'AREA')
    rim.energy = 120
    rim.color = (1, 0.95, 0.8)
    rim.size = 1.5
    rim_obj = bpy.data.objects.new("RimLight", rim)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = (0, 3, 3)

    # World background
    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("RT4D_World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs['Color'].default_value = (0.04, 0.06, 0.08, 1)
        bg.inputs['Strength'].default_value = 0.5

    # Render settings
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.samples = 128
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1080

    print("[RT4D] Camera and lighting setup complete")

def main():
    """Main import pipeline."""
    # Parse args (-- after blender args)
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = []

    if not args:
        print("Usage: blender --background --python import_rt4d_glb.py -- path/to/character.glb")
        sys.exit(1)

    filepath = args[0]
    if not os.path.exists(filepath):
        print(f"[RT4D] Error: File not found: {filepath}")
        sys.exit(1)

    # Optional: rotation planes JSON
    rotation_planes = [{"plane": "XW", "speed": 0.35}, {"plane": "YW", "speed": 0.25}, {"plane": "ZW", "speed": 0.15}]
    if len(args) > 1:
        with open(args[1]) as f:
            rotation_planes = json.load(f)

    print(f"[RT4D] Importing {filepath}")
    print(f"[RT4D] Rotation planes: {rotation_planes}")

    # Import pipeline
    import_glb(filepath)
    armature = setup_armature()
    apply_fox_warrior_skin()
    create_pose_animation(armature, rotation_planes)
    setup_camera_and_lighting()

    import bpy

    # Save blend file next to the GLB
    import bpy
    blend_path = filepath.replace(".glb", ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[RT4D] Saved: {blend_path}")
    log_path = filepath.replace(".glb", ".import.log")
    armature_note = "armature-present" if armature else "no-armature-object"
    with open(log_path, "w", encoding="utf-8") as log:
        log.write(f"glb={filepath}\n")
        log.write(f"blend={blend_path}\n")
        log.write(f"armature={armature_note}\n")
        log.write("pipeline=flatpak-or-wrapper-not-native-blender\n")
        log.write("statusTag=partial\n")
    print(f"[RT4D] Log: {log_path}")
    print(f"[RT4D] Armature: {armature_note}")

if __name__ == "__main__":
    main()
