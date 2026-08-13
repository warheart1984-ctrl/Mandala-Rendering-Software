"""
30-Second Anime MP4 Generator
Uses Mandala constitutional render pipeline + FFmpeg stitching
"""

from __future__ import annotations

import yaml
import tempfile
import shutil
from pathlib import Path
from typing import List, Optional
import subprocess
import sys

# Add project root to path
import sys
sys.path.insert(0, r"G:\Mandala Rendering Software")
sys.path.insert(0, r"G:\Mandala Rendering Software\sme-gen")

from daniel_blueprint.cli.main import cmd_session
from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema
from daniel_blueprint.schemas.envlock import EnvLock
from daniel_blueprint.schemas.aov_manifest_4d import get_aov_manifest
from sme_gen.ffmpeg.stitch import FFmpegStitcher, VideoEncodingConfig, StitchConfig
from daniel_blueprint.core.constitutional_session import ConstitutionalRenderSession
from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema
from daniel_blueprint.schemas.envlock import EnvLock
import argparse
import time


def create_anime_prompt_schema(
    shot_id: str,
    project_id: str,
    title: str = "Anime Short",
    fps: int = 24,
    duration_seconds: float = 30.0,
) -> RenderPromptSchema:
    """Create an anime-style prompt schema."""
    
    total_frames = int(duration_seconds * fps)
    
    schema_dict = {
        "schema_version": "1.0",
        "shot_id": shot_id,
        "project_id": project_id,
        "scene_intent": {
            "mood": "dynamic, energetic, cinematic",
            "genre": "anime action",
            "time_of_day": "golden hour sunset",
            "weather": "clear sky with dramatic clouds",
            "narrative_beat": f"{title} - opening sequence"
        },
        "primary_light_source": {
            "type": "sun",
            "color_temp_K": 5600,
            "intensity_lux": 100000,
            "direction_vector": [0.3, -0.8, 0.5],
            "angular_diameter_deg": 0.53,
            "shadow_softness": "soft"
        },
        "material_descriptors": [
            {
                "asset_name": "character_skin",
                "surface_type": "SSS",
                "roughness_range": [0.3, 0.5],
                "metalness": 0.0,
                "IOR": 1.4,
                "subsurface_radius_mm": [8, 3, 2],
                "notes": "Anime-style SSS for character skin"
            },
            {
                "asset_name": "character_hair",
                "surface_type": "mixed",
                "roughness_range": [0.2, 0.4],
                "metalness": 0.0,
                "IOR": 1.55,
                "subsurface_radius_mm": [0, 0, 0],
                "notes": "Anime hair with sharp specular highlights"
            },
            {
                "asset_name": "character_eyes",
                "surface_type": "mixed",
                "roughness_range": [0.05, 0.15],
                "metalness": 0.0,
                "IOR": 1.33,
                "subsurface_radius_mm": [0, 0, 0],
                "notes": "Large reflective anime eyes with catchlights"
            },
            {
                "asset_name": "sky",
                "surface_type": "emission",
                "roughness_range": [0.0, 0.0],
                "metalness": 0.0,
                "IOR": 1.0,
                "subsurface_radius_mm": [0, 0, 0],
                "notes": "Sky dome with gradient"
            },
            {
                "asset_name": "ground",
                "surface_type": "diffuse",
                "roughness_range": [0.7, 0.9],
                "metalness": 0.0,
                "IOR": 1.5,
                "subsurface_radius_mm": [0, 0, 0],
                "notes": "Stylized ground plane"
            }
        ],
        "atmosphere": {
            "fog_density": 0.02,
            "scattering_coefficient": 0.03,
            "dust_particles": False,
            "rain_streak_density": 0.0,
            "atmospheric_model": "preetham"
        },
        "camera": {
            "focal_length_mm": 35.0,
            "aperture_fstop": 2.8,
            "shutter_angle": 180.0,
            "sensor_size": "Super35",
            "focus_distance_m": 5.0,
            "camera_motion": "dolly"
        },
        "color_grade_intent": "Vibrant anime palette with cel-shaded look. High contrast, saturated colors. Key colors: warm skin tones, vibrant hair colors, saturated sky blues. Cel-shaded shadows with hard boundaries.",
        "reference_films": [
            "Makoto Shinkai - Your Name (sky rendering)",
            "Studio Ghibli - Spirited Away (color palette)",
            "Ufotable - Demon Slayer (effects)",
            "Mappa - Jujutsu Kaisen (action cinematography)"
        ],
        "ai_instruction": f"Generate a {duration_seconds}-second anime opening sequence at {fps}fps ({int(duration_seconds * fps)} frames). Cel-shaded look with hard shadows, vibrant color palette. Dynamic camera moves: start wide establishing shot, dolly in to character, action pose, dramatic close-up. Cel-shaded shadows with hard boundaries. Vibrant saturated colors. Dynamic camera: start wide, dolly in, action pose, dramatic close-up."
    }
    
    # Add derived fields
    schema_dict["random_seed"] = 0xDEADBEEF
    schema_dict["primary_samples"] = 64
    
    return RenderPromptSchema.model_validate(schema_dict)


