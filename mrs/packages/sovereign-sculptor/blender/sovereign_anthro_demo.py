#!/usr/bin/env python3
"""Build, rig, animate, export, and render an actual anthro character in Blender.

This is a procedural integration proof, not a production character sculpt. It
consumes the same rig and skin records used by Sovereign Sculptor and emits an
engine-neutral GLB for Engine3D, Unity, and Unreal adapter work.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--rig", required=True)
    parser.add_argument("--skin", required=True)
    parser.add_argument(
        "--blueprint",
        default=str(
            Path(__file__).resolve().parents[1]
            / "fixtures"
            / "blueprints"
            / "heroic-fox-v1.blueprint.json"
        ),
    )
    parser.add_argument("--size", type=int, default=768)
    parser.add_argument("--seed", type=int, default=1990)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_digest(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block_group in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(block_group):
            if block.users == 0:
                block_group.remove(block)


def material(name: str, rgba: tuple[float, float, float, float], roughness: float, metallic: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def smooth(obj) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def triangulate(obj) -> None:
    """Freeze face triangulation before glTF export for stable topology."""
    if obj.type != "MESH":
        return
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces), quad_method="FIXED", ngon_method="EAR_CLIP")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()


def apply_scale(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def bind_mesh(obj, armature, bone_name: str) -> None:
    if obj.type != "MESH" or not obj.data.vertices:
        return
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new(name="SovereignArmature", type="ARMATURE")
    modifier.object = armature
    world_transform = obj.matrix_world.copy()
    obj.parent = armature
    obj.matrix_world = world_transform


def bind_mesh_gradient(obj, armature, start_bone: str, end_bone: str, start, end) -> None:
    """Blend a transition surface across two bones without changing vertex order."""
    start_v, end_v = Vector(start), Vector(end)
    axis = end_v - start_v
    length_squared = axis.length_squared
    if length_squared <= 1e-9:
        raise ValueError(f"cannot blend {obj.name} across a zero-length axis")
    start_group = obj.vertex_groups.new(name=start_bone)
    end_group = obj.vertex_groups.new(name=end_bone)
    for vertex in obj.data.vertices:
        t = max(0.0, min(1.0, (vertex.co - start_v).dot(axis) / length_squared))
        if t < 1.0:
            start_group.add([vertex.index], 1.0 - t, "REPLACE")
        if t > 0.0:
            end_group.add([vertex.index], t, "REPLACE")
    modifier = obj.modifiers.new(name="SovereignArmature", type="ARMATURE")
    modifier.object = armature
    world_transform = obj.matrix_world.copy()
    obj.parent = armature
    obj.matrix_world = world_transform


def add_uv_sphere(name, location, scale, mat, armature=None, bone=None, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.scale = scale
    apply_scale(obj)
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_cylinder(name, start, end, radius, mat, armature=None, bone=None, vertices=32):
    start_v, end_v = Vector(start), Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_tapered_segment(name, start, end, radius_start, radius_end, mat, armature=None, bone=None, vertices=36):
    start_v, end_v = Vector(start), Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_cone(name, location, radius, depth, mat, armature=None, bone=None, vertices=4, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0.02, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_cube(name, location, scale, mat, armature=None, bone=None, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.scale = scale
    apply_scale(obj)
    bevel_modifier = obj.modifiers.new(name="SoftEdges", type="BEVEL")
    bevel_modifier.width = bevel
    bevel_modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel_modifier.name)
    triangulate(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_torus(name, location, major_radius, minor_radius, scale, mat, armature=None, bone=None):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=48,
        minor_segments=12,
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.scale = scale
    apply_scale(obj)
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_flowing_limb(
    name, start, end, start_radius, end_radius, bulge, depth_ratio, twist_radians,
    curve_offset, mat, armature=None, bone=None, rings=14, segments=36,
    front_arc=0.0, back_arc=0.0, front_peak=0.5, back_peak=0.5,
):
    """Build a tapered, bowed, optionally twisting muscle surface."""
    start_v, end_v = Vector(start), Vector(end)
    direction = end_v - start_v
    if direction.length <= 1e-6:
        raise ValueError(f"{name} limb axis has zero length")
    axis = direction.normalized()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(axis.dot(reference)) > 0.92:
        reference = Vector((0.0, 1.0, 0.0))
    basis_x = axis.cross(reference).normalized()
    # Keep the first cross-section axis facing the character's front so biceps
    # and triceps shaping remains stable on mirrored limbs.
    if basis_x.dot(Vector((0.0, -1.0, 0.0))) < 0.0:
        basis_x = -basis_x
    basis_y = axis.cross(basis_x).normalized()
    curve = Vector(curve_offset)

    vertices = []
    vertex_uvs = []
    for ring in range(rings + 1):
        t = ring / rings
        center = start_v.lerp(end_v, t) + curve * math.sin(math.pi * t)
        radius = (
            start_radius * (1.0 - t)
            + end_radius * t
            + bulge * math.sin(math.pi * t)
        )
        twist = twist_radians * t
        cos_twist, sin_twist = math.cos(twist), math.sin(twist)
        twisted_x = basis_x * cos_twist + basis_y * sin_twist
        twisted_y = -basis_x * sin_twist + basis_y * cos_twist
        for segment in range(segments + 1):
            u = segment / segments
            angle = u * math.tau
            front = max(0.0, math.cos(angle))
            back = max(0.0, -math.cos(angle))
            front_profile = (
                math.sin(math.pi * t)
                * math.exp(-((t - front_peak) / 0.28) ** 2)
                / max(0.25, math.sin(math.pi * front_peak))
            )
            back_profile = (
                math.sin(math.pi * t)
                * math.exp(-((t - back_peak) / 0.28) ** 2)
                / max(0.25, math.sin(math.pi * back_peak))
            )
            arc_radius = radius + front_arc * front * front_profile + back_arc * back * back_profile
            vertex = (
                center
                + twisted_x * (math.cos(angle) * arc_radius)
                + twisted_y * (math.sin(angle) * arc_radius * depth_ratio)
            )
            vertices.append(tuple(vertex))
            vertex_uvs.append((u, t))

    faces = []
    stride = segments + 1
    for ring in range(rings):
        for segment in range(segments):
            a = ring * stride + segment
            faces.append((a, a + 1, a + stride + 1, a + stride))
    start_center = len(vertices)
    vertices.append(tuple(start_v))
    vertex_uvs.append((0.5, 0.0))
    end_center = len(vertices)
    vertices.append(tuple(end_v))
    vertex_uvs.append((0.5, 1.0))
    end_start = rings * stride
    for segment in range(segments):
        faces.append((start_center, segment + 1, segment))
        faces.append((end_center, end_start + segment, end_start + segment + 1))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = vertex_uvs[vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)
    if armature and bone:
        bind_mesh(obj, armature, bone)
    return obj


def add_blended_flowing_limb(
    name, start, end, start_radius, end_radius, bulge, depth_ratio, twist_radians,
    curve_offset, mat, armature, start_bone, end_bone, rings=14, segments=36,
    front_arc=0.0, back_arc=0.0, front_peak=0.5, back_peak=0.5,
):
    """Create a curved transition whose weights flow from one anatomical region to another."""
    obj = add_flowing_limb(
        name, start, end, start_radius, end_radius, bulge, depth_ratio,
        twist_radians, curve_offset, mat, None, None, rings, segments,
        front_arc, back_arc, front_peak, back_peak,
    )
    bind_mesh_gradient(obj, armature, start_bone, end_bone, start, end)
    return obj


def catmull_rom(a: float, b: float, c: float, d: float, t: float) -> float:
    return 0.5 * (
        (2.0 * b)
        + (-a + c) * t
        + (2.0 * a - 5.0 * b + 4.0 * c - d) * t * t
        + (-a + 3.0 * b - 3.0 * c + d) * t * t * t
    )


def add_anatomical_torso(name, mat, armature, blueprint_controls):
    """Build a single curved chest/waist/pelvis surface with blended rig weights."""
    # z, lateral radius, front/back radius, forward offset. The exaggerated
    # chest-to-waist-to-hip rhythm gives the anime silhouette intentional flow.
    controls = [tuple(float(value) for value in control) for control in blueprint_controls]
    if len(controls) < 4 or any(len(control) != 4 for control in controls):
        raise RuntimeError("heroic blueprint torsoControls must contain at least four [z,x,y,offset] records")
    if any(controls[index][0] >= controls[index + 1][0] for index in range(len(controls) - 1)):
        raise RuntimeError("heroic blueprint torsoControls must be ordered by increasing z")
    profile = []
    subdivisions = 4
    for index in range(len(controls) - 1):
        previous = controls[max(0, index - 1)]
        current = controls[index]
        following = controls[index + 1]
        after = controls[min(len(controls) - 1, index + 2)]
        for step in range(subdivisions):
            t = step / subdivisions
            profile.append(tuple(
                catmull_rom(previous[axis], current[axis], following[axis], after[axis], t)
                for axis in range(4)
            ))
    profile.append(controls[-1])

    segments = 56
    vertices = []
    vertex_uvs = []
    z_min, z_max = profile[0][0], profile[-1][0]
    for z, radius_x, radius_y, center_y in profile:
        v = (z - z_min) / (z_max - z_min)
        for segment in range(segments + 1):
            u = segment / segments
            angle = u * math.tau
            vertices.append((radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
            vertex_uvs.append((u, v))

    faces = []
    stride = segments + 1
    for ring in range(len(profile) - 1):
        for segment in range(segments):
            a = ring * stride + segment
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces.append((a, b, c, d))
    bottom_center = len(vertices)
    vertices.append((0.0, controls[0][3], controls[0][0]))
    vertex_uvs.append((0.5, 0.0))
    top_center = len(vertices)
    vertices.append((0.0, controls[-1][3], controls[-1][0]))
    vertex_uvs.append((0.5, 1.0))
    top_start = (len(profile) - 1) * stride
    for segment in range(segments):
        faces.append((bottom_center, segment + 1, segment))
        faces.append((top_center, top_start + segment, top_start + segment + 1))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = vertex_uvs[vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)

    groups = {
        bone: obj.vertex_groups.new(name=bone)
        for bone in ("pelvis", "spine", "chest")
    }
    for vertex in obj.data.vertices:
        normalized_z = (vertex.co.z - z_min) / (z_max - z_min)
        if normalized_z <= 0.25:
            weights = {"pelvis": 1.0}
        elif normalized_z < 0.45:
            spine_weight = (normalized_z - 0.25) / 0.20
            weights = {"pelvis": 1.0 - spine_weight, "spine": spine_weight}
        elif normalized_z <= 0.67:
            weights = {"spine": 1.0}
        elif normalized_z < 0.84:
            chest_weight = (normalized_z - 0.67) / 0.17
            weights = {"spine": 1.0 - chest_weight, "chest": chest_weight}
        else:
            weights = {"chest": 1.0}
        for bone, weight in weights.items():
            if weight > 0.0:
                groups[bone].add([vertex.index], weight, "REPLACE")
    modifier = obj.modifiers.new(name="SovereignArmature", type="ARMATURE")
    modifier.object = armature
    world_transform = obj.matrix_world.copy()
    obj.parent = armature
    obj.matrix_world = world_transform
    return obj


def add_neck_mantle(name, mat, armature, blueprint_controls):
    """Sculpt one chest-to-skull mantle with blended chest and neck weights."""
    controls = [tuple(float(value) for value in control) for control in blueprint_controls]
    if len(controls) < 4 or any(len(control) != 4 for control in controls):
        raise RuntimeError("heroic blueprint neck mantle needs at least four [z,x,y,offset] records")
    if any(controls[index][0] >= controls[index + 1][0] for index in range(len(controls) - 1)):
        raise RuntimeError("heroic blueprint neck mantle controls must be ordered by increasing z")

    profile = []
    subdivisions = 4
    for index in range(len(controls) - 1):
        previous = controls[max(0, index - 1)]
        current = controls[index]
        following = controls[index + 1]
        after = controls[min(len(controls) - 1, index + 2)]
        for step in range(subdivisions):
            t = step / subdivisions
            profile.append(tuple(
                catmull_rom(previous[axis], current[axis], following[axis], after[axis], t)
                for axis in range(4)
            ))
    profile.append(controls[-1])

    segments = 48
    vertices = []
    vertex_uvs = []
    z_min, z_max = profile[0][0], profile[-1][0]
    for z, radius_x, radius_y, center_y in profile:
        normalized_z = (z - z_min) / (z_max - z_min)
        for segment in range(segments + 1):
            u = segment / segments
            angle = u * math.tau
            vertices.append((radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
            vertex_uvs.append((u, normalized_z))

    faces = []
    stride = segments + 1
    for ring in range(len(profile) - 1):
        for segment in range(segments):
            a = ring * stride + segment
            faces.append((a, a + 1, a + stride + 1, a + stride))
    bottom_center = len(vertices)
    vertices.append((0.0, controls[0][3], controls[0][0]))
    vertex_uvs.append((0.5, 0.0))
    top_center = len(vertices)
    vertices.append((0.0, controls[-1][3], controls[-1][0]))
    vertex_uvs.append((0.5, 1.0))
    top_start = (len(profile) - 1) * stride
    for segment in range(segments):
        faces.append((bottom_center, segment + 1, segment))
        faces.append((top_center, top_start + segment, top_start + segment + 1))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = vertex_uvs[vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)

    chest_group = obj.vertex_groups.new(name="chest")
    neck_group = obj.vertex_groups.new(name="neck")
    for vertex in obj.data.vertices:
        normalized_z = max(0.0, min(1.0, (vertex.co.z - z_min) / (z_max - z_min)))
        neck_weight = 0.0 if normalized_z <= 0.28 else min(1.0, (normalized_z - 0.28) / 0.55)
        if neck_weight < 1.0:
            chest_group.add([vertex.index], 1.0 - neck_weight, "REPLACE")
        if neck_weight > 0.0:
            neck_group.add([vertex.index], neck_weight, "REPLACE")
    modifier = obj.modifiers.new(name="SovereignArmature", type="ARMATURE")
    modifier.object = armature
    world_transform = obj.matrix_world.copy()
    obj.parent = armature
    obj.matrix_world = world_transform
    return obj


def add_curved_claw(name, start, tension_direction, length, radius, mat, armature, bone):
    """Create a two-stage hook that follows the digit's tension line."""
    start_v = Vector(start)
    forward = Vector(tension_direction).normalized()
    downward = Vector((0.0, 0.0, -1.0))
    middle = start_v + forward * (length * 0.56) + downward * (length * 0.08)
    end = start_v + forward * length + downward * (length * 0.34)
    root = add_flowing_limb(
        f"{name}.Root", start_v, middle,
        radius, radius * 0.62, radius * 0.08, 0.72, 0.0,
        downward * (length * 0.035), mat, armature, bone, 6, 12,
    )
    hook = add_flowing_limb(
        f"{name}.Hook", middle, end,
        radius * 0.62, radius * 0.12, 0.0, 0.68, 0.0,
        downward * (length * 0.06), mat, armature, bone, 6, 12,
    )
    return [root, hook]


