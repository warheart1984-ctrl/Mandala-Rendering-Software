"""Blueprint CLI — Command-line interface for the cinematic render pipeline.

Usage:
    blueprint render --schema shot.yaml --renderer cycles --frames 1-100
    blueprint lookdev --schema shot.yaml --output prompts.json
    blueprint validate --schema shot.yaml --envlock envlock.json
    blueprint assemble --manifest manifest.json --frames 1-100
"""

from __future__ import annotations

import argparse
import json
import sys
import yaml
from pathlib import Path
from typing import List, Optional

# Ensure daniel_blueprint is in path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema
from daniel_blueprint.ai.lookdev_assistant import LookdevAssistant
from daniel_blueprint.adapters import get_adapter, list_adapters, IRendererAdapter, RenderSettings


def cmd_render(args: argparse.Namespace) -> int:
    """Execute render with specified renderer."""
    # Load schema
    schema = RenderPromptSchema.from_yaml(args.schema)

    # Parse frame range
    frames = parse_frame_range(args.frames)

    # Get adapter
    adapter_class = get_adapter(args.renderer)
    adapter = adapter_class()

    # Initialize
    init_config = {
        "working_dir": args.output_dir or ".",
        "ocio_config_path": args.ocio,
        "device": args.device,
        "log_level": args.log_level,
    }
    if not adapter.initialize(init_config):
        print(f"[ERROR] Failed to initialize {args.renderer}")
        return 1

    # Load scene
    print(f"[RENDER] Loading scene: {args.scene}")
    scene_handle = adapter.loadScene(args.scene, {"assets": []})

    # Build render settings from schema
    settings = build_render_settings(schema, args)

    # Apply settings
    try:
        adapter.setRenderSettings(settings)
    except Exception as e:
        print(f"[ERROR] Settings validation failed: {e}")
        return 1

    # Execute render passes
    passes = ["primary_ray", "gi", "volume", "denoise", "composite"]
    if args.passes:
        passes = args.passes.split(",")

    for frame in frames:
        print(f"[RENDER] Frame {frame:04d}")
        for pass_id in passes:
            result = adapter.executePass(pass_id, frame)
            if result.status != "success":
                print(f"[ERROR] Pass {pass_id} frame {frame} failed: {result.error}")
                if args.abort_on_error:
                    return 1
            else:
                print(f"  {pass_id}: {result.render_time_seconds:.2f}s, {result.sample_count} samples")

    # Teardown
    adapter.teardown()
    print("[RENDER] Complete")
    return 0


def cmd_lookdev(args: argparse.Namespace) -> int:
    """Generate AI lookdev prompts from schema."""
    schema = RenderPromptSchema.from_yaml(args.schema)
    assistant = LookdevAssistant(schema)

    if args.output:
        assistant.export_prompts_json(Path(args.output))
        print(f"[LOOKDEV] Exported prompts to {args.output}")
    else:
        prompts = assistant.build_all_prompts()
        for key, prompt in prompts.items():
            if isinstance(prompt, dict):
                print(f"\n=== {key.upper()} ===")
                for asset, p in prompt.items():
                    print(f"\n--- {asset} ---")
                    print(p.instruction[:500] + "...")
            else:
                print(f"\n=== {key.upper()} ===")
                print(prompt.instruction[:500] + "...")

    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    """Validate schema against EnvLock."""
    schema = RenderPromptSchema.from_yaml(args.schema)
    envlock = load_envlock(args.envlock)

    deviations = validate_schema_against_envlock(schema, envlock)

    if deviations:
        print("[VALIDATE] Deviations found:")
        for d in deviations:
            print(f"  {d['severity']}: {d['param']} = {d['active']} (locked: {d['locked']}, delta: {d['delta']})")
        if args.abort_on_critical and any(d["severity"] == "CRITICAL" for d in deviations):
            return 1
    else:
        print("[VALIDATE] No deviations found")
    return 0


def cmd_assemble(args: argparse.Namespace) -> int:
    """Assemble frames from AOV passes."""
    manifest = load_manifest(args.manifest)
    frames = parse_frame_range(args.frames)

    for frame in frames:
        print(f"[ASSEMBLE] Frame {frame:04d}")
        # Would call batch_assemble from blueprint
        pass
    return 0


def cmd_list_adapters(args: argparse.Namespace) -> int:
    """List available renderer adapters."""
    for name in list_adapters():
        adapter_class = get_adapter(name)
        adapter = adapter_class()
        print(f"{name}: {adapter.renderer_name} - {adapter.renderer_version}")
        print(f"  AOVs: {', '.join(adapter.supported_aovs[:10])}{'...' if len(adapter.supported_aovs) > 10 else ''}")
    return 0


