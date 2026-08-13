"""4D AOV Manifest — Extended AOV specification for 4D rendering pipeline.

Extends Section 6.2 AOV Manifest with 4D-specific channels.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema


class AOVFormat(str, Enum):
    """AOV format types."""
    RGB = "RGB"
    RGBA = "RGBA"
    MONO = "MONO"
    VECTOR2 = "VECTOR2"
    VECTOR3 = "VECTOR3"
    VECTOR4 = "VECTOR4"
    MATRIX3X4 = "MATRIX3X4"
    UINT16 = "UINT16"
    UINT32 = "UINT32"


class AOVBitDepth(str, Enum):
    """Bit depth options."""
    HALF = "half"    # 16-bit float
    FULL = "full"    # 32-bit float
    UINT16 = "uint16"
    UINT32 = "uint32"


class MergeOperation(str, Enum):
    """Compositing merge operations."""
    ADD = "add"
    OVER = "over"
    MULTIPLY = "multiply"
    SCREEN = "screen"
    NONE = "none"  # Reference only


@dataclass
class AOVSpec:
    """Specification for a single AOV."""
    name: str
    format: AOVFormat
    bit_depth: AOVBitDepth
    merge_operation: MergeOperation
    purpose: str
    channels: List[str] = field(default_factory=list)
    # 4D-specific
    is_4d: bool = False
    w_dependent: bool = False  # Value varies with w-coordinate
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "format": self.format.value,
            "bit_depth": self.bit_depth.value,
            "merge_operation": self.merge_operation.value,
            "purpose": self.purpose,
            "channels": self.channels,
            "is_4d": self.is_4d,
            "w_dependent": self.w_dependent,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AOVSpec":
        return cls(
            name=data["name"],
            format=AOVFormat(data["format"]),
            bit_depth=AOVBitDepth(data["bit_depth"]),
            merge_operation=MergeOperation(data["merge_operation"]),
            purpose=data["purpose"],
            channels=data.get("channels", []),
            is_4d=data.get("is_4d", False),
            w_dependent=data.get("w_dependent", False),
        )


# ============================================================
# Standard 3D AOV Manifest (from Section 6.2)
# ============================================================

STANDARD_3D_AOVS = [
    AOVSpec("beauty", AOVFormat.RGBA, AOVBitDepth.HALF, MergeOperation.NONE,
            "Combined beauty render - reference only"),
    AOVSpec("diffuse_direct", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Direct illumination on diffuse surfaces"),
    AOVSpec("diffuse_indirect", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "GI bounced light on diffuse surfaces"),
    AOVSpec("specular_direct", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Direct specular highlights"),
    AOVSpec("specular_indirect", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Indirect specular (reflections of environment)"),
    AOVSpec("transmission_direct", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Direct transmission (glass, liquids)"),
    AOVSpec("transmission_indirect", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Indirect transmission"),
    AOVSpec("subsurface_direct", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Direct subsurface scattering"),
    AOVSpec("subsurface_indirect", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Indirect subsurface scattering"),
    AOVSpec("emission", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Self-illuminating surfaces"),
    AOVSpec("volume_scatter", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.OVER,
            "Atmospheric/participating media scatter"),
    AOVSpec("volume_emission", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Self-illuminating volumes (fire, lava)"),
    AOVSpec("albedo", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.NONE,
            "Base color without lighting - denoiser input"),
    AOVSpec("normal_3d", AOVFormat.VECTOR3, AOVBitDepth.HALF, MergeOperation.NONE,
            "World-space 3D normals - denoiser/relighting"),
    AOVSpec("depth_z", AOVFormat.MONO, AOVBitDepth.FULL, MergeOperation.NONE,
            "3D depth in scene units - DOF/fog"),
    AOVSpec("motion_vector_3d", AOVFormat.VECTOR2, AOVBitDepth.HALF, MergeOperation.NONE,
            "Screen-space 3D motion - MB/temporal denoise"),
    AOVSpec("material_id", AOVFormat.UINT16, AOVBitDepth.UINT16, MergeOperation.NONE,
            "Per-pixel material index - selection mattes"),
    AOVSpec("object_id", AOVFormat.UINT16, AOVBitDepth.UINT16, MergeOperation.NONE,
            "Per-pixel object index - isolation mattes"),
    AOVSpec("cryptomatte", AOVFormat.RGBA, AOVBitDepth.UINT16, MergeOperation.NONE,
            "Cryptomatte rank 0-2 - ID-based mattes in comp"),
    AOVSpec("shadow_catcher", AOVFormat.RGBA, AOVBitDepth.HALF, MergeOperation.MULTIPLY,
            "Shadow contribution on ground/contact"),
    AOVSpec("reflection_catcher", AOVFormat.RGBA, AOVBitDepth.HALF, MergeOperation.SCREEN,
            "Reflection contribution for comp augmentation"),
]

# ============================================================
# 4D-Specific AOV Extensions
# ============================================================

AOVS_4D = [
    # 4D Depth
    AOVSpec("depth_w", AOVFormat.MONO, AOVBitDepth.FULL, MergeOperation.NONE,
            "4D depth (w-coordinate) for volumetric composition and slice selection",
            channels=["W"], is_4d=True, w_dependent=True),
    
    # 4D Normals
    AOVSpec("normal_4d", AOVFormat.VECTOR4, AOVBitDepth.HALF, MergeOperation.NONE,
            "World-space 4D normals for 4D relighting and projection analysis",
            channels=["Nx", "Ny", "Nz", "Nw"], is_4d=True, w_dependent=True),
    
    # 4D Motion Vectors
    AOVSpec("motion_vector_4d", AOVFormat.VECTOR4, AOVBitDepth.HALF, MergeOperation.NONE,
            "4D screen-space motion (XY in 3D, ZW in 4D) for 4D temporal denoising",
            channels=["u", "v", "w_u", "w_v"], is_4d=True, w_dependent=True),
    
    # W-Coordinate
    AOVSpec("w_coordinate", AOVFormat.MONO, AOVBitDepth.FULL, MergeOperation.NONE,
            "Raw w-coordinate per pixel for 4D slice selection in comp",
            channels=["W"], is_4d=True, w_dependent=True),
    
    # Projection Jacobian
    AOVSpec("projection_jacobian", AOVFormat.MATRIX3X4, AOVBitDepth.FULL, MergeOperation.NONE,
            "3x4 projection Jacobian per pixel for 4D->3D distortion correction in comp",
            channels=["J00", "J01", "J02", "J03", "J10", "J11", "J12", "J13", "J20", "J21", "J22", "J23"],
            is_4d=True, w_dependent=True),
    
    # 4D Volume
    AOVSpec("volume_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.OVER,
            "4D volumetric scatter with w-coordinate density",
            channels=["R", "G", "B"], is_4d=True, w_dependent=True),
    
    AOVSpec("volume_emission_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Self-illuminating 4D volumes (fire, plasma in 4D)",
            channels=["R", "G", "B"], is_4d=True, w_dependent=True),
    
    # 4D Material IDs
    AOVSpec("material_id_4d", AOVFormat.UINT32, AOVBitDepth.UINT32, MergeOperation.NONE,
            "Per-pixel 4D material index with w-coordinate variant",
            channels=["ID"], is_4d=True, w_dependent=True),
    
    # 4D Cryptomatte
    AOVSpec("cryptomatte_4d", AOVFormat.RGBA, AOVBitDepth.UINT16, MergeOperation.NONE,
            "Cryptomatte with 4D w-coordinate encoding",
            channels=["R", "G", "B", "A"], is_4d=True, w_dependent=True),
    
    # 4D Light Path Expressions
    AOVSpec("lpe_diffuse_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "LPE: Diffuse with 4D w-coordinate path tracking",
            is_4d=True, w_dependent=True),
    AOVSpec("lpe_specular_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "LPE: Specular with 4D w-coordinate path tracking",
            is_4d=True, w_dependent=True),
    AOVSpec("lpe_volume_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "LPE: Volume with 4D w-coordinate path tracking",
            is_4d=True, w_dependent=True),
    
    # 4D Caustics
    AOVSpec("caustics_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "4D caustics with w-coordinate photon mapping",
            is_4d=True, w_dependent=True),
    
    # 4D Subsurface
    AOVSpec("subsurface_4d", AOVFormat.RGB, AOVBitDepth.HALF, MergeOperation.ADD,
            "Subsurface scattering with 4D w-coordinate radius variation",
            is_4d=True, w_dependent=True),
    
    # Projection Distortion
    AOVSpec("projection_distortion", AOVFormat.MONO, AOVBitDepth.HALF, MergeOperation.NONE,
            "Per-pixel 4D->3D projection distortion magnitude for comp correction",
            channels=["distortion"], is_4d=True, w_dependent=True),
]

# ============================================================
# Complete AOV Manifest
# ============================================================

COMPLETE_AOV_MANIFEST = STANDARD_3D_AOVS + AOVS_4D


def get_aov_manifest(include_4d: bool = True) -> List[AOVSpec]:
    """Get AOV manifest for pipeline configuration."""
    if include_4d:
        return COMPLETE_AOV_MANIFEST
    return STANDARD_3D_AOVS


def get_aov_names(include_4d: bool = True) -> List[str]:
    """Get list of AOV names for renderer adapter."""
    manifest = get_aov_manifest(include_4d)
    return [aov.name for aov in manifest]


def get_4d_aov_names() -> List[str]:
    """Get only 4D-specific AOV names."""
    return [aov.name for aov in AOVS_4D]


def get_aov_manifest_for_renderer(renderer: str, include_4d: bool = True) -> List[str]:
    """Get AOV list filtered for specific renderer capabilities."""
    # Each renderer may not support all 4D AOVs
    base = get_aov_names(include_4d)
    
    renderer_limits = {
        "cycles": ["projection_jacobian", "lpe_diffuse_4d", "lpe_specular_4d", "lpe_volume_4d", "caustics_4d"],
        "arnold": [],
        "redshift": ["projection_jacobian", "lpe_volume_4d", "caustics_4d"],
        "karma": ["projection_jacobian"],
        "axiom_x": [],  # Supports all 4D AOVs
    }
    
    unsupported = renderer_limits.get(renderer.lower(), [])
    return [aov for aov in base if aov not in unsupported]


def build_aov_manifest_json(include_4d: bool = True) -> str:
    """Build JSON manifest for pipeline config."""
    import json
    manifest = {
        "aovs": [aov.to_dict() for aov in get_aov_manifest(include_4d)],
        "total_count": len(get_aov_manifest(include_4d)),
        "standard_3d_count": len(STANDARD_3D_AOVS),
        "four_d_count": len(AOVS_4D),
    }
    return json.dumps(manifest, indent=2)


def get_layer_stack(include_4d: bool = True) -> List[Dict[str, Any]]:
    """Get Section 6.1 layer stack with 4D extensions."""
    base_stack = [
        {"layer": 1, "name": "Background Plate", "blend": "none", "alpha": "solid",
         "notes": "Live action plate or procedural BG"},
        {"layer": 2, "name": "Diffuse GI (Indirect)", "blend": "add", "alpha": "premult",
         "aov": "diffuse_indirect"},
        {"layer": 3, "name": "Direct Diffuse", "blend": "add", "alpha": "premult",
         "aov": "diffuse_direct"},
        {"layer": 4, "name": "Specular (Direct + Indirect)", "blend": "add", "alpha": "premult",
         "aovs": ["specular_direct", "specular_indirect"]},
        {"layer": 5, "name": "SSS", "blend": "add", "alpha": "premult",
         "aov": "subsurface_indirect"},
        {"layer": 6, "name": "Volume / Atmosphere", "blend": "over", "alpha": "premult",
         "aovs": ["volume_scatter", "volume_emission"]},
        {"layer": 7, "name": "FX Passes", "blend": "over/add", "alpha": "premult",
         "notes": "Particle FX, lens flares"},
        {"layer": 8, "name": "Matte Painting", "blend": "over", "alpha": "premult",
         "notes": "DMP extensions with hero holdout"},
        {"layer": 9, "name": "Color Grade / LUT", "blend": "global", "alpha": "N/A",
         "notes": "ACES RRT + creative LUT"},
    ]
    
    if include_4d:
        # Insert 4D-specific layers after volume
        four_d_layers = [
            {"layer": 6.5, "name": "4D Volume", "blend": "over", "alpha": "premult",
             "aovs": ["volume_4d", "volume_emission_4d"]},
            {"layer": 6.6, "name": "4D SSS", "blend": "add", "alpha": "premult",
             "aov": "subsurface_4d"},
            {"layer": 6.7, "name": "4D Caustics", "blend": "add", "alpha": "premult",
             "aov": "caustics_4d"},
            {"layer": 6.8, "name": "Projection Distortion", "blend": "over", "alpha": "premult",
             "aov": "projection_distortion", "notes": "Comp correction for 4D->3D distortion"},
        ]
        
        # Insert after layer 6 (Volume)
        result = base_stack[:6]
        result.extend(four_d_layers)
        result.extend(base_stack[6:])
        return result
    
    return base_stack


def validate_aov_outputs(output_paths: Dict[str, str], include_4d: bool = True) -> Dict[str, Any]:
    """Validate all expected AOVs were rendered (Section 6.5)."""
    expected = get_aov_names(include_4d)
    missing = [aov for aov in expected if aov not in output_paths]
    extra = [aov for aov in output_paths if aov not in expected]
    
    return {
        "expected_count": len(expected),
        "rendered_count": len(output_paths),
        "missing": missing,
        "extra": extra,
        "complete": len(missing) == 0,
    }


if __name__ == "__main__":
    import json
    print(f"Standard 3D AOVs: {len(STANDARD_3D_AOVS)}")
    print(f"4D AOVs: {len(AOVS_4D)}")
    print(f"Total: {len(COMPLETE_AOV_MANIFEST)}")
    print(f"\n4D AOV names: {get_4d_aov_names()}")
    print(f"\nLayer stack (4D): {len(get_layer_stack(include_4d=True))} layers")
    
    # Export manifest
    manifest_json = build_aov_manifest_json(include_4d=True)
    with open("aov_manifest_4d.json", "w") as f:
        f.write(manifest_json)
    print(f"\nExported aov_manifest_4d.json")