def add_articulated_hand(name, wrist, forward, mat, claw_mat, armature, bone, mirror_sign):
    """Build a short palm, three curved digits, webbing, and hooked claws."""
    wrist_v = Vector(wrist)
    direction = Vector(forward).normalized()
    fan_axis = Vector((-direction.z, 0.0, direction.x)).normalized()
    palm_end = wrist_v + direction * 0.21
    objects = [add_flowing_limb(
        f"{name}.Palm", wrist_v, palm_end,
        0.12, 0.14, 0.018, 0.66, math.radians(8 * mirror_sign),
        (0.0, -0.018, 0.0), mat, armature, bone, 10, 28,
    )]
    digit_starts = []
    digit_ends = []
    for index, (offset, length) in enumerate(((-0.085, 0.17), (0.0, 0.195), (0.085, 0.17))):
        digit_start = palm_end + fan_axis * (offset * 0.52)
        digit_end = palm_end + direction * length + fan_axis * offset
        digit_starts.append(digit_start)
        digit_ends.append(digit_end)
        objects.append(add_flowing_limb(
            f"{name}.Digit.{index}", digit_start, digit_end,
            0.052, 0.034, 0.012, 0.70, math.radians(5 * mirror_sign),
            fan_axis * (offset * 0.18) + Vector((0.0, -0.012, 0.018)),
            mat, armature, bone, 9, 20,
        ))
    for index in range(2):
        objects.append(add_flowing_limb(
            f"{name}.Webbing.{index}", digit_starts[index], digit_starts[index + 1],
            0.025, 0.025, 0.006, 0.42, 0.0,
            direction * 0.012, mat, armature, bone, 6, 14,
        ))
    for index, digit_end in enumerate(digit_ends):
        objects.extend(add_curved_claw(
            f"{name}.Claw.{index}", digit_end, direction, 0.085, 0.022,
            claw_mat, armature, bone,
        ))
    return objects


