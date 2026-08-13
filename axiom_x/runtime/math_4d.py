"""Axiom-X 4D Math — Projector4D, BVH4D, and 4D geometry structures.

STATUS: **partial** — Core 4D projection and acceleration structures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import pyopencl as cl
    import pyopencl.array as cl_array
    HAS_PYOPENCL = True
except ImportError:
    HAS_PYOPENCL = False


@dataclass
class Vec4:
    """4D vector."""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    w: float = 1.0
    
    def to_array(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z, self.w], dtype=np.float32)
    
    @classmethod
    def from_array(cls, arr: np.ndarray) -> "Vec4":
        return cls(arr[0], arr[1], arr[2], arr[3])


@dataclass
class Mat4x4:
    """4x4 matrix (column-major)."""
    data: np.ndarray = field(default_factory=lambda: np.eye(4, dtype=np.float32))
    
    def __post_init__(self):
        if isinstance(self.data, list):
            self.data = np.array(self.data, dtype=np.float32).reshape(4, 4)
    
    def to_array(self) -> np.ndarray:
        return self.data.astype(np.float32).flatten()
    
    @classmethod
    def identity(cls) -> "Mat4x4":
        return cls(np.eye(4, dtype=np.float32))
    
    @classmethod
    def translation(cls, x: float, y: float, z: float, w: float = 0.0) -> "Mat4x4":
        m = cls.identity()
        m.data[0, 3] = x
        m.data[1, 3] = y
        m.data[2, 3] = z
        m.data[3, 3] = w
        return m
    
    def mul_vec4(self, v: Vec4) -> Vec4:
        arr = self.data @ np.array([v.x, v.y, v.z, v.w], dtype=np.float32)
        return Vec4(arr[0], arr[1], arr[2], arr[3])


@dataclass
class Vertex4D:
    """4D vertex with position, normal, UV, and material ID."""
    pos: Vec4
    normal: Vec4
    uv: Tuple[float, float] = (0.0, 0.0)
    material_id: int = 0
    
    def to_array(self) -> np.ndarray:
        return np.array([
            self.pos.x, self.pos.y, self.pos.z, self.pos.w,
            self.normal.x, self.normal.y, self.normal.z, self.normal.w,
            self.uv[0], self.uv[1],
            float(self.material_id),
        ], dtype=np.float32)


@dataclass
class Vertex3D:
    """3D vertex (projected from 4D)."""
    pos: np.ndarray  # float3
    normal: np.ndarray  # float3
    w: float
    jacobian: np.ndarray  # float4 (flattened 3x4)
    uv: Tuple[float, float]
    material_id: int


class Projector4D:
    """4D to 3D perspective projector.
    
    Implements the standard 4D to 3D perspective projection:
    x_3d = d3 * x_4d / (d4 - w_4d)
    y_3d = d3 * y_4d / (d4 - w_4d)
    z_3d = d3 * z_4d / (d4 - w_4d)
    """
    
    def __init__(self, d4: float = 1.5, d3: float = 1.0):
        self.d4 = float(d4)
        self.d3 = float(d3)
    
    def project_point(self, v4: Vec4) -> Tuple[np.ndarray, float]:
        """Project a 4D point to 3D. Returns (projected_3d, w)."""
        denom = self.d4 - v4.w
        if abs(denom) < 1e-6:
            denom = 1e-6 * (1 if denom >= 0 else -1)
        scale = self.d3 / denom
        return (
            np.array([v4.x * scale, v4.y * scale, v4.z * scale], dtype=np.float32),
            v4.w,
        )
    
    def project_vertex(self, v4: Vertex4D) -> Vertex3D:
        """Project a 4D vertex to 3D."""
        pos_3d, w = self.project_point(v4.pos)
        
        # Project normal (treat as direction, w=0)
        normal_4d = Vec4(v4.normal.x, v4.normal.y, v4.normal.z, 0.0)
        normal_3d, _ = self.project_point(normal_4d)
        normal_3d = normal_3d / (np.linalg.norm(normal_3d) + 1e-6)
        
        # Compute projection Jacobian (3x4)
        denom = self.d4 - v4.pos.w
        scale = self.d3 / (denom * denom)
        jacobian = np.array([
            scale * (self.d4 + v4.pos.x), scale * v4.pos.y, scale * v4.pos.z, scale * -v4.pos.x,
            scale * v4.pos.x, scale * (self.d4 + v4.pos.y), scale * v4.pos.z, scale * -v4.pos.y,
            scale * v4.pos.x, scale * v4.pos.y, scale * (self.d4 + v4.pos.z), scale * -v4.pos.z,
        ], dtype=np.float32)
        
        return Vertex3D(
            pos=pos_3d,
            normal=normal_3d,
            w=w,
            jacobian=jacobian,
            uv=v4.uv,
            material_id=v4.material_id,
        )
    
    def project_vertices(self, vertices: List[Vertex4D]) -> List[Vertex3D]:
        """Batch project vertices."""
        return [self.project_vertex(v) for v in vertices]
    
    def compute_projection_jacobian(self, v4: Vec4) -> np.ndarray:
        """Compute 3x4 projection Jacobian for a 4D point."""
        denom = self.d4 - v4.w
        scale = self.d3 / (denom * denom)
        return np.array([
            scale * (self.d4 + v4.x), scale * v4.y, scale * v4.z, scale * -v4.x,
            scale * v4.x, scale * (self.d4 + v4.y), scale * v4.z, scale * -v4.y,
            scale * v4.x, scale * v4.y, scale * (self.d4 + v4.z), scale * -v4.z,
        ], dtype=np.float32)


class BVH4D:
    """4D Bounding Volume Hierarchy for ray acceleration.
    
    Builds a BVH over 4D geometry for fast ray-primitive intersection.
    """
    
    def __init__(self):
        self.nodes: List[Dict[str, Any]] = []
        self.primitives: List[Any] = []
        self.bounds_min: Optional[Vec4] = None
        self.bounds_max: Optional[Vec4] = None
    
    def build(self, vertices: List[Vertex4D], indices: List[int], 
              max_prims_per_node: int = 4, max_depth: int = 32) -> None:
        """Build BVH from 4D vertices and triangle indices."""
        if not vertices or not indices:
            return
        
        # Build primitive list (triangles)
        self.primitives = []
        for i in range(0, len(indices), 3):
            if i + 2 < len(indices):
                tri_indices = indices[i:i+3]
                v0 = vertices[tri_indices[0]]
                v1 = vertices[tri_indices[1]]
                v2 = vertices[tri_indices[2]]
                
                # Compute 4D bounds
                min_x = min(v0.pos.x, v1.pos.x, v2.pos.x)
                max_x = max(v0.pos.x, v1.pos.x, v2.pos.x)
                min_y = min(v0.pos.y, v1.pos.y, v2.pos.y)
                max_y = max(v0.pos.y, v1.pos.y, v2.pos.y)
                min_z = min(v0.pos.z, v1.pos.z, v2.pos.z)
                max_z = max(v0.pos.z, v1.pos.z, v2.pos.z)
                min_w = min(v0.pos.w, v1.pos.w, v2.pos.w)
                max_w = max(v0.pos.w, v1.pos.w, v2.pos.w)
                
                self.primitives.append({
                    "indices": tri_indices,
                    "vertices": [v0, v1, v2],
                    "bounds_min": Vec4(min_x, min_y, min_z, min_w),
                    "bounds_max": Vec4(max_x, max_y, max_z, max_w),
                    "centroid": Vec4(
                        (v0.pos.x + v1.pos.x + v2.pos.x) / 3,
                        (v0.pos.y + v1.pos.y + v2.pos.y) / 3,
                        (v0.pos.z + v1.pos.z + v2.pos.z) / 3,
                        (v0.pos.w + v1.pos.w + v2.pos.w) / 3,
                    ),
                })
        
        # Compute scene bounds
        if self.primitives:
            self.bounds_min = Vec4(
                min(p["bounds_min"].x for p in self.primitives),
                min(p["bounds_min"].y for p in self.primitives),
                min(p["bounds_min"].z for p in self.primitives),
                min(p["bounds_min"].w for p in self.primitives),
            )
            self.bounds_max = Vec4(
                max(p["bounds_max"].x for p in self.primitives),
                max(p["bounds_max"].y for p in self.primitives),
                max(p["bounds_max"].z for p in self.primitives),
                max(p["bounds_max"].w for p in self.primitives),
            )
        
        # Build BVH recursively
        self.nodes = []
        self._build_recursive(list(range(len(self.primitives))), 0, max_depth, max_prims_per_node)
    
    def _build_recursive(self, prim_indices: List[int], depth: int, 
                         max_depth: int, max_prims_per_node: int) -> int:
        """Recursively build BVH nodes. Returns node index."""
        if depth >= max_depth or len(prim_indices) <= max_prims_per_node:
            # Create leaf node
            node_idx = len(self.nodes)
            self.nodes.append({
                "type": "leaf",
                "prim_indices": prim_indices,
                "bounds_min": self._compute_bounds(prim_indices)[0],
                "bounds_max": self._compute_bounds(prim_indices)[1],
            })
            return node_idx
        
        # Find best split axis (longest axis)
        bounds_min, bounds_max = self._compute_bounds(prim_indices)
        extent_x = bounds_max.x - bounds_min.x
        extent_y = bounds_max.y - bounds_min.y
        extent_z = bounds_max.z - bounds_min.z
        extent_w = bounds_max.w - bounds_min.w
        
        # Choose split axis
        if extent_x >= extent_y and extent_x >= extent_z and extent_x >= extent_w:
            axis = 0
        elif extent_y >= extent_z and extent_y >= extent_w:
            axis = 1
        elif extent_z >= extent_w:
            axis = 2
        else:
            axis = 3
        
        # Sort by centroid on chosen axis
        def get_centroid_axis(idx):
            p = self.primitives[idx]
            return [p["centroid"].x, p["centroid"].y, p["centroid"].z, p["centroid"].w][axis]
        
        prim_indices.sort(key=get_centroid_axis)
        mid = len(prim_indices) // 2
        
        left_indices = prim_indices[:mid]
        right_indices = prim_indices[mid:]
        
        # Ensure non-empty splits
        if not left_indices:
            left_indices = [right_indices.pop(0)]
        if not right_indices:
            right_indices = [left_indices.pop()]
        
        left_idx = self._build_recursive(left_indices, depth + 1, max_depth, max_prims_per_node)
        right_idx = self._build_recursive(right_indices, depth + 1, max_depth, max_prims_per_node)
        
        # Create internal node
        left_bounds = self.nodes[left_idx]["bounds_min"], self.nodes[left_idx]["bounds_max"]
        right_bounds = self.nodes[right_idx]["bounds_min"], self.nodes[right_idx]["bounds_max"]
        
        node_idx = len(self.nodes)
        self.nodes.append({
            "type": "internal",
            "left": left_idx,
            "right": right_idx,
            "split_axis": axis,
            "bounds_min": Vec4(
                min(left_bounds[0].x, right_bounds[0].x),
                min(left_bounds[0].y, right_bounds[0].y),
                min(left_bounds[0].z, right_bounds[0].z),
                min(left_bounds[0].w, right_bounds[0].w),
            ),
            "bounds_max": Vec4(
                max(left_bounds[1].x, right_bounds[1].x),
                max(left_bounds[1].y, right_bounds[1].y),
                max(left_bounds[1].z, right_bounds[1].z),
                max(left_bounds[1].w, right_bounds[1].w),
            ),
        })
        return node_idx
    
    def _compute_bounds(self, prim_indices: List[int]) -> Tuple[Vec4, Vec4]:
        if not prim_indices:
            return Vec4(0,0,0,0), Vec4(0,0,0,0)
        
        min_x = min(self.primitives[i]["bounds_min"].x for i in prim_indices)
        max_x = max(self.primitives[i]["bounds_max"].x for i in prim_indices)
        min_y = min(self.primitives[i]["bounds_min"].y for i in prim_indices)
        max_y = max(self.primitives[i]["bounds_max"].y for i in prim_indices)
        min_z = min(self.primitives[i]["bounds_min"].z for i in prim_indices)
        max_z = max(self.primitives[i]["bounds_max"].z for i in prim_indices)
        min_w = min(self.primitives[i]["bounds_min"].w for i in prim_indices)
        max_w = max(self.primitives[i]["bounds_max"].w for i in prim_indices)
        
        return Vec4(min_x, min_y, min_z, min_w), Vec4(max_x, max_y, max_z, max_w)
    
    def traverse(self, ray_origin: Vec4, ray_dir: Vec4) -> List[int]:
        """Traverse BVH with ray, return intersected primitive indices."""
        # Simplified - would implement full ray-BVH intersection
        # For now return all primitives (no acceleration)
        return list(range(len(self.primitives)))
    
    def to_opencl_buffers(self, ctx) -> Tuple[Any, Any]:
        """Create OpenCL buffers for BVH nodes and primitives."""
        if not HAS_PYOPENCL:
            return None, None
        
        # Simplified - would create proper CL buffers
        return None, None


class Geometry4D:
    """Aggregated 4D geometry container."""
    
    def __init__(self):
        self.vertices_4d: List[Vertex4D] = []
        self.normals_4d: List[Vec4] = []
        self.indices: List[int] = []
        self.uvs: List[Tuple[float, float]] = []
        self.material_ids: List[int] = []
        self.bvh: Optional[BVH4D] = None
    
    def add_mesh(self, vertices: List[Vertex4D], indices: List[int], 
                 uvs: List[Tuple[float, float]], material_ids: List[int]) -> int:
        """Add mesh, return base vertex index."""
        base = len(self.vertices_4d)
        self.vertices_4d.extend(vertices)
        self.indices.extend([i + base for i in indices])
        self.uvs.extend(uvs)
        self.material_ids.extend(material_ids)
        return base
    
    def build_bvh(self, max_prims_per_node: int = 4, max_depth: int = 32) -> None:
        self.bvh = BVH4D()
        self.bvh.build(self.vertices_4d, self.indices, max_prims_per_node, max_depth)
    
    def to_opencl(self, ctx) -> Dict[str, Any]:
        """Convert to OpenCL buffers."""
        if not HAS_PYOPENCL:
            return {}
        
        # Convert vertices to flat array
        v_data = []
        for v in self.vertices_4d:
            v_data.extend(v.to_array())
        
        return {
            "vertices": cl.Buffer(ctx, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                                  hostbuf=np.array(v_data, dtype=np.float32)),
            "indices": cl.Buffer(ctx, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                                 hostbuf=np.array(self.indices, dtype=np.uint32)),
            "uvs": cl.Buffer(ctx, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                             hostbuf=np.array(self.uvs, dtype=np.float32)),
            "material_ids": cl.Buffer(ctx, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
                                      hostbuf=np.array(self.material_ids, dtype=np.uint32)),
        }


def select_lod_4d(dist_4d: float, lod_policy: Dict[str, Any]) -> int:
    """Select LOD level based on 4D distance."""
    thresholds = lod_policy.get("thresholds", [10.0, 50.0, 200.0])
    for i, t in enumerate(thresholds):
        if dist_4d < t:
            return i
    return len(thresholds)


def compute_projection_matrix(focal_mm: float, sensor_w: float, sensor_h: float, 
                              aperture: float) -> List[float]:
    """Compute 4x4 projection matrix (column-major)."""
    import math
    aspect = sensor_w / sensor_h
    fov = 2 * math.atan(sensor_w / (2 * focal_mm))
    
    f = 1.0 / math.tan(fov / 2)
    near = 0.1
    far = 10000.0
    
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
    ]


if __name__ == "__main__":
    # Test
    print("4D Math module loaded")
    print("  Projector4D, BVH4D, Vertex4D, Geometry4D available")
    
    # Quick test
    proj = Projector4D(d4=1.5, d3=1.0)
    v = Vec4(1.0, 2.0, 3.0, 0.5)
    p3d, w = proj.project_point(v)
    print(f"  Project {v} -> {p3d} (w={w})")