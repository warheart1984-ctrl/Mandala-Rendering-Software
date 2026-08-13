"""AI Lookdev Assistant — Translates RenderPromptSchema into concrete LLM prompts.

Section 3.2/3.3: Generates structured prompts for AI lookdev tools to produce:
- HDRI selection & 3-point lighting breakdown
- Material shader network specifications
- Camera parameter validation
- Color grade LUT direction
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

# Ensure daniel_blueprint is in path
sys.path.insert(0, r"G:\Mandala Rendering Software\daniel_blueprint")

from schemas.prompt_schema import RenderPromptSchema, MaterialDescriptor, LightType, SurfaceType


@dataclass
class LookdevPrompt:
    """A single prompt for an AI lookdev assistant."""
    role: str
    instruction: str
    context: dict
    output_schema: dict
    temperature: float = 0.3


class LookdevAssistant:
    """Generates AI prompts from RenderPromptSchema."""

    def __init__(self, schema: RenderPromptSchema):
        self.schema = schema

    def build_lighting_prompt(self) -> LookdevPrompt:
        """Generate 3-point lighting breakdown from primary light + scene intent."""
        light = self.schema.primary_light_source
        intent = self.schema.scene_intent

        instruction = f"""
You are a senior CG lighting TD. Generate a complete 3-point lighting breakdown for this shot.

SHOT CONTEXT:
- Mood: {intent.mood}
- Genre: {intent.genre}
- Time: {intent.time_of_day}
- Weather: {intent.weather}
- Narrative beat: {intent.narrative_beat}

PRIMARY LIGHT (Key):
- Type: {light.type.value}
- Color temp: {light.color_temp_K}K
- Intensity: {light.intensity_lux} lux at subject
- Direction: {light.direction_vector}
- Shadow softness: {light.shadow_softness.value}

REQUIRED OUTPUT (JSON):
{{
  "key_light": {{
    "type": "area|sun|spot|HDRI",
    "position_xyz": [x, y, z],
    "rotation_xyz": [x, y, z],
    "color_temp_K": int,
    "intensity_lux": float,
    "size_cm": [width, height],
    "shadow_softness": "hard|soft|very_soft",
    "ies_profile": "path_or_null"
  }},
  "fill_light": {{
    "type": "area|HDRI",
    "position_xyz": [x, y, z],
    "color_temp_K": int,
    "intensity_lux": float,
    "ratio_to_key": float,
    "motivation": "string"
  }},
  "rim_light": {{
    "type": "area|spot",
    "position_xyz": [x, y, z],
    "color_temp_K": int,
    "intensity_lux": float,
    "angle_deg": float,
    "motivation": "string"
  }},
  "practical_lights": [
    {{
      "light_id": "string",
      "type": "area|spot|point",
      "position_xyz": [x, y, z],
      "color_temp_K": int,
      "intensity_lux": float,
      "ies_profile": "string",
      "motivation": "string"
    }}
  ],
  "hdri_recommendation": {{
    "description": "string",
    "rotation_y_deg": float,
    "intensity_multiplier": float,
    "color_space": "linear_rec709|acescg"
  }},
  "lighting_ratios": {{
    "key_to_fill": float,
    "key_to_rim": float,
    "notes": "string"
  }}
}}

REFERENCE FILMS: {', '.join(self.schema.reference_films) if self.schema.reference_films else 'None provided'}