def add_curved_tail(name, mat, tip_mat, armature, blueprint_controls, tip_config):
    """Build one weighted root wedge, living S-curve, gradual taper, and soft tip."""
    controls = [
        (tuple(float(value) for value in control[0]), float(control[1]), float(control[2]))
        for control in blueprint_controls
    ]
    if len(controls) < 4 or any(len(control[0]) != 3 for control in controls):
        raise RuntimeError("heroic blueprint tailControls must contain at least four [[x,y,z],radius,flatten] records")
    samples = []
    subdivisions = 4
    for index in range(len(controls) - 1):
        previous = controls[max(0, index - 1)]
        current = controls[index]
        following = controls[index + 1]
        after = controls[min(len(controls) - 1, index + 2)]
        for step in range(subdivisions):
            local_t = step / subdivisions
            point = Vector(tuple(
                catmull_rom(previous[0][axis], current[0][axis], following[0][axis], after[0][axis], local_t)
                for axis in range(3)
            ))
            radius = catmull_rom(previous[1], current[1], following[1], after[1], local_t)
            flatten = catmull_rom(previous[2], current[2], following[2], after[2], local_t)
            global_t = (index + local_t) / (len(controls) - 1)
            samples.append((point, radius, flatten, global_t))
    samples.append((Vector(controls[-1][0]), controls[-1][1], controls[-1][2], 1.0))

    segments = 40
    vertices = []
    vertex_uvs = []
    for index, (point, radius, flatten, global_t) in enumerate(samples):
        before = samples[max(0, index - 1)][0]
        after = samples[min(len(samples) - 1, index + 1)][0]
        tangent = (after - before).normalized()
        reference = Vector((0.0, 1.0, 0.0))
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((0.0, 0.0, 1.0))
        lateral = tangent.cross(reference).normalized()
        depth = tangent.cross(lateral).normalized()
        for segment in range(segments + 1):
            u = segment / segments
            angle = u * math.tau
            vertex = point + lateral * (math.cos(angle) * radius) + depth * (math.sin(angle) * radius * flatten)
            vertices.append(tuple(vertex))
            vertex_uvs.append((u, global_t))
    faces = []
    stride = segments + 1
    for ring in range(len(samples) - 1):
        for segment in range(segments):
            a = ring * stride + segment
            faces.append((a, a + 1, a + stride + 1, a + stride))
    start_center = len(vertices)
    vertices.append(tuple(samples[0][0]))
    vertex_uvs.append((0.5, 0.0))
    end_center = len(vertices)
    vertices.append(tuple(samples[-1][0]))
    vertex_uvs.append((0.5, 1.0))
    end_start = (len(samples) - 1) * stride
    for segment in range(segments):
        faces.append((start_center, segment + 1, segment))
        faces.append((end_center, end_start + segment, end_start + segment + 1))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = vertex_uvs[vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    triangulate(obj)
    smooth(obj)
    obj.data.materials.append(mat)

    groups = {bone: obj.vertex_groups.new(name=bone) for bone in ("tail.0", "tail.1", "tail.2")}
    for vertex in obj.data.vertices:
        nearest = min(samples, key=lambda sample: (vertex.co - sample[0]).length_squared)
        t = nearest[3]
        if t < 0.32:
            weights = {"tail.0": 1.0}
        elif t < 0.44:
            tail_one = (t - 0.32) / 0.12
            weights = {"tail.0": 1.0 - tail_one, "tail.1": tail_one}
        elif t < 0.66:
            weights = {"tail.1": 1.0}
        elif t < 0.78:
            tail_two = (t - 0.66) / 0.12
            weights = {"tail.1": 1.0 - tail_two, "tail.2": tail_two}
        else:
            weights = {"tail.2": 1.0}
        for bone, weight in weights.items():
            if weight > 0.0:
                groups[bone].add([vertex.index], weight, "REPLACE")
    modifier = obj.modifiers.new(name="SovereignArmature", type="ARMATURE")
    modifier.object = armature
    world_transform = obj.matrix_world.copy()
    obj.parent = armature
    obj.matrix_world = world_transform
    tip = add_uv_sphere(
        f"{name}.SoftTip", tuple(tip_config["center"]), tuple(tip_config["scale"]),
        tip_mat, armature, "tail.2", 36, 22,
    )
    return [obj, tip]


def build_armature(rig: dict, blueprint: dict):
    positions = {
        bone_id: tuple(float(value) for value in position)
        for bone_id, position in blueprint["bonePositions"].items()
    }
    required_bones = {bone["id"] for bone in rig["bones"]}
    missing = sorted(required_bones - set(positions))
    if missing:
        raise RuntimeError(f"heroic blueprint is missing rig bone positions: {', '.join(missing)}")
    children: dict[str, list[str]] = {bone["id"]: [] for bone in rig["bones"]}
    for bone in rig["bones"]:
        if bone["parentId"]:
            children[bone["parentId"]].append(bone["id"])

    armature_data = bpy.data.armatures.new("SovereignAnthroRig")
    armature = bpy.data.objects.new("SovereignAnthroRig", armature_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    armature.show_in_front = True
    armature.data.display_type = "BBONE"
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = {}
    for bone in rig["bones"]:
        bone_id = bone["id"]
        head = Vector(positions[bone_id])
        child_ids = children[bone_id]
        if child_ids:
            tail = Vector(positions[child_ids[0]])
        elif bone["parentId"]:
            parent = Vector(positions[bone["parentId"]])
            direction = head - parent
            tail = head + (direction.normalized() * max(0.18, min(0.42, direction.length * 0.55)))
        else:
            tail = head + Vector((0, 0, 0.3))
        if (tail - head).length < 0.05:
            tail = head + Vector((0, 0, 0.18))
        edit = armature_data.edit_bones.new(bone_id)
        edit.head = head
        edit.tail = tail
        edit.use_connect = False
        edit_bones[bone_id] = edit
    for bone in rig["bones"]:
        if bone["parentId"]:
            edit_bones[bone["id"]].parent = edit_bones[bone["parentId"]]
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature, positions


def add_face_shapes(head, names: list[str]) -> None:
    basis = head.shape_key_add(name="Basis")
    for name in names:
        key = head.shape_key_add(name=name)
        for index, vertex in enumerate(basis.data):
            co = vertex.co.copy()
            if name == "jawOpen" and co.y < -0.12 and co.z < 0.02:
                co.z -= 0.15 * max(0.0, 1.0 - abs(co.x) / 0.7)
                co.y -= 0.035
            elif name == "smile" and co.y < -0.25 and co.z < 0.04 and abs(co.x) > 0.18:
                co.z += 0.07
            elif name == "frown" and co.y < -0.25 and co.z < 0.04 and abs(co.x) > 0.18:
                co.z -= 0.06
            elif name == "muzzleSneer" and co.y < -0.28 and co.x > 0.0:
                co.z += 0.055
            elif name == "blink.L" and co.x > 0.0 and co.y < -0.32 and 0.0 < co.z < 0.30:
                co.z -= 0.05
            elif name == "blink.R" and co.x < 0.0 and co.y < -0.32 and 0.0 < co.z < 0.30:
                co.z -= 0.05
            elif name == "browUp.L" and co.x > 0.0 and co.y < -0.25 and co.z > 0.10:
                co.z += 0.045
            elif name == "browUp.R" and co.x < 0.0 and co.y < -0.25 and co.z > 0.10:
                co.z += 0.045
            key.data[index].co = co
    if head.data.shape_keys and head.data.shape_keys.key_blocks.get("jawOpen"):
        head.data.shape_keys.key_blocks["jawOpen"].value = 0.42


def build_character(rig: dict, skin: dict, blueprint: dict, seed: int):
    random.seed(seed)
    armature, p = build_armature(rig, blueprint)
    orange = material("fur_orange", (0.72, 0.16, 0.035, 1), 0.56)
    cream = material("fur_cream", (0.96, 0.69, 0.35, 1), 0.62)
    dark = material("ink_dark", (0.018, 0.028, 0.045, 1), 0.32, 0.12)
    gold = material("armor_gold", (0.48, 0.22, 0.045, 1), 0.23, 0.75)
    scarf = material("scarf_red", (0.35, 0.018, 0.025, 1), 0.70)
    eye = material("eye_amber", (1.0, 0.42, 0.025, 1), 0.18)
    black = material("pupil_black", (0.002, 0.003, 0.004, 1), 0.22)
    white = material("eye_highlight", (1.0, 0.96, 0.82, 1), 0.15)

    meshes = []
    # One continuous anatomical surface replaces the assembled barrel shapes.
    # Its silhouette carries a deliberate chest/waist/hip curvature, and its
    # vertices blend across pelvis, spine, and chest bones.
    meshes.append(add_anatomical_torso("TorsoAnatomy", orange, armature, blueprint["torsoControls"]))
    # Belly markings are intentionally absent from geometry. The governed AI
    # surface painter owns that color boundary after topology and UV validation.
    # Paired trapezius ridges overlap the torso and neck to remove the peg-like
    # transition while leaving the arm free to rotate beneath the shoulder wrap.
    neck = blueprint["neck"]
    meshes.append(add_neck_mantle(
        "NeckTrapeziusMantle", orange, armature, neck["mantleControls"],
    ))
    for side, sign in (("L", 1), ("R", -1)):
        meshes.append(add_flowing_limb(
            f"TrapeziusSlope.{side}",
            (neck["trapeziusInnerX"] * sign, 0.02, neck["trapeziusInnerZ"]),
            (neck["trapeziusOuterX"] * sign, 0.0, neck["trapeziusOuterZ"]),
            neck["trapeziusInnerRadius"], neck["trapeziusOuterRadius"],
            0.025, 0.56, math.radians(4 * sign),
            (0.0, 0.015, 0.045), orange, armature, "chest", 12, 32,
        ))
    face = blueprint["head"]
    head = add_uv_sphere("FaceHead", tuple(face["center"]), tuple(face["scale"]), orange, armature, "head", 56, 36)
    add_face_shapes(head, [shape["id"] for shape in rig["blendshapes"]])
    meshes.append(head)
    meshes.append(add_uv_sphere("Muzzle", tuple(face["muzzleCenter"]), tuple(face["muzzleScale"]), cream, armature, "muzzle", 40, 24))
    meshes.append(add_uv_sphere("LowerJaw", tuple(face["jawCenter"]), tuple(face["jawScale"]), cream, armature, "jaw", 36, 20))
    meshes.append(add_uv_sphere("Nose", tuple(face["noseCenter"]), tuple(face["noseScale"]), black, armature, "muzzle", 28, 16))

    for side, sign in (("L", 1), ("R", -1)):
        ear_bone = f"ear.{side}"
        ear_center = (face["earX"] * sign, face["earCenterY"], face["earCenterZ"])
        meshes.append(add_cone(f"Ear.{side}", ear_center, face["earRadius"], face["earDepth"], orange, armature, ear_bone, 4, (0, 0.08 * sign, 0.12 * sign)))
        inner_center = (face["earX"] * sign, face["earCenterY"] - 0.08, face["earCenterZ"] - 0.01)
        meshes.append(add_cone(f"EarInner.{side}", inner_center, face["earRadius"] * 0.62, face["earDepth"] * 0.72, scarf, armature, ear_bone, 4, (0, 0.08 * sign, 0.12 * sign)))
        eye_bone = f"eye.{side}"
        x = face["eyeX"] * sign
        eye_center = (x, face["eyeCenterY"], face["eyeCenterZ"])
        meshes.append(add_uv_sphere(f"Eye.{side}", eye_center, (0.15, 0.085, 0.16), eye, armature, eye_bone, 32, 20))
        meshes.append(add_uv_sphere(f"Pupil.{side}", (x, face["eyeCenterY"] - 0.075, face["eyeCenterZ"]), (0.050, 0.020, 0.082), black, armature, eye_bone, 24, 14))
        meshes.append(add_uv_sphere(f"Highlight.{side}", (x + 0.020 * sign, face["eyeCenterY"] - 0.095, face["eyeCenterZ"] + 0.04), (0.020, 0.010, 0.027), white, armature, eye_bone, 16, 10))

    # Arms: a shoulder-wrap profile flows into a narrow elbow, then the forearm
    # twists and flares before tapering into the wrist.
    limb_specs = [
        (side, tuple(spec["shoulder"]), tuple(spec["elbow"]), tuple(spec["wrist"]), tuple(spec["handForward"]))
        for side, spec in blueprint["arms"].items()
    ]
    for side, shoulder, elbow, wrist, hand_forward in limb_specs:
        arm_spec = blueprint["arms"][side]
        upper_bone = f"arm.{side}Upper"
        lower_bone = f"arm.{side}Lower"
        sign = 1 if side == "L" else -1
        meshes.append(add_blended_flowing_limb(
            f"ChestDeltoidWrap.{side}",
            tuple(arm_spec["chestAnchor"]), tuple(arm_spec["deltoidEnd"]),
            0.17, 0.235, 0.025, 0.62, math.radians(10 * sign),
            (0.0, -0.018, 0.035), orange, armature, "chest", upper_bone,
            12, 34, 0.035, 0.028, 0.44, 0.62,
        ))
        meshes.append(add_flowing_limb(
            f"DeltoidUpperArmFlow.{side}", shoulder, elbow,
            0.225, 0.14, 0.072, 0.82, math.radians(8 * sign),
            (0.0, -0.025, 0.035), orange, armature, upper_bone,
            front_arc=0.075, back_arc=0.060, front_peak=0.36, back_peak=0.64,
        ))
        meshes.append(add_flowing_limb(
            f"ForearmTwist.{side}", elbow, wrist,
            0.132, 0.105, 0.078, 0.76, math.radians(38 * sign),
            (0.0, -0.035, 0.018), orange, armature, lower_bone,
            front_arc=0.030, back_arc=0.014,
        ))
        meshes.extend(add_articulated_hand(
            f"Hand.{side}", wrist, hand_forward,
            cream, dark, armature, f"arm.{side}End", sign,
        ))

    # Digitigrade chain: muscular thigh, forward knee, rear hock, then a broad
    # weight-bearing paw. Tapered segments remove the toy-block silhouette.
    for side, sign in (("L", 1), ("R", -1)):
        thigh_bone = f"thigh.{side}"
        shin_bone = f"shin.{side}"
        hock_bone = f"hock.{side}"
        paw_bone = f"paw.{side}"
        leg = blueprint["legs"][side]
        hip = tuple(leg["hip"])
        knee = tuple(leg["knee"])
        hock = tuple(leg["hock"])
        meshes.append(add_flowing_limb(
            f"QuadHamstringArc.{side}", hip, knee,
            0.285, 0.16, 0.075, 0.88, math.radians(6 * sign),
            (0.025 * sign, 0.045, 0.0), orange, armature, thigh_bone,
        ))
        meshes.append(add_uv_sphere(f"Knee.{side}", knee, (0.165, 0.15, 0.165), orange, armature, shin_bone, 30, 18))
        meshes.append(add_flowing_limb(
            f"CalfHockArc.{side}", knee, hock,
            0.15, 0.115, 0.082, 0.80, math.radians(-10 * sign),
            (0.018 * sign, 0.055, 0.0), orange, armature, shin_bone,
        ))
        meshes.append(add_uv_sphere(f"HockJoint.{side}", hock, (0.14, 0.13, 0.14), orange, armature, hock_bone, 28, 16))
        ankle = tuple(leg["ankle"])
        meshes.append(add_flowing_limb(
            f"HockAnkleTaper.{side}", hock, ankle,
            0.13, 0.095, 0.018, 0.82, math.radians(5 * sign),
            (0.0, 0.0, 0.025), orange, armature, hock_bone, 12, 32,
        ))
        paw_x = ankle[0]
        meshes.append(add_uv_sphere(f"HeelPad.{side}", (paw_x, ankle[1] + 0.03, ankle[2] - 0.03), (0.19, 0.21, 0.15), cream, armature, paw_bone, 32, 18))
        meshes.append(add_flowing_limb(
            f"PawArch.{side}", (paw_x, ankle[1] + 0.03, ankle[2] - 0.04), (paw_x, ankle[1] - 0.29, ankle[2] - 0.13),
            0.18, 0.15, 0.085, 0.62, 0.0,
            (0.0, 0.0, 0.045), cream, armature, paw_bone, 12, 32,
        ))
        toe_bases = []
        toe_ends = []
        for toe_index, offset in enumerate((-0.16, 0.0, 0.16)):
            toe_x = paw_x + offset
            toe_base = Vector((toe_x, ankle[1] - 0.26, ankle[2] - 0.13))
            toe_end = Vector((toe_x, ankle[1] - 0.51, ankle[2] - 0.175))
            toe_bases.append(toe_base)
            toe_ends.append(toe_end)
            meshes.append(add_flowing_limb(
                f"CurvedToe.{side}.{toe_index}", toe_base, toe_end,
                0.085, 0.052, 0.025, 0.72, 0.0,
                (0.0, 0.0, 0.035), cream, armature, paw_bone, 10, 24,
            ))
        for web_index in range(2):
            meshes.append(add_flowing_limb(
                f"ToeWebbing.{side}.{web_index}", toe_bases[web_index], toe_bases[web_index + 1],
                0.028, 0.028, 0.006, 0.40, 0.0,
                (0.0, -0.012, 0.0), cream, armature, paw_bone, 6, 14,
            ))
        for toe_index, toe_end in enumerate(toe_ends):
            meshes.extend(add_curved_claw(
                f"Claw.{side}.{toe_index}", toe_end, (0.0, -1.0, 0.0), 0.105, 0.026,
                dark, armature, paw_bone,
            ))

    tail_root = blueprint["tailRoot"]
    meshes.append(add_blended_flowing_limb(
        "TailRootPelvicWedge", tuple(tail_root["start"]), tuple(tail_root["end"]),
        tail_root["startRadius"], tail_root["endRadius"], 0.025,
        tail_root["depthRatio"], 0.0, tuple(tail_root["curveOffset"]),
        orange, armature, "pelvis", "tail.0", 12, 38,
    ))
    meshes.extend(add_curved_tail(
        "LivingTail", orange, cream, armature,
        blueprint["tailControls"], blueprint["tailTip"],
    ))

    # Costume geometry stays limited to actual wearables. Chest and belly
    # graphics belong to the governed AI surface painter after topology/UV lock.
    costume = blueprint["costumeAnchors"]
    meshes.append(add_torus("BeltRing", (0, 0.0, costume["beltZ"]), 0.61, 0.045, (1.0, 0.70, 1.0), gold, armature, "pelvis"))
    meshes.append(add_uv_sphere("BeltBuckle", (0, -0.43, costume["beltZ"]), (0.14, 0.04, 0.11), gold, armature, "pelvis", 24, 14))
    meshes.append(add_uv_sphere("Scarf", (0, -0.02, costume["scarfZ"]), (0.42, 0.31, 0.14), scarf, armature, "neck", 32, 18))
    # Shoulder and forearm decoration now belongs to the surface layer, keeping
    # the actual deltoid/forearm curvature visible to the artist and validator.

    # Small fur tufts improve the silhouette without changing the governed rig.
    for index, x in enumerate((-0.18, 0.0, 0.18)):
        meshes.append(add_cone(
            f"HeadTuft.{index}",
            (x, face["center"][1] + 0.16, face["center"][2] + 0.51 + 0.06 * (index % 2)),
            0.10, 0.30, orange, armature, "head", 5, (0.16, 0, -0.18 * x),
        ))

    # A short dialogue animation proves that exported blendshapes and bones move.
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 16
    if head.data.shape_keys:
        jaw = head.data.shape_keys.key_blocks["jawOpen"]
        for frame, value in ((1, 0.0), (8, 0.55), (16, 0.12)):
            jaw.value = value
            jaw.keyframe_insert(data_path="value", frame=frame)
    pose_head = armature.pose.bones.get("head")
    if pose_head:
        pose_head.rotation_mode = "XYZ"
        for frame, angle in ((1, 0.0), (8, math.radians(4)), (16, math.radians(-2))):
            pose_head.rotation_euler[2] = angle
            pose_head.keyframe_insert(data_path="rotation_euler", frame=frame)
    scene.frame_set(8)
    return armature, meshes, head


def look_at(obj, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_render(output: Path, size: int, blueprint: dict) -> None:
    scene = bpy.context.scene
    # Blender 5.2 shortened the Eevee engine identifier. Keep the older
    # identifier as a fallback so the same governed adapter remains replayable
    # on the Windows-era Blender 4.x installations.
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.render.use_file_extension = True
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    # Mandala owns the production cel/outline shader. Blender's Freestyle would
    # outline every overlapping anatomical object and falsely reintroduce hard
    # joint seams, so this proof renders the underlying curved volumes cleanly.
    try:
        scene.render.use_freestyle = False
    except Exception:
        pass
    world = bpy.data.worlds.new("MandalaStudioWorld") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs[0].default_value = (0.004, 0.014, 0.022, 1)
    background.inputs[1].default_value = 0.18

    ground_mat = material("StudioFloor", (0.012, 0.035, 0.045, 1), 0.24, 0.25)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "StudioFloor"
    ground.data.materials.append(ground_mat)

    camera_config = blueprint["camera"]
    bpy.ops.object.camera_add(location=tuple(camera_config["location"]))
    camera = bpy.context.object
    camera.name = "MandalaDemoCamera"
    camera.data.lens = camera_config["lens"]
    look_at(camera, tuple(camera_config["target"]))
    scene.camera = camera

    def area(name, location, energy, color, size_value):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size_value
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        look_at(obj, tuple(camera_config["target"]))

    area("KeyWarm", (4.0, -5.0, 7.2), 1250, (1.0, 0.54, 0.28), 4.0)
    area("FillTeal", (-4.5, -2.0, 5.0), 1050, (0.12, 0.72, 0.82), 4.5)
    area("RimBlue", (2.5, 3.8, 6.2), 1450, (0.08, 0.38, 1.0), 3.0)


def render_silhouette(path: Path) -> None:
    """Render a black-on-light diagnostic without changing exported materials."""
    scene = bpy.context.scene
    view_layer = scene.view_layers[0]
    background = scene.world.node_tree.nodes.get("Background")
    ground = bpy.data.objects.get("StudioFloor")
    original_filepath = scene.render.filepath
    original_override = view_layer.material_override
    original_color = tuple(background.inputs[0].default_value)
    original_strength = background.inputs[1].default_value
    original_ground_visibility = ground.hide_render if ground else False
    silhouette = bpy.data.materials.new("SilhouetteDiagnostic")
    silhouette.use_nodes = True
    nodes = silhouette.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    emission.inputs["Strength"].default_value = 0.0
    silhouette.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    try:
        view_layer.material_override = silhouette
        background.inputs[0].default_value = (0.82, 0.85, 0.88, 1)
        background.inputs[1].default_value = 0.8
        if ground:
            ground.hide_render = True
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    finally:
        view_layer.material_override = original_override
        background.inputs[0].default_value = original_color
        background.inputs[1].default_value = original_strength
        if ground:
            ground.hide_render = original_ground_visibility
        scene.render.filepath = original_filepath


def export_glb(path: Path, armature, meshes: list) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        # Mandala hashes every morph delta and intentionally rejects sparse
        # accessor ambiguity, so ask Blender for dense shape-key payloads.
        export_try_sparse_sk=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


def seal_governed_glb(path: Path, rig: dict, skin: dict, blueprint: dict) -> dict:
    """Add Sovereign metadata to Blender's standards-compliant GLB.

    Blender owns geometry encoding and animation. This pass changes only the
    JSON chunk so Mandala can validate stable IDs and surface-only policy while
    leaving the binary mesh/accessor payload byte-for-byte untouched.
    """
    payload = path.read_bytes()
    if len(payload) < 20 or payload[:4] != b"glTF":
        raise RuntimeError("Blender did not produce a GLB 2.0 container")
    magic, version, total_length = struct.unpack_from("<III", payload, 0)
    if magic != 0x46546C67 or version != 2 or total_length != len(payload):
        raise RuntimeError("Blender GLB header is invalid")
    chunks: list[tuple[int, bytes]] = []
    offset = 12
    while offset < len(payload):
        if offset + 8 > len(payload):
            raise RuntimeError("Blender GLB has a truncated chunk header")
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        start, end = offset + 8, offset + 8 + chunk_length
        if end > len(payload):
            raise RuntimeError("Blender GLB has a truncated chunk")
        chunks.append((chunk_type, payload[start:end]))
        offset = end
    json_index = next((index for index, item in enumerate(chunks) if item[0] == 0x4E4F534A), None)
    if json_index is None:
        raise RuntimeError("Blender GLB has no JSON chunk")
    gltf = json.loads(chunks[json_index][1].decode("utf-8").rstrip(" \t\r\n\0"))
    bin_index = next((index for index, item in enumerate(chunks) if item[0] == 0x004E4942), None)
    if bin_index is None:
        raise RuntimeError("Blender GLB has no binary chunk")
    binary = bytearray(chunks[bin_index][1])
    component_formats = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}
    component_sizes = {5121: 1, 5123: 2, 5125: 4, 5126: 4}

    def accessor_layout(accessor_index: int, components: int) -> tuple[dict, int, int, str]:
        accessor = gltf["accessors"][accessor_index]
        if "sparse" in accessor:
            raise RuntimeError(f"governed sealing refuses sparse accessor {accessor_index}")
        component_type = accessor["componentType"]
        view = gltf["bufferViews"][accessor["bufferView"]]
        element_size = component_sizes[component_type] * components
        stride = view.get("byteStride", element_size)
        if stride != element_size:
            raise RuntimeError(f"governed sealing requires a tight accessor {accessor_index}")
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return accessor, offset, stride, component_formats[component_type]

    # glTF permits arbitrary triangle-list order. Sorting cyclically normalized
    # triangles removes Blender worker-order drift without changing winding.
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            index_accessor, index_offset, index_stride, index_format = accessor_layout(primitive["indices"], 1)
            triangles: list[tuple[int, int, int]] = []
            for triangle_index in range(index_accessor["count"] // 3):
                values = tuple(
                    struct.unpack_from(f"<{index_format}", binary, index_offset + (triangle_index * 3 + slot) * index_stride)[0]
                    for slot in range(3)
                )
                rotations = (values, (values[1], values[2], values[0]), (values[2], values[0], values[1]))
                triangles.append(min(rotations))
            triangles.sort()
            for value_index, value in enumerate(item for triangle in triangles for item in triangle):
                struct.pack_into(f"<{index_format}", binary, index_offset + value_index * index_stride, value)

            uv_accessor, uv_offset, uv_stride, uv_format = accessor_layout(primitive["attributes"]["TEXCOORD_0"], 2)
            if uv_format != "f":
                raise RuntimeError("governed sealing requires FLOAT UV accessors")
            for vertex_index in range(uv_accessor["count"]):
                for component in range(2):
                    position = uv_offset + vertex_index * uv_stride + component * 4
                    value = struct.unpack_from("<f", binary, position)[0]
                    struct.pack_into("<f", binary, position, round(value, 5))
    chunks[bin_index] = (0x004E4942, bytes(binary))
    asset = gltf.setdefault("asset", {})
    asset_extras = asset.setdefault("extras", {})
    asset_extras.update({
        "sovereignFixtureStatus": "core-enforced-fixture-not-production-glb",
        "sovereignAdapterStatus": "actual-blender-render-procedural-demo-not-production-sculpt",
        "sovereignSpecies": rig["species"],
        "sovereignDocumentId": "anthro-blender-procedural-v1",
        "sovereignRigId": rig["id"],
        "sovereignBlueprintId": blueprint["id"],
        "sovereignBlueprintDigest": canonical_digest(blueprint),
        "sovereignBlueprintStatus": blueprint["status"],
        "sovereignSourceSha256": canonical_digest({"rig": rig, "skin": skin, "blueprint": blueprint}),
        "skinSurfaceOnly": True,
        "runtimeRetopologyAllowed": False,
    })
    for material_index, item in enumerate(gltf.get("materials", [])):
        extras = item.setdefault("extras", {})
        extras.update({
            "sovereignMaterialId": f"material:{item.get('name') or material_index}",
            "sovereignMaterialRole": "whole-body-skin",
            "diffusionAnatomyAllowed": False,
        })
    blendshape_ids = [item["id"] for item in rig.get("blendshapes", [])]
    primitive_count = 0
    vertex_count = 0
    triangle_count = 0
    morph_count = 0
    accessors = gltf.get("accessors", [])
    for mesh_index, mesh in enumerate(gltf.get("meshes", [])):
        mesh_extras = mesh.setdefault("extras", {})
        mesh_extras.update({
            "sovereignMeshId": f"anthro-blender-mesh:{mesh_index}:{mesh.get('name') or 'unnamed'}",
            "sovereignSpecies": rig["species"],
        })
        target_names = mesh_extras.get("targetNames", [])
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            position_accessor = accessors[primitive["attributes"]["POSITION"]]
            index_accessor = accessors[primitive["indices"]]
            vertices = int(position_accessor["count"])
            triangles = int(index_accessor["count"]) // 3
            targets = primitive.get("targets", [])
            morph_ids = target_names if len(target_names) == len(targets) else blendshape_ids[: len(targets)]
            if len(morph_ids) != len(targets):
                morph_ids = [f"morph:{mesh_index}:{primitive_index}:{index}" for index in range(len(targets))]
            primitive_id = f"anthro-blender:{mesh_index}:{primitive_index}"
            primitive_extras = primitive.setdefault("extras", {})
            primitive_extras.update({
                "sovereignPrimitiveId": primitive_id,
                "sovereignVertexIds": [f"{primitive_id}:vertex:{index}" for index in range(vertices)],
                "sovereignTriangleIds": [f"{primitive_id}:triangle:{index}" for index in range(triangles)],
                "sovereignRegionIds": [mesh.get("name") or f"mesh:{mesh_index}"] * triangles,
                "sovereignMorphIds": list(morph_ids),
            })
            primitive_count += 1
            vertex_count += vertices
            triangle_count += triangles
            morph_count += len(targets)
    for skin_record in gltf.get("skins", []):
        skin_record.setdefault("extras", {})["sovereignRigSchemaVersion"] = rig["schemaVersion"]
    json_bytes = json.dumps(gltf, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    chunks[json_index] = (0x4E4F534A, json_bytes)
    body = b"".join(struct.pack("<II", len(chunk), chunk_type) + chunk for chunk_type, chunk in chunks)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)
    return {
        "primitives": primitive_count,
        "vertices": vertex_count,
        "triangles": triangle_count,
        "morphTargets": morph_count,
        "binaryChunkSha256": hashlib.sha256(chunks[bin_index][1]).hexdigest(),
    }


def main() -> None:
    args = arguments()
    output_dir = Path(args.output_dir).resolve()
    rig_path = Path(args.rig).resolve()
    skin_path = Path(args.skin).resolve()
    blueprint_path = Path(args.blueprint).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    rig = json.loads(rig_path.read_text(encoding="utf-8"))
    skin = json.loads(skin_path.read_text(encoding="utf-8"))
    blueprint = json.loads(blueprint_path.read_text(encoding="utf-8"))
    if rig.get("species") != "anthro":
        raise SystemExit("This integration proof requires the anthro rig profile")
    if skin.get("rigId") != rig.get("id"):
        raise SystemExit("Skin and rig IDs do not match")
    if blueprint.get("schemaVersion") != "sovereign-character-blueprint/1.0":
        raise SystemExit("Unsupported heroic character blueprint schema")
    if blueprint.get("intent", {}).get("species") != "anthro-fox":
        raise SystemExit("This integration proof requires an anthro-fox blueprint")
    source_digest = blueprint.get("source", {}).get("sha256", "")
    if len(source_digest) != 64 or any(character not in "0123456789abcdef" for character in source_digest):
        raise SystemExit("Heroic blueprint source digest must be lowercase SHA-256")
    if not blueprint.get("intent", {}).get("singleViewInferenceAcknowledged"):
        raise SystemExit("Single-view inferred geometry must be acknowledged by the blueprint")

    clear_scene()
    armature, meshes, head = build_character(rig, skin, blueprint, args.seed)
    png_path = output_dir / "anthro-blender-preview.png"
    silhouette_path = output_dir / "anthro-blender-silhouette.png"
    glb_path = output_dir / "anthro-blender-character.glb"
    blend_path = output_dir / "anthro-blender-character.blend"
    configure_render(png_path, args.size, blueprint)
    export_glb(glb_path, armature, meshes)
    glb_seal = seal_governed_glb(glb_path, rig, skin, blueprint)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    bpy.ops.render.render(write_still=True)
    render_silhouette(silhouette_path)

    report = {
        "schemaVersion": "sovereign-blender-adapter-report/1.0",
        "status": "actual-blender-render-procedural-demo-not-production-sculpt",
        "seed": args.seed,
        "blenderVersion": bpy.app.version_string,
        "source": {
            "rigPath": str(rig_path), "rigDigest": canonical_digest(rig),
            "skinPath": str(skin_path), "skinDigest": canonical_digest(skin),
            "blueprintPath": str(blueprint_path), "blueprintDigest": canonical_digest(blueprint),
            "blueprintId": blueprint["id"], "blueprintStatus": blueprint["status"],
        },
        "character": {
            "species": rig["species"], "rigId": rig["id"],
            "boneNames": [bone.name for bone in armature.data.bones],
            "blendshapeNames": [key.name for key in head.data.shape_keys.key_blocks if key.name != "Basis"],
            "meshObjects": len(meshes),
            "vertices": sum(len(obj.data.vertices) for obj in meshes if obj.type == "MESH"),
            "animationFrames": [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
        },
        "glbSeal": glb_seal,
        "artifacts": {
            "glb": {"path": str(glb_path), "sha256": sha256(glb_path), "bytes": glb_path.stat().st_size},
            "blend": {"path": str(blend_path), "sha256": sha256(blend_path), "bytes": blend_path.stat().st_size},
            "preview": {"path": str(png_path), "sha256": sha256(png_path), "bytes": png_path.stat().st_size, "size": [args.size, args.size]},
            "silhouette": {"path": str(silhouette_path), "sha256": sha256(silhouette_path), "bytes": silhouette_path.stat().st_size, "size": [args.size, args.size]},
        },
        "consumers": ["Mandala/Engine3D", "Unity", "Unreal"],
        "policy": {
            "skinSurfaceOnly": True,
            "runtimeRetopologyAllowed": False,
            "conceptArtIsAnatomyEvidence": False,
            "singleViewHiddenGeometryIsInferred": True,
        },
        "determinism": {
            "mode": "semantic-digest-replay",
            "fixedInputsAndSeed": True,
            "canonicalized": ["triangle-list-order", "uv-float-precision-1e-5"],
            "governedGlbByteIdentityClaim": False,
            "note": "Mandala replays and pins semantic anatomy digests. Blender ancillary GLB bytes, the .blend, and the rendered PNG have no byte-identity claim.",
        },
    }
    report_path = output_dir / "anthro-blender-adapter-report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("MANDALA_BLENDER_ADAPTER_OK")
    print(json.dumps({"report": str(report_path), "glb": report["artifacts"]["glb"], "preview": report["artifacts"]["preview"]}, indent=2))


if __name__ == "__main__":
    main()