def create_envlock(
    shot_id: str,
    project_id: str,
) -> EnvLock:
    """Create a basic EnvLock for the shot."""
    return EnvLock(
        lock_id=f"ENVLOCK-{project_id}-{shot_id}-v001-20260811T1200",
        lock_tier=2,
        lock_tier_name="HARD_LOCK",
        project_id=project_id,
        scene_id=shot_id,
        version="v001",
        environment={
            "hdri": {
                "file": "hdri/sunset_sky_v001.hdr",
                "sha256": "a3f4c9d2e1b5a7f8c3d4e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2",
                "rotation_y_deg": 180.0,
                "intensity_multiplier": 1.0,
                "colorspace": "linear_rec709"
            },
            "sun": {
                "enabled": True,
                "azimuth_deg": 225.0,
                "elevation_deg": 45.0,
                "intensity_lux": 100000.0
            },
            "fog_settings": {
                "enabled": True,
                "density": 0.02,
                "scattering_coefficient": 0.03,
                "absorption_coefficient": 0.005,
                "color_linear_rgb": [0.6, 0.7, 0.8],
                "height_falloff": 0.5
            },
            "practical_lights": []
        },
        changelog=[],
    )


def render_anime_sequence(
    schema: RenderPromptSchema,
    envlock: EnvLock,
    frames: List[int],
    output_dir: Path,
    renderer: str = "axiom_x",
    passes: List[str] = None,
) -> List[Path]:
    """Render a sequence of frames using the constitutional session."""
    
    if passes is None:
        passes = ["project_4d_to_3d", "primary_ray", "gi", "volume", "denoise", "composite"]
    
    # Create constitutional session
    session = ConstitutionalRenderSession(
        schema,
        envlock,
        adapter_name=renderer,
        cache_dir=str(output_dir / "cache"),
    )
    
    if not session.initialize():
        raise RuntimeError("Failed to initialize constitutional session")
    
    try:
        print(f"Rendering {len(frames)} frames...")
        results = session.render_sequence(frames, passes=None)
        
        # Collect output paths
        frame_paths = []
        for i, frame in enumerate(frames):
            result = results[i]
            if result.get("status") == "success":
                # Find the composite output
                output_found = False
                for pass_id, path in result.get("output_paths", {}).items():
                    if "composite" in pass_id or "beauty" in pass_id:
                        frame_paths.append(Path(path))
                        output_found = True
                        break
                
                # If no output paths (mock scene), generate placeholder
                if not output_found:
                    # Generate placeholder frame
                    from PIL import Image
                    import numpy as np
                    img = Image.new("RGB", (1920, 1080), 
                                  color=(int(255 * frame / len(frames)), 100, 200))
                    placeholder_path = output_dir / "frames" / f"frame_{frame:04d}.png"
                    placeholder_path.parent.mkdir(parents=True, exist_ok=True)
                    img.save(placeholder_path)
                    frame_paths.append(placeholder_path)
        
        return frame_paths
        
    finally:
        session.finalize()


