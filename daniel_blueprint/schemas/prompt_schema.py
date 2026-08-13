"""RenderPromptSchema — AI-assisted lookdev specification (Section 3)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, List, Optional

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator


class SurfaceType(str, Enum):
    DIFFUSE = "diffuse"
    METAL = "metal"
    GLASS = "glass"
    SSS = "SSS"
    EMISSION = "emission"
    MIXED = "mixed"


class LightType(str, Enum):
    SUN = "sun"
    AREA = "area"
    POINT = "point"
    SPOT = "spot"
    HDRI = "HDRI"
    PRACTICAL = "practical_motivated_area"


class ShadowSoftness(str, Enum):
    HARD = "hard"
    SOFT = "soft"
    VERY_SOFT = "very_soft"


class AtmosphericModel(str, Enum):
    PREETHAM = "preetham"
    HOSEK_WILKIE = "hosek-wilkie"
    NISHITA = "nishita"


class CameraMotion(str, Enum):
    STATIC = "static"
    HANDHELD = "handheld"
    DOLLY = "dolly"
    CRANE = "crane"
    DRONE = "drone"
    RIG = "rig"


class SensorSize(str, Enum):
    SUPER35 = "Super35"
    FULLFRAME = "FullFrame"
    IMAX = "IMAX"


@dataclass
class Vec3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def to_list(self) -> List[float]:
        return [self.x, self.y, self.z]

    @classmethod
    def from_list(cls, lst: List[float]) -> "Vec3":
        if len(lst) != 3:
            raise ValueError("Vec3 requires exactly 3 values")
        return cls(lst[0], lst[1], lst[2])


class MaterialDescriptor(BaseModel):
    asset_name: str
    surface_type: SurfaceType
    roughness_range: List[float] = Field(default=[0.5, 0.5], min_length=2, max_length=2)
    metalness: float = Field(default=0.0, ge=0.0, le=1.0)
    ior: float = Field(default=1.5, gt=0.0)
    subsurface_radius_mm: List[float] = Field(default=[0.0, 0.0, 0.0], min_length=3, max_length=3)
    notes: str = ""

    @field_validator("roughness_range")
    @classmethod
    def validate_roughness(cls, v: List[float]) -> List[float]:
        if any(r < 0.0 or r > 1.0 for r in v):
            raise ValueError("Roughness must be in [0, 1]")
        return v


class PrimaryLightSource(BaseModel):
    type: LightType
    color_temp_K: int = Field(default=5600, ge=1000, le=20000)
    intensity_lux: float = Field(default=100000.0, ge=0.0)
    direction_vector: List[float] = Field(default=[0.0, -1.0, 0.0], min_length=3, max_length=3)
    angular_diameter_deg: float = Field(default=0.53, ge=0.0)
    shadow_softness: ShadowSoftness = ShadowSoftness.SOFT


class Atmosphere(BaseModel):
    fog_density: float = Field(default=0.0, ge=0.0, le=1.0)
    scattering_coefficient: float = Field(default=0.0, ge=0.0)
    dust_particles: bool = False
    rain_streak_density: float = Field(default=0.0, ge=0.0, le=1.0)
    atmospheric_model: AtmosphericModel = AtmosphericModel.PREETHAM


class Camera(BaseModel):
    focal_length_mm: float = Field(default=35.0, gt=0.0)
    aperture_fstop: float = Field(default=2.8, gt=0.0)
    shutter_angle: float = Field(default=180.0, ge=0.0, le=360.0)
    sensor_size: SensorSize = SensorSize.SUPER35
    focus_distance_m: float = Field(default=0.0, ge=0.0)
    camera_motion: CameraMotion = CameraMotion.STATIC


class SceneIntent(BaseModel):
    mood: str = ""
    genre: str = ""
    time_of_day: str = ""
    weather: str = ""
    narrative_beat: str = ""


class RenderPromptSchema(BaseModel):
    schema_version: str = "1.0"
    shot_id: str
    project_id: str
    scene_intent: SceneIntent = Field(default_factory=SceneIntent)
    primary_light_source: PrimaryLightSource = Field(default_factory=lambda: PrimaryLightSource(type=LightType.HDRI))
    material_descriptors: List[MaterialDescriptor] = Field(default_factory=list)
    atmosphere: Atmosphere = Field(default_factory=Atmosphere)
    camera: Camera = Field(default_factory=Camera)
    color_grade_intent: str = ""
    reference_films: List[str] = Field(default_factory=list)
    ai_instruction: str = ""
    random_seed: int = Field(default=0xDEADBEEF, description="Deterministic random seed for render reproducibility")

    @model_validator(mode="after")
    def validate_schema(self) -> "RenderPromptSchema":
        if self.schema_version != "1.0":
            raise ValueError("Only schema_version 1.0 supported")
        return self

    def to_yaml(self) -> str:
        """Export as YAML string."""
        return yaml.dump(self.model_dump(), sort_keys=False, default_flow_style=False)

    def to_json(self, indent: int = 2) -> str:
        """Export as JSON string."""
        return self.model_dump_json(indent=indent)

    @classmethod
    def from_yaml(cls, path: Path | str) -> "RenderPromptSchema":
        """Load from YAML file."""
        with open(path, "r") as f:
            data = yaml.safe_load(f)
        return cls.model_validate(data)

    @classmethod
    def from_json(cls, path: Path | str) -> "RenderPromptSchema":
        """Load from JSON file."""
        with open(path, "r") as f:
            data = json.load(f)
        return cls.model_validate(data)

    def get_roughness_midpoint(self, asset_name: str) -> Optional[float]:
        """Get midpoint roughness for an asset."""
        for mat in self.material_descriptors:
            if mat.asset_name == asset_name:
                return sum(mat.roughness_range) / 2
        return None


import json

# Example from Section 3.3
EXAMPLE_SCHEMA = """
schema_version: "1.0"
shot_id: "SC012_SH0045"
project_id: "NOCTURNE_2026"
scene_intent:
  mood: "oppressive, dread, isolation"
  genre: "neo-noir crime thriller"
  time_of_day: "2:00 AM — deep night, no ambient sky light"
  weather: "heavy rain, standing puddles, wet surfaces throughout"
  narrative_beat: "protagonist discovers a body — quiet horror, no action"