AI INSTRUCTION OVERRIDE: {self.schema.ai_instruction or 'None'}
"""

        return LookdevPrompt(
            role="senior_lighting_td",
            instruction=instruction.strip(),
            context={
                "primary_light": light.model_dump(),
                "scene_intent": intent.model_dump(),
                "references": self.schema.reference_films,
            },
            output_schema={
                "type": "object",
                "properties": {
                    "key_light": {"type": "object"},
                    "fill_light": {"type": "object"},
                    "rim_light": {"type": "object"},
                    "practical_lights": {"type": "array"},
                    "hdri_recommendation": {"type": "object"},
                    "lighting_ratios": {"type": "object"},
                },
                "required": ["key_light", "fill_light", "rim_light", "hdri_recommendation"],
            },
        )

    def build_material_prompt(self, asset_name: str) -> LookdevPrompt:
        """Generate shader network spec for a specific asset."""
        mat = next((m for m in self.schema.material_descriptors if m.asset_name == asset_name), None)
        if not mat:
            raise ValueError(f"No material descriptor for asset: {asset_name}")

        roughness_mid = sum(mat.roughness_range) / 2

        instruction = f"""
You are a senior lookdev/shading artist. Generate a complete shader network specification for this asset.

ASSET: {asset_name}
SURFACE TYPE: {mat.surface_type.value}
ROUGHNESS RANGE: {mat.roughness_range} (midpoint: {roughness_mid:.3f})
METALNESS: {mat.metalness}
IOR: {mat.ior}
SUBSURFACE RADIUS (mm): {mat.subsurface_radius_mm}
NOTES: {mat.notes}

SCENE CONTEXT:
- Mood: {self.schema.scene_intent.mood}
- Primary light: {self.schema.primary_light_source.type.value} @ {self.schema.primary_light_source.color_temp_K}K
- Weather: {self.schema.scene_intent.weather}

REQUIRED OUTPUT (JSON):
{{
  "asset_name": "{asset_name}",
  "surface_type": "{mat.surface_type.value}",
  "base_layer": {{
    "shader_type": "principled_bsdf|standard_surface|materialx_surfacemodel",
    "base_color": [r, g, b],
    "roughness": {roughness_mid:.3f},
    "metalness": {mat.metalness},
    "ior": {mat.ior},
    "specular": 0.5,
    "specular_tint": [r, g, b],
    "clearcoat": 0.0,
    "clearcoat_roughness": 0.0
  }},
  "layers": [
    {{
      "name": "string",
      "type": "coat|sheen|iridescence|thin_film|subsurface|emission|layered_mix",
      "parameters": {{}},
      "blend_mode": "mix|add|multiply|screen",
      "mask": "procedural|texture|vertex_color|null"
    }}
  ],
  "textures_required": [
    {{
      "name": "base_color|roughness|normal|subsurface|mask",
      "udim_tiles": ["1001", "1002"],
      "color_space": "srgb|linear|acescg",
      "description": "string"
    }}
  ],
  "subsurface": {{
    "enabled": {str(mat.surface_type == SurfaceType.SSS).lower()},
    "radius_mm": {mat.subsurface_radius_mm},
    "scale": 1.0,
    "texture": "path_or_null"
  }},
  "displacement": {{
    "enabled": false,
    "amount_cm": 0.0,
    "mid_level": 0.5
  }},
  "materialx_network": "string|nullable",
  "arnold_shader": "string|nullable",
  "vray_shader": "string|nullable",
  "cycles_nodes": "string|nullable",
  "karma_vop": "string|nullable"
}}

REFERENCE: {self.schema.ai_instruction or 'Use scene context and reference films for artistic direction.'}
"""

        return LookdevPrompt(
            role="senior_lookdev_artist",
            instruction=instruction.strip(),
            context={
                "material": mat.model_dump(),
                "roughness_mid": roughness_mid,
                "scene_context": {
                    "primary_light": self.schema.primary_light_source.model_dump(),
                    "weather": self.schema.scene_intent.weather,
                },
            },
            output_schema={
                "type": "object",
                "properties": {
                    "asset_name": {"type": "string"},
                    "surface_type": {"type": "string"},
                    "base_layer": {"type": "object"},
                    "layers": {"type": "array"},
                    "textures_required": {"type": "array"},
                    "subsurface": {"type": "object"},
                    "displacement": {"type": "object"},
                },
                "required": ["asset_name", "base_layer", "layers", "textures_required"],
            },
        )

    def build_camera_prompt(self) -> LookdevPrompt:
        """Validate and enhance camera parameters."""
        cam = self.schema.camera

        instruction = f"""
