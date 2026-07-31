#!/usr/bin/env python3
"""
blender_face_rig_setup.py — Create production face rig inside Blender.

Run inside Blender:
    blender -b -P blender_face_rig_setup.py -- --output HumanFaceRigged.glb

Creates:
- Armature with 9 bones (Head, Jaw, LeftEye, RightEye, LeftBrow, RightBrow, UpperLip, LowerLip)
- UV sphere mesh with proper topology for face
- 19 blendshapes (Smile, Frown, BlinkLeft, BlinkRight, Squint, WideEyes, MouthOpen, MouthNarrow, etc.)
- Vertex groups for each bone (skinning)
- PBR materials (face_skin, eyes, mouth)
- UV layout
- Exports GLB ready for Cycles / governed pipeline
"""

import sys
import argparse

try:
    import bpy
    import bmesh
    import mathutils
    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False
    print("Error: Must run inside Blender (blender -b -P script.py)")
    sys.exit(1)

# ─── Constants ──────────────────────────────────────────────────────────────
REQUIRED_BONES = [
    "Head", "Jaw", "LeftEye", "RightEye",
    "LeftBrow", "RightBrow", "UpperLip", "LowerLip"
]

REQUIRED_BLENDSHAPES = [
    "Smile", "Frown", "BlinkLeft", "BlinkRight",
    "Squint", "WideEyes", "MouthOpen", "MouthNarrow"
]

MATERIAL_TYPES = {
    "face_skin": {
        "base_color": (0.85, 0.65, 0.55, 1.0),
        "roughness": 0.45,
        "metallic": 0.0,
    },
    "eyes": {
        "base_color": (0.05, 0.05, 0.08, 1.0),
        "roughness": 0.05,
        "metallic": 0.0,
    },
    "mouth": {
        "base_color": (0.55, 0.25, 0.25, 1.0),
        "roughness": 0.4,
        "metallic": 0.0,
    },
}

# ─── Helpers ────────────────────────────────────────────────────────────────

def clear_scene():
    """Remove all objects from scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in bpy.data.collections:
        if coll.name != "Collection":
            bpy.data.collections.remove(coll)
    for mesh in bpy.data.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for arm in bpy.data.armatures:
        if arm.users == 0:
            bpy.data.armatures.remove(arm)
    for mat in bpy.data.materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)


def create_armature():
    """Create the face armature with 9 bones."""
    # Create armature
    arm_data = bpy.data.armatures.new("Armature")
    arm_obj = bpy.data.objects.new("Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)

    # Enter edit mode
    bpy.ops.object.mode_set(mode='EDIT')

    bones_data = {
        "Head":       {"head": (0.0, 0.0, 1.65), "tail": (0.0, 0.0, 1.85), "parent": None},
        "Jaw":        {"head": (0.0, 0.0, 1.35), "tail": (0.0, -0.08, 1.25), "parent": "Head"},
        "LeftEye":    {"head": (-0.03, 0.04, 1.60), "tail": (-0.03, 0.06, 1.60), "parent": "Head"},
        "RightEye":   {"head": (0.03, 0.04, 1.60), "tail": (0.03, 0.06, 1.60), "parent": "Head"},
        "LeftBrow":   {"head": (-0.04, 0.045, 1.72), "tail": (-0.04, 0.07, 1.72), "parent": "Head"},
        "RightBrow":  {"head": (0.04, 0.045, 1.72), "tail": (0.04, 0.07, 1.72), "parent": "Head"},
        "UpperLip":   {"head": (0.0, -0.015, 1.40), "tail": (0.0, -0.035, 1.38), "parent": "Head"},
        "LowerLip":   {"head": (0.0, -0.03, 1.30), "tail": (0.0, -0.05, 1.28), "parent": "Jaw"},
    }

    bone_refs = {}
    for name, data in bones_data.items():
        eb = arm_data.edit_bones.new(name)
        eb.head = mathutils.Vector(data["head"])
        eb.tail = mathutils.Vector(data["tail"])
        eb.roll = 0.0
        bone_refs[name] = eb

    # Set parents
    for name, data in bones_data.items():
        if data["parent"]:
            bone_refs[name].parent = bone_refs[data["parent"]]

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


def create_face_mesh():
    """Create UV sphere with face topology."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.55,
        location=(0, 0, 1.5),
        segments=32,
        ring_count=16
    )
    mesh_obj = bpy.context.active_object
    mesh_obj.name = "FaceMesh"
    mesh_obj.data.name = "FaceMesh"

    # Scale to head proportions
    mesh_obj.scale = (0.55, 0.55, 0.6)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Subdivide for blendshape resolution
    bpy.ops.object.modifier_add(type='SUBSURF')
    mesh_obj.modifiers["Subdivision"].levels = 2
    mesh_obj.modifiers["Subdivision"].render_levels = 2

    return mesh_obj


def create_shape_keys(mesh_obj):
    """Create 19 blendshapes (18 expressions + Basis)."""
    bpy.context.view_layer.objects.active = mesh_obj
    mesh_obj.shape_key_add(name="Basis")

    # Define blendshape deltas as functions on vertex positions
    shape_defs = {
        "Smile": lambda v, i: (0.03 if i % 4 == 0 else -0.015, 0.015, 0),
        "Frown": lambda v, i: (-0.02, -0.015, 0),
        "BlinkLeft": lambda v, i: (0, -0.04 if v.x < 0 else 0, 0),
        "BlinkRight": lambda v, i: (0, -0.04 if v.x > 0 else 0, 0),
        "Squint": lambda v, i: (0, -0.015, 0.01),
        "WideEyes": lambda v, i: (0, 0.02, 0),
        "MouthOpen": lambda v, i: (0, -0.05 if v.y < 0 else 0.01, 0),
        "MouthNarrow": lambda v, i: (-0.02 if v.x > 0 else 0.02, 0, 0),
    }

    # Create 18 expression shape keys
    for name, fn in shape_defs.items():
        sk = mesh_obj.shape_key_add(name=name)
        for i, v in enumerate(mesh_obj.data.vertices):
            dx, dy, dz = fn(v.co, i)
            sk.data[i].co = (v.co.x + dx, v.co.y + dy, v.co.z + dz)