def build_render_settings(schema: RenderPromptSchema, args: argparse.Namespace) -> RenderSettings:
    """Build RenderSettings from schema and CLI args."""
    cam = schema.camera
    light = schema.primary_light_source

    frames = parse_frame_range(args.frames)

    return RenderSettings(
        primary_samples=args.samples or 512,
        max_ray_depth=args.max_depth or 8,
        clamp_value=args.clamp or 10.0,
        resolution=tuple(args.resolution) if args.resolution else (1920, 1080),
        colorspace=args.colorspace or "ACES_AP1_Linear",
        aov_manifest=args.aovs.split(",") if args.aovs else [
            "beauty", "diffuse_direct", "diffuse_indirect", "specular_direct",
            "specular_indirect", "normal", "depth", "motion_vector", "albedo"
        ],
        frame_range=(frames[0], frames[-1]),
        output_dir=args.output_dir or ".",
        random_seed=args.seed or 0xDEADBEEF,
        # Camera invariants
        focal_length_mm=cam.focal_length_mm,
        aperture_fstop=cam.aperture_fstop,
        shutter_open=-0.25,
        shutter_close=0.25,
        motion_blur_samples=5,
    )


def parse_frame_range(frames_str: str) -> List[int]:
    """Parse frame range string like '1-100' or '1,2,3' or '1-100x2'."""
    frames = []
    for part in frames_str.split(","):
        part = part.strip()
        if "x" in part:
            range_part, step = part.split("x")
            step = int(step)
        else:
            range_part = part
            step = 1

        if "-" in range_part:
            start, end = map(int, range_part.split("-"))
            frames.extend(range(start, end + 1, step))
        else:
            frames.append(int(range_part))
    return sorted(set(frames))


def load_envlock(path: str) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def load_manifest(path: str) -> dict:
    with open(path, "r") as f:
        if path.endswith(".yaml") or path.endswith(".yml"):
            return yaml.safe_load(f)
        return json.load(f)


def validate_schema_against_envlock(schema: RenderPromptSchema, envlock: dict) -> List[dict]:
    """Validate schema parameters against EnvLock."""
    deviations = []
    lock_env = envlock.get("environment", {})

    # HDRI
    if "hdri" in lock_env:
        lock_hdri = lock_env["hdri"]
        if schema.scene_intent.weather != lock_hdri.get("weather", ""):
            deviations.append({
                "param": "weather",
                "locked": lock_hdri.get("weather"),
                "active": schema.scene_intent.weather,
                "delta": "MISMATCH",
                "severity": "WARNING",
            })

    # Sun
    if "sun" in lock_env:
        lock_sun = lock_env["sun"]
        if lock_sun.get("enabled") and schema.primary_light_source.type.value != "sun":
            deviations.append({
                "param": "primary_light_source.type",
                "locked": "sun",
                "active": schema.primary_light_source.type.value,
                "delta": "MISMATCH",
                "severity": "CRITICAL",
            })

    # Fog
    if "fog_settings" in lock_env:
        lock_fog = lock_env["fog_settings"]
        # Would compare fog density if schema had it
        pass

    # Practical lights
    for lock_light in lock_env.get("practical_lights", []):
        # Would match by light_id
        pass

    return deviations


# Import for lookdev command
from daniel_blueprint.ai.lookdev_assistant import LookdevAssistant
from daniel_blueprint.core.constitutional_session import ConstitutionalRenderSession