You are a cinematography technical director. Validate and enhance camera parameters for this shot.

CURRENT PARAMETERS:
- Focal length: {cam.focal_length_mm}mm
- Aperture: f/{cam.aperture_fstop}
- Shutter angle: {cam.shutter_angle}°
- Sensor size: {cam.sensor_size.value}
- Focus distance: {cam.focus_distance_m}m
- Camera motion: {cam.camera_motion.value}

SCENE CONTEXT:
- Mood: {self.schema.scene_intent.mood}
- Narrative beat: {self.schema.scene_intent.narrative_beat}

REQUIRED OUTPUT (JSON):
{{
  "validated_parameters": {{
    "focal_length_mm": {cam.focal_length_mm},
    "aperture_fstop": {cam.aperture_fstop},
    "shutter_angle": {cam.shutter_angle},
    "sensor_size": "{cam.sensor_size.value}",
    "focus_distance_m": {cam.focus_distance_m},
    "circle_of_confusion_mm": 0.02,
    "hyperfocal_distance_m": 0.0,
    "dof_near_m": 0.0,
    "dof_far_m": 0.0
  }},
  "recommendations": {{
    "focal_length_note": "string",
    "aperture_note": "string",
    "focus_pull_schedule": [
      {{"frame": 0, "distance_m": 0.0, "note": "string"}}
    ],
    "motion_blur_samples": 5,
    "shutter_timing": "center|open|close"
  }},
  "lens_character": {{
    "bokeh_shape": "circular|hexagonal|custom",
    "vignette_strength": 0.3,
    "chromatic_aberration": 0.002,
    "breathing_factor": 0.0,
    "distortion_k1": 0.0,
    "distortion_k2": 0.0
  }},
  "sensor_format": {{
    "width_mm": 24.9,
    "height_mm": 18.7,
    "pixel_aspect": 1.0
  }}
}}
"""

        return LookdevPrompt(
            role="cinematography_td",
            instruction=instruction.strip(),
            context={"camera": cam.model_dump()},
            output_schema={
                "type": "object",
                "properties": {
                    "validated_parameters": {"type": "object"},
                    "recommendations": {"type": "object"},
                    "lens_character": {"type": "object"},
                    "sensor_format": {"type": "object"},
                },
                "required": ["validated_parameters", "recommendations", "lens_character"],
            },
        )

    def build_color_grade_prompt(self) -> LookdevPrompt:
        """Generate LUT/grade direction from color_grade_intent + references."""
        instruction = f"""
You are a senior colorist. Generate a complete color grade specification from intent.

COLOR GRADE INTENT: {self.schema.color_grade_intent or 'Not specified'}
REFERENCE FILMS: {', '.join(self.schema.reference_films) if self.schema.reference_films else 'None'}

SCENE CONTEXT:
- Mood: {self.schema.scene_intent.mood}
- Genre: {self.schema.scene_intent.genre}
- Time of day: {self.schema.scene_intent.time_of_day}
- Primary light: {self.schema.primary_light_source.type.value} @ {self.schema.primary_light_source.color_temp_K}K

