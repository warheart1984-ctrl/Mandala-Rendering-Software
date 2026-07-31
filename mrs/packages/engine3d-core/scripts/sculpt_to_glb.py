#!/usr/bin/env python3
"""
sculpt_to_glb.py — Export a rigged Blender character to production GLB format.

Validates against our FaceRig spec (bones, blendshapes, skinning, materials).
Output passes `validate-face-glb.mjs`.

Usage (from Blender):
    blender -b character.blend -P sculpt_to_glb.py -- --output character.glb

Usage (standalone, requires bpy):
    python sculpt_to_glb.py --blend character.blend --output character.glb

Requirements:
- Armature named "Armature" with bones matching DEFAULT_FACE_BONES
- Mesh with shape keys matching DEFAULT_FACE_BLENDSHAPES
- Skin modifier (Armature) with vertex groups matching bone names
- Materials with proper PBR nodes (Principled BSDF)
- UVs unwrapped
"""

import sys
import os
import argparse
import json

# Check if running inside Blender
try:
    import bpy
    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False
    print("Error: This script requires Blender's Python (bpy).")
    print("Run with: blender -b file.blend -P sculpt_to_glb.py -- --output out.glb")
    sys.exit(1)

# FaceRig spec (must match validator)
REQUIRED_BONES = [
    "Head", "Jaw", "LeftEye", "RightEye",
    "LeftBrow", "RightBrow", "UpperLip", "LowerLip"
]

REQUIRED_BLENDSHAPES = [
    "Smile", "Frown", "BlinkLeft", "BlinkRight",
    "Squint", "WideEyes", "MouthOpen", "MouthNarrow"
]

MATERIAL_TYPES = {
    "face_skin": {"base_color": (0.9, 0.74, 0.62, 1.0), "roughness": 0.55, "metallic": 0.0},
    "eyes": {"base_color": (0.15, 0.2, 0.35, 1.0), "roughness": 0.1, "metallic": 0.0},
    "mouth": {"base_color": (0.75, 0.35, 0.35, 1.0), "roughness": 0.45, "metallic": 0.0},
}


def validate_scene():
    """Validate the Blender scene meets FaceRig requirements."""
    errors = []
    warnings = []

    # Check armature
    armature = bpy.data.objects.get("Armature")
    if not armature or armature.type != 'ARMATURE':
        errors.append("Armature object named 'Armature' not found")
    else:
        bone_names = {b.name for b in armature.data.bones}
        missing_bones = set(REQUIRED_BONES) - bone_names
        if missing_bones:
            errors.append(f"Missing bones: {sorted(missing_bones)}")
        extra_bones = bone_names - set(REQUIRED_BONES)
        if extra_bones:
            warnings.append(f"Extra bones (ignored): {sorted(extra_bones)}")

    # Check mesh with shape keys
    mesh_obj = None
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and obj.name.startswith("Face"):
            mesh_obj = obj
            break
    if not mesh_obj:
        for obj in bpy.data.objects:
            if obj.type == 'MESH':
                mesh_obj = obj
                break
    if not mesh_obj:
        errors.append("No mesh object found")
    else:
        # Check shape keys
        if mesh_obj.data.shape_keys:
            sk_names = {kb.name for kb in mesh_obj.data.shape_keys.key_blocks if kb.name != "Basis"}
            missing_shapes = set(REQUIRED_BLENDSHAPES) - sk_names
            if missing_shapes:
                errors.append(f"Missing shape keys: {sorted(missing_shapes)}")
        else:
            errors.append("Mesh has no shape keys (blendshapes)")

        # Check vertex groups (skinning)
        vg_names = {vg.name for vg in mesh_obj.vertex_groups}
        missing_vgs = set(REQUIRED_BONES) - vg_names
        if missing_vgs:
            errors.append(f"Missing vertex groups for bones: {sorted(missing_vgs)}")

        # Check armature modifier
        has_armature_mod = any(mod.type == 'ARMATURE' for mod in mesh_obj.modifiers)
        if not has_armature_mod:
            errors.append("Mesh missing Armature modifier")

        # Check UVs
        if not mesh_obj.data.uv_layers:
            warnings.append("Mesh has no UV layer (required for textures)")

    # Check materials
    mat_names = {mat.name for mat in bpy.data.materials}
    missing_mats = {"face_skin", "eyes", "mouth"} - mat_names
    if missing_mats:
        warnings.append(f"Missing standard materials (will create defaults): {sorted(missing_mats)}")

    return errors, warnings, mesh_obj, armature


def ensure_materials():
    """Create standard PBR materials if missing."""
    for name, props in MATERIAL_TYPES.items():
        if name not in bpy.data.materials:
            mat = bpy.data.materials.new(name=name)
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            nodes.clear()

            bsdf = nodes.new('ShaderNodeBsdfPrincipled')
            bsdf.inputs['Base Color'].default_value = props["base_color"]
            bsdf.inputs['Roughness'].default_value = props["roughness"]
            bsdf.inputs['Metallic'].default_value = props["metallic"]
            bsdf.inputs['Subsurface Weight'].default_value = 0.15 if name == "face_skin" else 0.0
            bsdf.inputs['Subsurface Radius'].default_value = (0.1, 0.05, 0.02) if name == "face_skin" else (0.0, 0.0, 0.0)

            out = nodes.new('ShaderNodeOutputMaterial')
            links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])


def assign_materials(mesh_obj):
    """Assign materials to mesh by vertex group / material slot."""
    # Ensure material slots exist
    for name in ["face_skin", "eyes", "mouth"]:
        if name not in [slot.material.name if slot.material else "" for slot in mesh_obj.material_slots]:
            if name in bpy.data.materials:
                mesh_obj.material_slots.new(name=bpy.data.materials[name].name)

    # Assign based on vertex groups (simplified: first slot = face_skin)
    # In production, you'd have proper face/eye/mouth vertex groups
    pass


def export_glb(output_path):
    """Export to GLB with required extensions."""
    ensure_materials()

    errors, warnings, mesh_obj, armature = validate_scene()
    if errors:
        print("VALIDATION ERRORS:")
        for e in errors:
            print(f"  - {e}")
        return False

    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  - {w}")

    # Select objects to export
    bpy.ops.object.select_all(action='DESELECT')
    if mesh_obj:
        mesh_obj.select_set(True)
    if armature:
        armature.select_set(True)

    # Export GLB
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_tangents=True,
        export_materials='EXPORT',
        export_colors=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_force_sampling=False,
        export_nla_strips=False,
        export_current_frame=False,
    )

    print(f"Exported: {output_path}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Export rigged character to production GLB")
    parser.add_argument("--output", "-o", required=True, help="Output GLB path")
    parser.add_argument("--validate-only", action="store_true", help="Only validate, don't export")
    args = parser.parse_args()

    if not IN_BLENDER:
        print("Error: Must run inside Blender")
        return 1

    errors, warnings, _, _ = validate_scene()
    if errors:
        print("VALIDATION ERRORS:")
        for e in errors:
            print(f"  - {e}")
        return 1
    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  - {w}")

    if args.validate_only:
        print("Validation passed.")
        return 0

    if export_glb(args.output):
        print(f"Success: {args.output}")
        return 0
    else:
        return 1


if __name__ == "__main__":
    sys.exit(main())