def stitch_to_mp4(
    frame_dir: Path,
    output_path: Path,
    framerate: int = 24,
    width: int = 1920,
    height: int = 1080,
    crf: int = 18,
) -> dict:
    """Stitch frame sequence to MP4 using FFmpeg."""
    
    config = VideoEncodingConfig(
        codec="libx264",
        preset="slow",
        crf=crf,
        framerate=framerate,
        width=width,
        height=height,
        pixel_format="yuv420p",
    )
    
    stitcher = FFmpegStitcher(config=config)
    
    # Use image sequence stitching
    evidence = stitcher.stitch_image_sequence(
        image_dir=frames_dir,
        output_path=output_path,
        pattern="frame_%04d.png",
        framerate=framerate,
    )
    
    return evidence


def main():
    parser = argparse.ArgumentParser(description="Generate 30-second anime MP4")
    parser.add_argument("--shot-id", default="ANIME_001")
    parser.add_argument("--project-id", default="ANIME_DEMO")
    parser.add_argument("--duration", type=float, default=30.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--output", default="anime_output.mp4")
    parser.add_argument("--crf", type=int, default=18)
    parser.add_argument("--renderer", default="axiom_x")
    
    args = parser.parse_args()
    
    # Create prompt schema
    print(f"Creating anime prompt schema for {args.duration}s at {args.fps}fps...")
    schema = create_anime_prompt_schema(
        shot_id=args.shot_id,
        project_id=args.project_id,
        fps=args.fps,
        duration_seconds=args.duration,
    )
    
    # Create envlock
    envlock = create_envlock(args.shot_id, args.project_id)
    
    # Save schema and envlock for reference
    schema_path = Path(f"{args.shot_id}_schema.yaml")
    envlock_path = Path(f"{args.shot_id}_envlock.json")
    
    schema_path.write_text(schema.to_yaml())
    envlock_path.write_text(envlock.to_json())
    print(f"Saved schema to {schema_path}")
    print(f"Saved envlock to {envlock_path}")
    
    # Calculate frames
    total_frames = int(args.duration * args.fps)
    frames = list(range(1, total_frames + 1))
    print(f"Rendering {total_frames} frames ({args.duration}s at {args.fps}fps)...")
    
    # Create output directory
    frames_dir = Path("frames")
    frames_dir.mkdir(exist_ok=True)
    
    # Render frames
    print("Starting constitutional render session...")
    try:
        frame_paths = render_anime_sequence(
            schema=schema,
            envlock=envlock,
            frames=list(range(1, total_frames + 1)),
            output_dir=Path("output"),
            renderer=args.renderer,
        )
        
        # Move frames to frames directory
        for i, path in enumerate(frame_paths, 1):
            dst = frames_dir / f"frame_{i:04d}.png"
            shutil.copy2(path, dst)
        
        print(f"Rendered {len(frame_paths)} frames")
        
    except Exception as e:
        print(f"Rendering failed: {e}")
        print("Using placeholder frames for demo...")
        # Create placeholder frames for demo
        from PIL import Image
        for i in range(1, total_frames + 1):
            img = Image.new("RGB", (args.width, args.height), 
                          color=(int(255 * i / total_frames), 100, 200))
            img.save(frames_dir / f"frame_{i:04d}.png")
        print(f"Created {total_frames} placeholder frames")
    
    # Stitch to MP4
    print("Stitching frames to MP4...")
    stitcher = FFmpegStitcher(VideoEncodingConfig(
        width=args.width,
        height=args.height,
        framerate=args.fps,
        crf=args.crf,
    ))
    
    evidence = stitcher.stitch_image_sequence(
        image_dir=frames_dir,
        output_path=Path(args.output),
        framerate=args.fps,
    )
    
    print(f"Created {args.output}: {evidence}")


if __name__ == "__main__":
    main()