primary_light_source:
  type: "practical_motivated_area"
  color_temp_K: 2900
  intensity_lux: 180
  direction_vector: [0.0, -1.0, 0.1]
  angular_diameter_deg: 0.0
  shadow_softness: "soft"
material_descriptors:
  - asset_name: "wet_asphalt"
    surface_type: "mixed"
    roughness_range: [0.02, 0.15]
    metalness: 0.0
    IOR: 1.33
    subsurface_radius_mm: [0, 0, 0]
    notes: "Use layered shader: dry asphalt base + rain-wet top layer blended by procedural puddle mask. Puddles should reflect neon signs directly."
  - asset_name: "hero_jacket"
    surface_type: "mixed"
    roughness_range: [0.4, 0.7]
    metalness: 0.0
    IOR: 1.52
    subsurface_radius_mm: [0, 0, 0]
    notes: "Black leather jacket, rain-soaked. Specular highlight from streetlamp should read as a single sharp-edged bright streak."
  - asset_name: "skin_hero"
    surface_type: "SSS"
    roughness_range: [0.35, 0.5]
    metalness: 0.0
    IOR: 1.4
    subsurface_radius_mm: [8, 3, 2]
    notes: "Face partially in shadow. Subsurface should be visible only on ear rim and jawline where streetlamp backlit. No rim light — silhouette."
atmosphere:
  fog_density: 0.08
  scattering_coefficient: 0.05
  dust_particles: false
  rain_streak_density: 0.7
  atmospheric_model: "hosek-wilkie"
camera:
  focal_length_mm: 75
  aperture_fstop: 1.8
  shutter_angle: 180
  sensor_size: "Super35"
  focus_distance_m: 2.2
  camera_motion: "handheld"
color_grade_intent: "Desaturated teal-blue shadows with deep crushed blacks. Sodium amber for midtones motivated by streetlamp. Highlights land at a cool off-white — no warm rolloff in highlights. Heavy vignette. Reference: Se7en (1995) rain sequences, True Detective S1 night exteriors."
reference_films:
  - "Se7en (1995) — night rain sequences, Andrew Lesnie / Darius Khondji"
  - "True Detective Season 1 — bayou night exteriors, Adam Arkapaw"
  - "Blade Runner 2049 — artificial light motivated scenes, Roger Deakins"
  - "Prisoners (2013) — desaturated, overcast, oppressive palette, Roger Deakins"
ai_instruction: "Generate a 3-point lighting breakdown for this setup. Motivate all secondary fill from off-screen neon signage (specify color temps and angles). Provide specular roughness values for wet asphalt that will show visible neon reflections. Suggest a V-Ray or Arnold shader network for the puddle layer blend. Color grade: target S-Log3/Venice as capture format, grade to Rec.709 delivery."
"""

if __name__ == "__main__":
    # Test loading
    schema = RenderPromptSchema.model_validate(yaml.safe_load(EXAMPLE_SCHEMA))
    print(f"Loaded: {schema.shot_id} ({schema.project_id})")
    print(f"Primary light: {schema.primary_light_source.type.value} @ {schema.primary_light_source.color_temp_K}K")
    print(f"Materials: {[m.asset_name for m in schema.material_descriptors]}")
    print(f"Camera: {schema.camera.focal_length_mm}mm f/{schema.camera.aperture_fstop}")
    print("Schema validation passed")