REQUIRED OUTPUT (JSON):
{{
  "aces_workflow": {{
    "input_colorspace": "ACES_AP1_Linear",
    "working_colorspace": "ACES_AP1_Linear",
    "rrt_version": "RRT v1.0",
    "odt": "Output_Rec709|Output_P3DCI|Output_sRGB"
  }},
  "pre_grade": {{
    "exposure_bias_ev": 0.0,
    "contrast": 1.0,
    "pivot": 0.18,
    "saturation": 1.0,
    "temperature": 0,
    "tint": 0
  }},
  "creative_grade": {{
    "lift": [r, g, b],
    "gamma": [r, g, b],
    "gain": [r, g, b],
    "offset": [r, g, b],
    "saturation": 1.0,
    "hue_shift": 0
  }},
  "look_luts": [
    {{
      "name": "string",
      "path": "string",
      "strength": 1.0,
      "colorspace_in": "ACES_AP1_Linear",
      "colorspace_out": "ACES_AP1_Linear"
    }}
  ],
  "secondary_corrections": [
    {{
      "target": "skin|sky|shadows|highlights|specific_hue",
      "hue_range": [min, max],
      "adjustment": {{"lift": [r,g,b], "gamma": [r,g,b], "gain": [r,g,b]}}
    }}
  ],
  "vignette": {{
    "enabled": true,
    "strength": 0.3,
    "shape": "circular|oval",
    "falloff": 0.5
  }},
  "grain": {{
    "enabled": false,
    "strength": 0.0,
    "size": 1.0,
    "colorspace": "linear"
  }},
  "delivery": {{
    "colorspace": "Rec.709|P3-DCI|sRGB",
    "eotf": "BT.1886|ST.2084|Gamma2.4",
    "bit_depth": "10|12",
    "legal_range": true
  }}
}}

REFERENCE FILMS: {', '.join(self.schema.reference_films) if self.schema.reference_films else 'None provided'}
"""

        return LookdevPrompt(
            role="senior_colorist",
            instruction=instruction.strip(),
            context={
                "color_grade_intent": self.schema.color_grade_intent,
                "references": self.schema.reference_films,
                "scene": self.schema.scene_intent.model_dump(),
            },
            output_schema={
                "type": "object",
                "properties": {
                    "aces_workflow": {"type": "object"},
                    "pre_grade": {"type": "object"},
                    "creative_grade": {"type": "object"},
                    "look_luts": {"type": "array"},
                    "secondary_corrections": {"type": "array"},
                    "vignette": {"type": "object"},
                    "grain": {"type": "object"},
                    "delivery": {"type": "object"},
                },
                "required": ["aces_workflow", "creative_grade", "delivery"],
            },
        )

    def build_all_prompts(self) -> dict:
        """Generate all lookdev prompts for this shot."""
        prompts = {
            "lighting": self.build_lighting_prompt(),
            "camera": self.build_camera_prompt(),
            "color_grade": self.build_color_grade_prompt(),
            "materials": {},
        }

        for mat in self.schema.material_descriptors:
            prompts["materials"][mat.asset_name] = self.build_material_prompt(mat.asset_name)

        return prompts

    def export_prompts_json(self, path: Path) -> None:
        """Export all prompts as JSON for AI tool consumption."""
        prompts = self.build_all_prompts()
        data = {}
        for key, prompt in prompts.items():
            if isinstance(prompt, dict):
                data[key] = {k: {"role": p.role, "instruction": p.instruction, "context": p.context, "output_schema": p.output_schema, "temperature": p.temperature} for k, p in prompt.items()}
            else:
                data[key] = {"role": prompt.role, "instruction": prompt.instruction, "context": prompt.context, "output_schema": prompt.output_schema, "temperature": prompt.temperature}

        path.write_text(json.dumps(data, indent=2))


if __name__ == "__main__":
    import yaml

    schema = RenderPromptSchema.model_validate(yaml.safe_load("""
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
"""))

    assistant = LookdevAssistant(schema)
    prompts = assistant.build_all_prompts()

    print(f"Generated {len(prompts)} prompt categories:")
    for key, prompt in prompts.items():
        if isinstance(prompt, dict):
            print(f"  {key}: {len(prompt)} sub-prompts")
        else:
            print(f"  {key}: {prompt.role}")

    out_path = Path(r"G:\Mandala Rendering Software\daniel_blueprint\ai\lookdev_prompts.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    assistant.export_prompts_json(out_path)
    print(f"\nExported to {out_path}")