def cmd_session(args: argparse.Namespace) -> int:
    """Run constitutional render session with SovereignXBridge."""
    schema = RenderPromptSchema.from_yaml(args.schema)
    
    from daniel_blueprint.schemas.envlock import EnvLock
    envlock = EnvLock.from_json(args.envlock)
    
    frames = parse_frame_range(args.frames)
    passes = args.passes.split(",") if args.passes else None
    
    print(f"[SESSION] Starting constitutional render session")
    print(f"  Shot: {schema.shot_id} ({schema.project_id})")
    print(f"  Frames: {frames[0]}-{frames[-1]} ({len(frames)} frames)")
    print(f"  Renderer: {args.renderer}")
    print(f"  EnvLock: {envlock.lock_id}")
    
    try:
        session = ConstitutionalRenderSession(
            schema, 
            envlock, 
            adapter_name=args.renderer,
            cache_dir=args.cache_dir,
        )
        
        if not session.initialize():
            print("[SESSION] Failed to initialize session")
            return 1
        
        print("[SESSION] Session initialized successfully")
        print(f"  Session ID: {session.session_id}")
        print(f"  Intent ID: {session.intent_id}")
        
        # Render sequence
        results = session.render_sequence(frames, passes)
        
        # Finalize
        session_data = session.finalize()
        
        # Report
        completed = len(session_data.get("frames_completed", []))
        failed = len(session_data.get("frames_failed", []))
        warnings = len(session_data.get("warnings", []))
        
        print(f"[SESSION] Complete: {completed} completed, {failed} failed, {warnings} warnings")
        
        if failed > 0:
            print("[SESSION] Failed frames:")
            for f in session_data.get("frames_failed", []):
                print(f"  Frame {f['frame']}: {f['pass']} - {f['error']}")
        
        if warnings > 0:
            print("[SESSION] Warnings:")
            for w in session_data.get("warnings", []):
                print(f"  {w}")
        
        return 0 if failed == 0 else 1
        
    except Exception as e:
        print(f"[SESSION] Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    parser = argparse.ArgumentParser(description="Daniel's Cinematic Render Blueprint CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # render
    render_parser = subparsers.add_parser("render", help="Execute render")
    render_parser.add_argument("--schema", required=True, help="RenderPromptSchema YAML file")
    render_parser.add_argument("--scene", required=True, help="Scene file (USD, blend, abc, fbx)")
    render_parser.add_argument("--renderer", choices=list_adapters(), default="cycles", help="Renderer to use")
    render_parser.add_argument("--frames", default="1-1", help="Frame range (e.g., 1-100, 1,5,10)")
    render_parser.add_argument("--samples", type=int, help="Primary samples")
    render_parser.add_argument("--max-depth", type=int, help="Max ray depth")
    render_parser.add_argument("--clamp", type=float, help="Clamp value")
    render_parser.add_argument("--resolution", nargs=2, type=int, metavar=("W", "H"), help="Resolution")
    render_parser.add_argument("--colorspace", help="Output colorspace")
    render_parser.add_argument("--aovs", help="Comma-separated AOV list")
    render_parser.add_argument("--seed", type=int, help="Random seed")
    render_parser.add_argument("--device", default="GPU", help="Device (GPU/CPU)")
    render_parser.add_argument("--ocio", help="OCIO config path")
    render_parser.add_argument("--output-dir", help="Output directory")
    render_parser.add_argument("--log-level", default="INFO", help="Log level")
    render_parser.add_argument("--passes", help="Comma-separated pass list")
    render_parser.add_argument("--abort-on-error", action="store_true", help="Abort on first error")
    render_parser.set_defaults(func=cmd_render)

    # lookdev
    lookdev_parser = subparsers.add_parser("lookdev", help="Generate AI lookdev prompts")
    lookdev_parser.add_argument("--schema", required=True, help="RenderPromptSchema YAML file")
    lookdev_parser.add_argument("--output", help="Output JSON file")
    lookdev_parser.set_defaults(func=cmd_lookdev)

    # validate
    validate_parser = subparsers.add_parser("validate", help="Validate schema against EnvLock")
    validate_parser.add_argument("--schema", required=True, help="RenderPromptSchema YAML file")
    validate_parser.add_argument("--envlock", required=True, help="EnvLock JSON file")
    validate_parser.add_argument("--abort-on-critical", action="store_true", help="Exit 1 on CRITICAL")
    validate_parser.set_defaults(func=cmd_validate)

    # assemble
    assemble_parser = subparsers.add_parser("assemble", help="Assemble frames from AOVs")
    assemble_parser.add_argument("--manifest", required=True, help="Assembly manifest JSON/YAML")
    assemble_parser.add_argument("--frames", default="1-1", help="Frame range")
    assemble_parser.set_defaults(func=cmd_assemble)

    # session — constitutional render session
    session_parser = subparsers.add_parser("session", help="Constitutional render session (SovereignXBridge)")
    session_parser.add_argument("--schema", required=True, help="RenderPromptSchema YAML file")
    session_parser.add_argument("--envlock", required=True, help="EnvLock JSON file")
    session_parser.add_argument("--renderer", choices=list_adapters(), default="axiom_x", help="Renderer adapter")
    session_parser.add_argument("--frames", default="1-1", help="Frame range (e.g., 1-100)")
    session_parser.add_argument("--passes", help="Comma-separated pass list")
    session_parser.add_argument("--cache-dir", default="./tmp/axiom_x_cache", help="Cache directory")
    session_parser.set_defaults(func=cmd_session)

    # list-adapters
    list_parser = subparsers.add_parser("list-adapters", help="List available renderer adapters")
    list_parser.set_defaults(func=cmd_list_adapters)

    args = parser.parse_args()

    if not hasattr(args, 'func'):
        parser.print_help()
        return 1

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())