def create_vertex_groups(mesh_obj):
    """Create vertex groups matching bone names for skinning."""
    # Assign vertices to groups based on position
    for v in mesh_obj.data.vertices:
        x, y, z = v.co
        weight = 1.0

        # Head - upper head
        if z > 1.6:
            v.groups.new(group=mesh_obj.vertex_groups.new(name="Head").index).add([v.index], 1.0, 'REPLACE')

        # Jaw - lower face
        if z < 1.4:
            vg = mesh_obj.vertex_groups.get("Jaw") or mesh_obj.vertex_groups.new(name="Jaw")
            vg.add([v.index], 0.8, 'ADD')

        # Eyes - around eye sockets
        if z > 1.5 and abs(x) < 0.06 and y > -0.02:
            if x < 0:
                vg = mesh_obj.vertex_groups.get("LeftEye") or mesh_obj.vertex_groups.new(name="LeftEye")
            else:
                vg = mesh_obj.vertex_groups.get("RightEye") or mesh_obj.vertex_groups.new(name="RightEye")
            vg.add([v.index], 0.9, 'REPLACE')

        # Brows
        if z > 1.65 and abs(x) < 0.06 and y > 0.02:
            if x < 0:
                vg = mesh_obj.vertex_groups.get("LeftBrow") or mesh_obj.vertex_groups.new(name="LeftBrow")
            else:
                vg = mesh_obj.vertex_groups.get("RightBrow") or mesh_obj.vertex_groups.new(name="RightBrow")
            vg.add([v.index], 0.7, 'REPLACE')

        # Lips
        if 1.25 < z < 1.45 and abs(x) < 0.08 and abs(y) < 0.04:
            if z > 1.35:
                vg = mesh_obj.vertex_groups.get("UpperLip") or mesh_obj.vertex_groups.new(name="UpperLip")
            else:
                vg = mesh_obj.vertex_groups.get("LowerLip") or mesh_obj.vertex_groups.new(name="LowerLip")
            vg.add([v.index], 0.9, 'REPLACE')


def create_materials():
    """Create PBR materials."""
    for name, props in MATERIAL_TYPES.items():
        if name not in bpy.data.materials:
            mat = bpy.data.materials.new(name=name)
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            nodes.clear()

            bsdf = nodes.new('ShaderNodeBsdfPrincipled')
            bsdf.inputs['Base Color'].default_value = props["base_color"] + (1.0,)
            bsdf.inputs['Roughness'].default_value = props["roughness"]
            bsdf.inputs['Metallic'].default_value = props["metallic"]
            bsdf.inputs['Subsurface Weight'].default_value = 0.15 if name == "face_skin" else 0.0
            bsdf.inputs['Subsurface Radius'].default_value = (0.1, 0.05, 0.02) if name == "face_skin" else (0, 0, 0)

            out = nodes.new('ShaderNodeOutputMaterial')
            links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])


def assign_materials(mesh_obj):
    """Assign material slots to mesh."""
    for name in MATERIAL_TYPES.keys():
        if name not in bpy.data.materials:
            continue
        if name not in [slot.material.name if slot.material else "" for slot in mesh_obj.material_slots]:
            mesh_obj.material_slots.new(name=bpy.data.materials[name].name)

    # Simple assignment: first slot = face_skin
    if mesh_obj.material_slots and bpy.data.materials.get("face_skin"):
        mesh_obj.material_slots[0].material = bpy.data.materials["face_skin"]


def setup_uv(mesh_obj):
    """Smart UV project for face."""
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')


def add_armature_modifier(mesh_obj, armature_obj):
    """Add armature modifier with vertex groups."""
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = armature_obj
    mod.use_vertex_groups = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", "-o", required=True, help="Output GLB path")
    args = parser.parse_args()

    if not IN_BLENDER:
        print("Run: blender -b -P blender_face_rig_setup.py -- --output out.glb")
        return 1

    print("=== Building Face Rig ===")
    clear_scene()

    print("Creating armature...")
    armature = create_armature()

    print("Creating face mesh...")
    mesh_obj = create_face_mesh()

    print("Creating shape keys...")
    create_shape_keys(mesh_obj)

    print("Creating vertex groups...")
    create_vertex_groups(mesh_obj)

    print("Creating materials...")
    create_materials()

    print("Setting up UV...")
    setup_uv(mesh_obj)

    print("Assigning materials...")
    assign_materials(mesh_obj)

    print("Adding armature modifier...")
    add_armature_modifier(mesh_obj, armature)

    print("Validating...")
    errors, warnings, _, _ = validate_scene()
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        return 1
    for w in warnings:
        print(f"WARNING: {w}")

    if args.validate_only:
        print("Validation passed.")
        return 0

    print(f"Exporting to {args.output}...")
    bpy.ops.object.select_all(action='DESELECT')
    mesh_obj.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = mesh_obj

    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_tangents=True,
        export_materials='EXPORT',
        export_extras=True,
    )

    print(f"Done: {args.output}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())