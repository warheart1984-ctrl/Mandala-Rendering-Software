"""4D USD Schema — Stage 1 Scene Ingestion for 4D rendering.

Extends USD with 4D-specific prim types, attributes, and relationships.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

# Optional USD dependency
try:
    from pxr import Usd, UsdGeom, UsdLux, UsdShade, Sdf, Gf, Vt
    HAS_USD = True
except ImportError:
    HAS_USD = False
    # Mock types for when USD is not available
    class _MockUsd:
        pass
    class _MockGf:
        class Vec4f:
            def __init__(self, x=0, y=0, z=0, w=0): pass
        class Vec2f:
            def __init__(self, x=0, y=0): pass
        class Vec3f:
            def __init__(self, x=0, y=0, z=0): pass
        class Matrix4d:
            def __init__(self, val=1.0): pass
    class _MockSdf:
        class ValueTypeNames:
            Float = "float"
            Float4 = "float4"
            Float4Array = "float4[]"
            Token = "token"
    Usd = UsdGeom = UsdLux = UsdShade = Sdf = Gf = Vt = _MockUsd
    Gf = _MockGf
    Sdf = _MockSdf


class PrimType4D(str, Enum):
    """4D-specific prim types."""
    MESH_4D = "Mesh4D"
    CAMERA_4D = "Camera4D"
    LIGHT_4D = "Light4D"
    VOLUME_4D = "Volume4D"
    MATERIAL_4D = "Material4D"
    PROJECTION_4D = "Projection4D"


class ProjectionModel(str, Enum):
    """4D projection model types."""
    PERSPECTIVE_D4_D3 = "perspective_d4_d3"      # Standard perspective d4/d3
    ORTHOGRAPHIC_4D = "orthographic_4d"          # Orthographic in 4D
    STEREOGRAPHIC = "stereographic"              # Stereographic projection
    CUSTOM = "custom"                             # Custom projection function


@dataclass
class Mesh4D:
    """4D mesh with w-coordinate geometry."""
    points_4d: List[Gf.Vec4f]          # 4D vertex positions (x, y, z, w)
    normals_4d: List[Gf.Vec4f]         # 4D normals
    face_vertex_counts: List[int]       # Per-face vertex counts
    face_vertex_indices: List[int]      # Face vertex indices
    uvs: List[Gf.Vec2f]                # UV coordinates (2D)
    uvs_4d: List[Gf.Vec4f]             # 4D UV coordinates (optional)
    material_ids: List[int]             # Per-face material IDs
    lod_level: int = 0                  # Current LOD level
    lod_variants: Dict[int, 'Mesh4D'] = field(default_factory=dict)  # LOD variants by level
    
    def to_usd(self, stage: Usd.Stage, path: str) -> UsdGeom.Mesh:
        """Write 4D mesh to USD with 4D extensions."""
        mesh = UsdGeom.Mesh.Define(stage, path)
        
        # Standard 3D projection for compatibility
        points_3d = [Gf.Vec3f(p[0], p[1], p[2]) for p in self.points_4d]
        mesh.CreatePointsAttr(Vt.Vec3fArray(points_3d))
        mesh.CreateFaceVertexCountsAttr(Vt.IntArray(self.face_vertex_counts))
        mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(self.face_vertex_indices))
        
        # 4D extensions via custom attributes
        mesh.CreatePrimvar("points4d", Sdf.ValueTypeNames.Float4Array).Set(Vt.Vec4fArray(self.points_4d))
        mesh.CreatePrimvar("normals4d", Sdf.ValueTypeNames.Float4Array).Set(Vt.Vec4fArray(self.normals_4d))
        if self.uvs_4d:
            mesh.CreatePrimvar("uvs4d", Sdf.ValueTypeNames.Float4Array).Set(Vt.Vec4fArray(self.uvs_4d))
        
        # LOD variant sets
        if self.lod_variants:
            variant_set = mesh.GetPrim().GetVariantSets().AddVariantSet("LOD")
            for lod_level, lod_mesh in self.lod_variants.items():
                variant_set.SetVariantSelection(f"lod{lod_level}")
                with variant_set.GetVariantEditContext():
                    lod_mesh._write_lod_to_prim(mesh)
        
        return mesh
    
    def _write_lod_to_prim(self, mesh: UsdGeom.Mesh):
        points_3d = [Gf.Vec3f(p[0], p[1], p[2]) for p in self.points_4d]
        mesh.GetPointsAttr().Set(Vt.Vec3fArray(points_3d))
        mesh.GetFaceVertexCountsAttr().Set(Vt.IntArray(self.face_vertex_counts))
        mesh.GetFaceVertexIndicesAttr().Set(Vt.IntArray(self.face_vertex_indices))


@dataclass
class Camera4D:
    """4D camera with projection parameters."""
    transform: Gf.Matrix4d              # 4D transform matrix (4x4)
    projection_model: ProjectionModel = ProjectionModel.PERSPECTIVE_D4_D3
    d4: float = 1.5                     # 4D projection distance
    d3: float = 1.0                     # 3D projection distance
    focal_length_mm: float = 35.0       # Focal length in mm
    aperture_fstop: float = 2.8         # Aperture
    shutter_open: float = -0.25         # Shutter open (relative to frame)
    shutter_close: float = 0.25         # Shutter close
    sensor_width_mm: float = 24.9       # Sensor width (Super35)
    sensor_height_mm: float = 18.7      # Sensor height
    focus_distance_m: float = 10.0      # Focus distance
    bokeh_shape: str = "circular"       # Bokeh shape
    chromatic_aberration: float = 0.002 # CA strength
    motion_blur_samples: int = 5        # MB sample count
    
    def to_usd(self, stage: Usd.Stage, path: str) -> UsdGeom.Camera:
        cam = UsdGeom.Camera.Define(stage, path)
        
        # Standard camera attributes
        cam.CreateFocalLengthAttr(self.focal_length_mm)
        cam.CreateFStopAttr(self.aperture_fstop)
        cam.CreateFocusDistanceAttr(self.focus_distance_m)
        cam.CreateClippingRangeAttr(Gf.Vec2f(0.1, 10000.0))
        
        # 4D extensions
        cam.GetPrim().CreateAttribute("projectionModel", Sdf.ValueTypeNames.Token).Set(self.projection_model.value)
        cam.GetPrim().CreateAttribute("d4", Sdf.ValueTypeNames.Float).Set(self.d4)
        cam.GetPrim().CreateAttribute("d3", Sdf.ValueTypeNames.Float).Set(self.d3)
        cam.GetPrim().CreateAttribute("shutterOpen", Sdf.ValueTypeNames.Float).Set(self.shutter_open)
        cam.GetPrim().CreateAttribute("shutterClose", Sdf.ValueTypeNames.Float).Set(self.shutter_close)
        cam.GetPrim().CreateAttribute("sensorWidthMM", Sdf.ValueTypeNames.Float).Set(self.sensor_width_mm)
        cam.GetPrim().CreateAttribute("sensorHeightMM", Sdf.ValueTypeNames.Float).Set(self.sensor_height_mm)
        cam.GetPrim().CreateAttribute("bokehShape", Sdf.ValueTypeNames.Token).Set(self.bokeh_shape)
        cam.GetPrim().CreateAttribute("chromaticAberration", Sdf.ValueTypeNames.Float).Set(self.chromatic_aberration)
        cam.GetPrim().CreateAttribute("motionBlurSamples", Sdf.ValueTypeNames.Int).Set(self.motion_blur_samples)
        
        # 4D transform
        xform = UsdGeom.Xform.Define(stage, path + "/xform")
        xform_op = xform.AddTransformOp()
        xform_op.Set(Gf.Matrix4d(self.transform))
        
        return cam


@dataclass
class Light4D:
    """4D light source with 4D position and falloff."""
    light_type: str                     # "area", "point", "spot", "distant", "hdri"
    transform: Gf.Matrix4d              # 4D transform (4x4)
    color_temp_k: float = 5600.0        # Color temperature in Kelvin
    intensity_lux: float = 100000.0     # Intensity at subject
    color_linear: Gf.Vec3f = field(default_factory=lambda: Gf.Vec3f(1.0, 1.0, 1.0))
    # 4D-specific
    falloff_4d: float = 2.0             # 4D inverse-square falloff exponent
    w_falloff: float = 1.0              # Falloff along w-axis
    ies_profile: Optional[str] = None   # Path to IES file
    ies_sha256: Optional[str] = None    # IES file hash for EnvLock
    # Area light
    size_xy: Gf.Vec2f = field(default_factory=lambda: Gf.Vec2f(1.0, 1.0))
    # Spot light
    cone_angle_deg: float = 45.0
    cone_softness: float = 0.1
    
    def to_usd(self, stage: Usd.Stage, path: str) -> UsdLux.Light:
        if self.light_type == "area":
            light = UsdLux.RectLight.Define(stage, path)
            light.CreateWidthAttr(self.size_xy[0])
            light.CreateHeightAttr(self.size_xy[1])
        elif self.light_type == "point":
            light = UsdLux.SphereLight.Define(stage, path)
            light.CreateRadiusAttr(0.1)
        elif self.light_type == "spot":
            light = UsdLux.DiskLight.Define(stage, path)
            light.CreateConeAngleAttr(self.cone_angle_deg)
            light.CreateConeSoftnessAttr(self.cone_softness)
        elif self.light_type == "distant":
            light = UsdLux.DistantLight.Define(stage, path)
        else:
            light = UsdLux.Light.Define(stage, path)
        
        # Common attributes
        light.CreateColorTemperatureAttr(self.color_temp_k)
        light.CreateIntensityAttr(self.intensity_lux)
        light.CreateColorAttr(self.color_linear)
        light.CreateExposureAttr(0.0)
        
        # 4D extensions
        prim = light.GetPrim()
        prim.CreateAttribute("falloff4D", Sdf.ValueTypeNames.Float).Set(self.falloff_4d)
        prim.CreateAttribute("wFalloff", Sdf.ValueTypeNames.Float).Set(self.w_falloff)
        if self.ies_profile:
            prim.CreateAttribute("iesProfile", Sdf.ValueTypeNames.Asset).Set(self.ies_profile)
        if self.ies_sha256:
            prim.CreateAttribute("iesSHA256", Sdf.ValueTypeNames.Token).Set(self.ies_sha256)
        
        return light


@dataclass
class Volume4D:
    """4D volumetric density field (OpenVDB or procedural)."""
    transform: Gf.Matrix4d
    grid_name: str = "density"          # VDB grid name
    vdb_file: Optional[str] = None      # Path to .vdb file
    vdb_sha256: Optional[str] = None    # VDB file hash
    # Procedural fallback
    procedural_type: Optional[str] = None  # "noise", "clouds", "fire"
    procedural_params: Dict[str, float] = field(default_factory=dict)
    # Volume properties
    scattering_coefficient: float = 0.1
    absorption_coefficient: float = 0.01
    emission_coefficient: float = 0.0
    phase_g: float = 0.0                # Henyey-Greenstein
    # 4D properties
    w_density_scale: float = 1.0        # Density scaling along w-axis
    w_animation_speed: float = 0.0      # Temporal evolution along w
    
    def to_usd(self, stage: Usd.Stage, path: str):
        """Write as Volume with 4D extensions."""
        from pxr import UsdVol
        volume = UsdVol.Volume.Define(stage, path)
        volume.CreateFieldNameAttr(self.grid_name)
        
        if self.vdb_file:
            volume.CreateFilePathAttr(self.vdb_file)
        
        # 4D extensions
        prim = volume.GetPrim()
        prim.CreateAttribute("scatteringCoefficient", Sdf.ValueTypeNames.Float).Set(self.scattering_coefficient)
        prim.CreateAttribute("absorptionCoefficient", Sdf.ValueTypeNames.Float).Set(self.absorption_coefficient)
        prim.CreateAttribute("emissionCoefficient", Sdf.ValueTypeNames.Float).Set(self.emission_coefficient)
        prim.CreateAttribute("phaseG", Sdf.ValueTypeNames.Float).Set(self.phase_g)
        prim.CreateAttribute("wDensityScale", Sdf.ValueTypeNames.Float).Set(self.w_density_scale)
        prim.CreateAttribute("wAnimationSpeed", Sdf.ValueTypeNames.Float).Set(self.w_animation_speed)
        
        if self.vdb_sha256:
            prim.CreateAttribute("vdbSHA256", Sdf.ValueTypeNames.Token).Set(self.vdb_sha256)


@dataclass
class Material4D:
    """4D MaterialX material with 4D BSDF parameters."""
    material_path: str                  # Path to .mtlx file
    mtlx_sha256: str                    # SHA-256 of .mtlx file
    surface_type: str = "mixed"         # "diffuse", "metal", "glass", "sss", "emission", "mixed"
    # 4D BSDF parameters
    roughness_4d: List[float] = field(default_factory=list)  # Roughness varying by w
    metalness_4d: List[float] = field(default_factory=list)
    ior_4d: List[float] = field(default_factory=list)
    subsurface_radius_mm_4d: List[List[float]] = field(default_factory=list)
    # Layered shading
    layers: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_usd(self, stage: Usd.Stage, path: str) -> UsdShade.Material:
        material = UsdShade.Material.Define(stage, path)
        prim = material.GetPrim()
        prim.CreateAttribute("mtlxSHA256", Sdf.ValueTypeNames.Token).Set(self.mtlx_sha256)
        prim.CreateAttribute("surfaceType", Sdf.ValueTypeNames.Token).Set(self.surface_type)
        if self.roughness_4d:
            prim.CreateAttribute("roughness4D", Sdf.ValueTypeNames.FloatArray).Set(self.roughness_4d)
        if self.metalness_4d:
            prim.CreateAttribute("metalness4D", Sdf.ValueTypeNames.FloatArray).Set(self.metalness_4d)
        if self.ior_4d:
            prim.CreateAttribute("ior4D", Sdf.ValueTypeNames.FloatArray).Set(self.ior_4d)
        if self.subsurface_radius_mm_4d:
            prim.CreateAttribute("subsurfaceRadius4D", Sdf.ValueTypeNames.Float4Array).Set(
                [Gf.Vec4f(*r) for r in self.subsurface_radius_mm_4d]
            )
        return material


@dataclass
class Projection4D:
    """4D projection configuration prim."""
    d4: float = 1.5
    d3: float = 1.0
    focal_length_mm: float = 35.0
    sensor_width_mm: float = 24.9
    sensor_height_mm: float = 18.7
    projection_model: ProjectionModel = ProjectionModel.PERSPECTIVE_D4_D3
    custom_shader: Optional[str] = None
    
    def to_usd(self, stage: Usd.Stage, path: str):
        prim = stage.DefinePrim(path, "Projection4D")
        prim.CreateAttribute("d4", Sdf.ValueTypeNames.Float).Set(self.d4)
        prim.CreateAttribute("d3", Sdf.ValueTypeNames.Float).Set(self.d3)
        prim.CreateAttribute("focalLengthMM", Sdf.ValueTypeNames.Float).Set(self.focal_length_mm)
        prim.CreateAttribute("sensorWidthMM", Sdf.ValueTypeNames.Float).Set(self.sensor_width_mm)
        prim.CreateAttribute("sensorHeightMM", Sdf.ValueTypeNames.Float).Set(self.sensor_height_mm)
        prim.CreateAttribute("projectionModel", Sdf.ValueTypeNames.Token).Set(self.projection_model.value)
        if self.custom_shader:
            prim.CreateAttribute("customShader", Sdf.ValueTypeNames.Asset).Set(self.custom_shader)
        return prim


@dataclass
class Scene4D:
    """Complete 4D scene container."""
    meshes: Dict[str, Mesh4D] = field(default_factory=dict)
    cameras: Dict[str, Camera4D] = field(default_factory=dict)
    lights: Dict[str, Light4D] = field(default_factory=dict)
    volumes: Dict[str, Volume4D] = field(default_factory=dict)
    materials: Dict[str, Material4D] = field(default_factory=dict)
    projections: Dict[str, Projection4D] = field(default_factory=dict)
    # Global scene metadata
    frame_rate: str = "24000/1001"
    shutter_open: float = -0.25
    shutter_close: float = 0.25
    motion_blur_samples: int = 5
    # EnvLock reference
    envlock_id: Optional[str] = None
    envlock_sha256: Optional[str] = None
    
    @property
    def geometry(self) -> 'Geometry4D':
        """Aggregate geometry for BVH building."""
        all_vertices = []
        all_normals = []
        all_indices = []
        all_uvs = []
        all_material_ids = []
        offset = 0
        for name, mesh in self.meshes.items():
            all_vertices.extend(mesh.points_4d)
            all_normals.extend(mesh.normals_4d)
            all_uvs.extend(mesh.uvs)
            all_indices.extend([i + offset for i in mesh.face_vertex_indices])
            all_material_ids.extend([mesh.material_ids[i] for i in range(len(mesh.face_vertex_counts))])
            offset += len(mesh.points_4d)
        
        return Geometry4D(
            vertices_4d=all_vertices,
            normals_4d=all_normals,
            indices=all_indices,
            uvs=all_uvs,
            material_ids=all_material_ids,
        )
    
    def to_usd(self, stage: Usd.Stage, root_path: str = "/"):
        """Write entire scene to USD."""
        # Write projection config
        if self.projections:
            for name, proj in self.projections.items():
                proj.to_usd(stage, f"{root_path}/Projections/{name}")
        
        # Write materials
        for name, mat in self.materials.items():
            mat.to_usd(stage, f"{root_path}/Materials/{name}")
        
        # Write meshes
        for name, mesh in self.meshes.items():
            mesh.to_usd(stage, f"{root_path}/Geometry/{name}")
        
        # Write cameras
        for name, cam in self.cameras.items():
            cam.to_usd(stage, f"{root_path}/Cameras/{name}")
        
        # Write lights
        for name, light in self.lights.items():
            light.to_usd(stage, f"{root_path}/Lights/{name}")
        
        # Write volumes
        for name, vol in self.volumes.items():
            vol.to_usd(stage, f"{root_path}/Volumes/{name}")
        
        # Write scene metadata
        root_prim = stage.GetPrimAtPath(root_path)
        root_prim.CreateAttribute("frameRate", Sdf.ValueTypeNames.Token).Set(self.frame_rate)
        root_prim.CreateAttribute("shutterOpen", Sdf.ValueTypeNames.Float).Set(self.shutter_open)
        root_prim.CreateAttribute("shutterClose", Sdf.ValueTypeNames.Float).Set(self.shutter_close)
        root_prim.CreateAttribute("motionBlurSamples", Sdf.ValueTypeNames.Int).Set(self.motion_blur_samples)
        if self.envlock_id:
            root_prim.CreateAttribute("envlockID", Sdf.ValueTypeNames.Token).Set(self.envlock_id)
        if self.envlock_sha256:
            root_prim.CreateAttribute("envlockSHA256", Sdf.ValueTypeNames.Token).Set(self.envlock_sha256)
        
        return stage


@dataclass
class Geometry4D:
    """Aggregated 4D geometry for BVH building."""
    vertices_4d: List[Gf.Vec4f]
    normals_4d: List[Gf.Vec4f]
    indices: List[int]
    uvs: List[Gf.Vec2f]
    material_ids: List[int]


def load_usd_4d(usd_path: str, manifest: Dict[str, Any]) -> Scene4D:
    """Load 4D scene from USD file with manifest."""
    stage = Usd.Stage.Open(usd_path)
    if not stage:
        raise ValueError(f"Could not open USD stage: {usd_path}")
    
    scene = Scene4D()
    scene.envlock_id = manifest.get("envlock_id")
    scene.envlock_sha256 = manifest.get("envlock_sha256")
    
    # Load frame rate
    root_prim = stage.GetPseudoRoot()
    if root_prim.HasAttribute("frameRate"):
        scene.frame_rate = root_prim.GetAttribute("frameRate").Get()
    if root_prim.HasAttribute("shutterOpen"):
        scene.shutter_open = root_prim.GetAttribute("shutterOpen").Get()
    if root_prim.HasAttribute("shutterClose"):
        scene.shutter_close = root_prim.GetAttribute("shutterClose").Get()
    if root_prim.HasAttribute("motionBlurSamples"):
        scene.motion_blur_samples = root_prim.GetAttribute("motionBlurSamples").Get()
    if root_prim.HasAttribute("envlockID"):
        scene.envlock_id = root_prim.GetAttribute("envlockID").Get()
    if root_prim.HasAttribute("envlockSHA256"):
        scene.envlock_sha256 = root_prim.GetAttribute("envlockSHA256").Get()
    
    # Traverse stage and load 4D prims
    for prim in stage.Traverse():
        prim_type = prim.GetTypeName()
        
        if prim_type == "Mesh" and prim.HasAttribute("points4d"):
            scene.meshes[prim.GetPath().pathString] = _load_mesh_4d(prim)
        elif prim_type == "Camera" and prim.HasAttribute("d4"):
            scene.cameras[prim.GetPath().pathString] = _load_camera_4d(prim)
        elif prim.IsA(UsdLux.Light) and prim.HasAttribute("falloff4D"):
            scene.lights[prim.GetPath().pathString] = _load_light_4d(prim)
        elif prim_type == "Volume" and prim.HasAttribute("wDensityScale"):
            scene.volumes[prim.GetPath().pathString] = _load_volume_4d(prim)
        elif prim_type == "Material" and prim.HasAttribute("mtlxSHA256"):
            scene.materials[prim.GetPath().pathString] = _load_material_4d(prim)
        elif prim.GetTypeName() == "Projection4D":
            scene.projections[prim.GetPath().pathString] = _load_projection_4d(prim)
    
    return scene


def _load_mesh_4d(prim: Usd.Prim) -> Mesh4D:
    mesh = UsdGeom.Mesh(prim)
    points_4d_attr = prim.GetAttribute("points4d")
    points_4d = points_4d_attr.Get() if points_4d_attr else []
    normals_4d_attr = prim.GetAttribute("normals4d")
    normals_4d = normals_4d_attr.Get() if normals_4d_attr else []
    uvs_4d_attr = prim.GetAttribute("uvs4d")
    uvs_4d = uvs_4d_attr.Get() if uvs_4d_attr else []
    
    # LOD variants
    lod_variants = {}
    variant_sets = prim.GetVariantSets()
    if variant_sets.HasVariantSet("LOD"):
        lod_set = variant_sets.GetVariantSet("LOD")
        for variant in lod_set.GetVariantNames():
            lod_level = int(variant.replace("lod", ""))
            with lod_set.GetVariantEditContext(variant):
                # Load LOD mesh data
                pass  # Simplified
    
    return Mesh4D(
        points_4d=list(points_4d),
        normals_4d=list(normals_4d),
        face_vertex_counts=list(mesh.GetFaceVertexCountsAttr().Get()),
        face_vertex_indices=list(mesh.GetFaceVertexIndicesAttr().Get()),
        uvs=list(prim.GetAttribute("uvs").Get()) if prim.HasAttribute("uvs") else [],
        uvs_4d=list(uvs_4d),
        material_ids=list(prim.GetAttribute("material_ids").Get()) if prim.HasAttribute("material_ids") else [],
    )


def _load_camera_4d(prim: Usd.Prim) -> Camera4D:
    cam = UsdGeom.Camera(prim)
    proj_model_attr = prim.GetAttribute("projectionModel")
    proj_model = ProjectionModel(proj_model_attr.Get()) if proj_model_attr else ProjectionModel.PERSPECTIVE_D4_D3
    
    d4_attr = prim.GetAttribute("d4")
    d3_attr = prim.GetAttribute("d3")
    
    return Camera4D(
        transform=Gf.Matrix4d(prim.GetAttribute("xformOp:transform").Get()) if prim.HasAttribute("xformOp:transform") else Gf.Matrix4d(1.0),
        projection_model=proj_model,
        d4=d4_attr.Get() if d4_attr else 1.5,
        d3=d3_attr.Get() if d3_attr else 1.0,
        focal_length_mm=cam.GetFocalLengthAttr().Get() if cam.GetFocalLengthAttr().HasValue() else 35.0,
        aperture_fstop=cam.GetFStopAttr().Get() if cam.GetFStopAttr().HasValue() else 2.8,
        shutter_open=prim.GetAttribute("shutterOpen").Get() if prim.HasAttribute("shutterOpen") else -0.25,
        shutter_close=prim.GetAttribute("shutterClose").Get() if prim.HasAttribute("shutterClose") else 0.25,
        sensor_width_mm=prim.GetAttribute("sensorWidthMM").Get() if prim.HasAttribute("sensorWidthMM") else 24.9,
        sensor_height_mm=prim.GetAttribute("sensorHeightMM").Get() if prim.HasAttribute("sensorHeightMM") else 18.7,
        focus_distance_m=cam.GetFocusDistanceAttr().Get() if cam.GetFocusDistanceAttr().HasValue() else 10.0,
        bokeh_shape=prim.GetAttribute("bokehShape").Get() if prim.HasAttribute("bokehShape") else "circular",
        chromatic_aberration=prim.GetAttribute("chromaticAberration").Get() if prim.HasAttribute("chromaticAberration") else 0.002,
        motion_blur_samples=prim.GetAttribute("motionBlurSamples").Get() if prim.HasAttribute("motionBlurSamples") else 5,
    )


def _load_light_4d(prim: Usd.Prim) -> Light4D:
    light_type = prim.GetTypeName().replace("RectLight", "area").replace("SphereLight", "point").replace("DiskLight", "spot").replace("DistantLight", "distant").lower()
    
    falloff_4d_attr = prim.GetAttribute("falloff4D")
    w_falloff_attr = prim.GetAttribute("wFalloff")
    ies_attr = prim.GetAttribute("iesProfile")
    ies_sha256_attr = prim.GetAttribute("iesSHA256")
    
    return Light4D(
        light_type=light_type,
        transform=Gf.Matrix4d(1.0),  # Would extract from xformOp:transform
        color_temp_k=prim.GetAttribute("colorTemperature").Get() if prim.HasAttribute("colorTemperature") else 5600.0,
        intensity_lux=prim.GetAttribute("intensity").Get() if prim.HasAttribute("intensity") else 100000.0,
        color_linear=Gf.Vec3f(*prim.GetAttribute("color").Get()) if prim.HasAttribute("color") else Gf.Vec3f(1.0, 1.0, 1.0),
        falloff_4d=falloff_4d_attr.Get() if falloff_4d_attr else 2.0,
        w_falloff=w_falloff_attr.Get() if w_falloff_attr else 1.0,
        ies_profile=ies_attr.Get() if ies_attr else None,
        ies_sha256=ies_sha256_attr.Get() if ies_sha256_attr else None,
    )


def _load_volume_4d(prim: Usd.Prim) -> Volume4D:
    from pxr import UsdVol
    volume = UsdVol.Volume(prim)
    
    w_density_attr = prim.GetAttribute("wDensityScale")
    w_anim_attr = prim.GetAttribute("wAnimationSpeed")
    vdb_sha256_attr = prim.GetAttribute("vdbSHA256")
    
    return Volume4D(
        transform=Gf.Matrix4d(1.0),
        grid_name=volume.GetFieldNameAttr().Get() if volume.GetFieldNameAttr().HasValue() else "density",
        vdb_file=volume.GetFilePathAttr().Get() if volume.GetFilePathAttr().HasValue() else None,
        vdb_sha256=vdb_sha256_attr.Get() if vdb_sha256_attr else None,
        scattering_coefficient=prim.GetAttribute("scatteringCoefficient").Get() if prim.HasAttribute("scatteringCoefficient") else 0.1,
        absorption_coefficient=prim.GetAttribute("absorptionCoefficient").Get() if prim.HasAttribute("absorptionCoefficient") else 0.01,
        emission_coefficient=prim.GetAttribute("emissionCoefficient").Get() if prim.HasAttribute("emissionCoefficient") else 0.0,
        phase_g=prim.GetAttribute("phaseG").Get() if prim.HasAttribute("phaseG") else 0.0,
        w_density_scale=w_density_attr.Get() if w_density_attr else 1.0,
        w_animation_speed=w_anim_attr.Get() if w_anim_attr else 0.0,
    )


def _load_material_4d(prim: Usd.Prim) -> Material4D:
    mtlx_sha256_attr = prim.GetAttribute("mtlxSHA256")
    surface_type_attr = prim.GetAttribute("surfaceType")
    roughness_4d_attr = prim.GetAttribute("roughness4D")
    metalness_4d_attr = prim.GetAttribute("metalness4D")
    ior_4d_attr = prim.GetAttribute("ior4D")
    subsurface_4d_attr = prim.GetAttribute("subsurfaceRadius4D")
    
    return Material4D(
        material_path="",  # Would be filled from USD shading network
        mtlx_sha256=mtlx_sha256_attr.Get() if mtlx_sha256_attr else "",
        surface_type=surface_type_attr.Get() if surface_type_attr else "mixed",
        roughness_4d=list(roughness_4d_attr.Get()) if roughness_4d_attr else [],
        metalness_4d=list(metalness_4d_attr.Get()) if metalness_4d_attr else [],
        ior_4d=list(ior_4d_attr.Get()) if ior_4d_attr else [],
        subsurface_radius_mm_4d=[list(r) for r in subsurface_4d_attr.Get()] if subsurface_4d_attr else [],
    )


def _load_projection_4d(prim: Usd.Prim) -> Projection4D:
    proj_model_attr = prim.GetAttribute("projectionModel")
    custom_shader_attr = prim.GetAttribute("customShader")
    
    return Projection4D(
        d4=prim.GetAttribute("d4").Get() if prim.HasAttribute("d4") else 1.5,
        d3=prim.GetAttribute("d3").Get() if prim.HasAttribute("d3") else 1.0,
        focal_length_mm=prim.GetAttribute("focalLengthMM").Get() if prim.HasAttribute("focalLengthMM") else 35.0,
        sensor_width_mm=prim.GetAttribute("sensorWidthMM").Get() if prim.HasAttribute("sensorWidthMM") else 24.9,
        sensor_height_mm=prim.GetAttribute("sensorHeightMM").Get() if prim.HasAttribute("sensorHeightMM") else 18.7,
        projection_model=ProjectionModel(proj_model_attr.Get()) if proj_model_attr else ProjectionModel.PERSPECTIVE_D4_D3,
        custom_shader=custom_shader_attr.Get() if custom_shader_attr else None,
    )


if __name__ == "__main__":
    # Test schema
    print("4D USD Schema classes defined:")
    print(f"  Mesh4D, Camera4D, Light4D, Volume4D, Material4D, Projection4D")
    print(f"  Scene4D, Geometry4D")
    print(f"  load_usd_4d() function available")