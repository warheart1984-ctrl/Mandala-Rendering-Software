#!/usr/bin/env python3
"""
face_pipeline.py — Constitutional Face Pipeline.

Prompt → SceneSpec → GLB (governed) → Cycles (photoreal, ACES 2.0) → PNG + USD + provenance.

Usage:
    python -m app.face_pipeline --prompt "hero face" --output hero.png
    python -m app.face_pipeline --prompt "elderly wizard" --face-glb ./operator-assets/human/HumanFaceRigged.glb --quality final --output wizard.png
    python -m app.face_pipeline --prompt "abstract" --scene-type tesseract --output tesseract.png --no-usd
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# ─── Paths ──────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parents[3]  # G:\Mandala Rendering Software\mrs
ENGINE3D_CORE = REPO_ROOT / "packages" / "engine3d-core"
RENDERER_CORE = REPO_ROOT / "packages" / "renderer-core"
ENGINE3D_SCRIPTS = ENGINE3D_CORE / "scripts"
RENDERER_SCRIPTS = RENDERER_CORE / "scripts"
RENDER_GLB = REPO_ROOT / "packages" / "renderer-core" / "scripts" / "render-glb.mjs"
VALIDATE_FACE = REPO_ROOT / "packages" / "engine3d-core" / "scripts" / "validate-face-glb.mjs"
CYCLES_RENDER = REPO_ROOT / "packages" / "renderer-core" / "scripts" / "render-prod-cycles.py"
OCIO_CONFIG = REPO_ROOT / "assets" / "ocio" / "aces_cg_config.ocio"

NODE_EXE = shutil.which("node") or "node.cmd"
BLENDER_EXE = shutil.which("blender") or r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"

QUALITY_PRESETS = {
    "draft": {"width": 512, "height": 512, "samples": 64},
    "review": {"width": 1024, "height": 1024, "samples": 256},
    "final": {"width": 2048, "height": 2048, "samples": 1024},
}

# ─── Logging ────────────────────────────────────────────────────────────────

log = logging.getLogger("face_pipeline")
log.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-8s | %(message)s", "%H:%M:%S"))
log.addHandler(handler)

# ─── Helpers ────────────────────────────────────────────────────────────────

def run(cmd: list[str], cwd: Optional[Path] = None, env: Optional[Dict[str, str]] = None, timeout: int = 300) -> subprocess.CompletedProcess:
    """Run command, raise on failure. Use shell=True on Windows for node/blender."""
    if os.name == "nt":
        # On Windows, use proper Windows paths (not POSIX) for subprocess with shell=True
        cmd = [str(c) for c in cmd]
    use_shell = os.name == "nt" and cmd[0].lower() in ("node", "node.cmd", "blender", "blender.exe")
    log.debug("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, cwd=cwd, env=env or os.environ.copy(), capture_output=True, text=True, timeout=timeout, shell=os.name == "nt", check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}\nstdout: {result.stdout}\nstderr: {result.stderr}")
    return result


def sha256_file(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ─── Pipeline ───────────────────────────────────────────────────────────────


SCENE_TYPES = {
    "face": {"validate": True, "glb_source": "HumanFaceRiggedProd.glb"},
    "tesseract": {"validate": False, "glb_source": None},
}

class FacePipeline:
    def __init__(
        self,
        prompt: str,
        output: Path,
        quality: str = "review",
        samples: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        seed: Optional[int] = None,
        face_glb: Optional[Path] = None,
        scene_type: str = "face",
        work_dir: Optional[Path] = None,
        ocio_config: Optional[Path] = None,
        shot_meta: Optional[Dict[str, Any]] = None,
    ):
        self.prompt = prompt
        self.output = Path(output)
        self.quality = quality
        self.scene_type = scene_type
        preset = QUALITY_PRESETS[quality]
        self.width = width or preset["width"]
        self.height = height or preset["height"]
        self.samples = samples or preset["samples"]
        self.seed = seed or int(time.time() * 1000) & 0xFFFFFFFF
        self.face_glb = face_glb
        self.export_usd = True
        self.ocio_config = ocio_config or OCIO_CONFIG
        self.shot_meta = shot_meta or {}

        prefix = scene_type
        self.work_dir = work_dir or (Path("tmp") / f"{prefix}-{uuid.uuid4().hex[:8]}")
        self.work_dir.mkdir(parents=True, exist_ok=True)

        self.scene_spec_path = self.work_dir / "scene_spec.json"
        self.glb_path = self.work_dir / "scene.glb"
        self.png_path = self.work_dir / "render.png"
        self.final_png = self.output
        self.provenance_path = self.work_dir / "provenance.json"

    # ── Stage 1: SceneSpec ────────────────────────────────────────────────

    def run_stage1(self) -> Dict:
        log.info("Stage 1: Building SceneSpec...")
        if self.scene_type == "tesseract":
            spec = {
                "id": f"abstract-{uuid.uuid4().hex[:8]}",
                "kind": "SceneSpecification",
                "schemaVersion": "1.0",
                "seed": self.seed,
                "prompt": self.prompt,
                "camera": {"position4d": [0.0, 0.5, 4.0, 0.0], "target4d": [0.0, 0.0, 0.0, 0.0]},
                "output": {"width": self.width, "height": self.height, "samples": self.samples, "maxDepth": 8, "qualityOpts": {"tonemap": "aces-lite"}},
                "lights": [
                    {"id": "key", "type": "hypersphere", "center": [3.0, 2.0, 2.0, 0.0], "radius": 0.6, "emission": [1.0, 0.9, 0.8, 0.0]},
                    {"id": "fill", "type": "hypersphere", "center": [-2.0, 1.0, 1.0, 0.0], "radius": 0.8, "emission": [0.2, 0.3, 0.5, 0.0]},
                    {"id": "rim", "type": "hypersphere", "center": [0.0, 3.0, -2.0, 0.0], "radius": 0.4, "emission": [0.5, 0.6, 0.8, 0.0]},
                ],
                "entities": [
                    {"id": "sphere1", "geometry": {"kind": "hypersphere", "radius": 0.8}, "materialId": "mat_blue", "transform4d": {"translate": [-0.8, 0.5, 0.0, 0.0], "rotate": {"xw": 0, "zw": 0}, "scale": [1, 1, 1, 1]}},
                    {"id": "sphere2", "geometry": {"kind": "hypersphere", "radius": 0.5}, "materialId": "mat_red", "transform4d": {"translate": [0.9, -0.3, 0.5, 0.0], "rotate": {"xw": 0, "zw": 0}, "scale": [1, 1, 1, 1]}},
                    {"id": "ground", "geometry": {"kind": "hyperplane", "width": 3.0, "height": 3.0}, "materialId": "mat_ground", "transform4d": {"translate": [0, -0.8, 0, 0], "rotate": {"xw": 0, "zw": 0}, "scale": [1, 1, 1, 1]}},
                ],
                "materials": [
                    {"id": "mat_blue", "color": "#3366cc", "opacity": 0.9, "brdf": "ggx", "roughness": 0.2, "f0": 0.04},
                    {"id": "mat_red", "color": "#cc4433", "opacity": 0.9, "brdf": "ggx", "roughness": 0.4, "f0": 0.03},
                    {"id": "mat_ground", "color": "#2a2a3a", "opacity": 1.0, "brdf": "lambertian", "roughness": 0.8, "f0": 0.01},
                ],
            }
        else:
            spec = {
                "id": f"face-{uuid.uuid4().hex[:8]}",
                "kind": "SceneSpecification",
                "schemaVersion": "1.0",
                "seed": self.seed,
                "prompt": self.prompt,
                "camera": {"position4d": [0.0, 1.6, 3.0, 0.0], "target4d": [0.0, 1.5, 0.0, 0.0], "fovX": 50, "fovY": 50, "fovZ": 45, "fovW": 28},
                "output": {"width": self.width, "height": self.height, "samples": self.samples, "maxDepth": 8, "qualityOpts": {"tonemap": "aces-lite", "adaptiveSampling": True}},
                "lights": [
                    {"id": "key", "type": "hypersphere", "center": [1.5, 2.0, 1.0, 0.0], "radius": 0.8, "emission": [1.0, 0.95, 0.9, 0.0]},
                    {"id": "fill", "type": "hypersphere", "center": [-1.0, 1.5, 0.5, 0.0], "radius": 1.2, "emission": [0.3, 0.35, 0.4, 0.0]},
                    {"id": "rim", "type": "hypersphere", "center": [0.0, 2.0, -2.0, 0.0], "radius": 0.5, "emission": [0.8, 0.8, 0.9, 0.0]},
                ],
                "entities": [{"id": "face", "transform4d": {"translate": [0, 0, 0, 0], "rotate": {"xw": 0, "zw": 0}, "scale": [1, 1, 1, 1]}, "geometry": {"kind": "meshRef", "meshRef": "HumanFaceRiggedProd.glb"}, "materialId": "face_skin", "tags": ["face", "hero"]}],
                "materials": [
                    {"id": "face_skin", "color": "#e8b89a", "opacity": 1.0, "brdf": "ggx", "roughness": 0.45, "f0": 0.04},
                    {"id": "eyes", "color": "#0d0d14", "opacity": 1.0, "brdf": "ggx", "roughness": 0.05, "f0": 0.02},
                    {"id": "mouth", "color": "#c05a5a", "opacity": 1.0, "brdf": "ggx", "roughness": 0.4, "f0": 0.03},
                ],
            }
        shot = {}
        for key in ("sequenceId", "episodeId", "shotId", "take", "frameStart", "frameEnd", "sceneVersion", "shotVersion"):
            if self.shot_meta.get(key) is not None:
                shot[key] = self.shot_meta[key]
        if shot:
            spec["shot"] = shot

        self.scene_spec_path.write_text(json.dumps(spec, indent=2))
        spec_hash = sha256_file(self.scene_spec_path)
        log.info("  SceneSpec: %s (hash: %s)", self.scene_spec_path, spec_hash[:16])
        return {"spec": spec, "spec_hash": spec_hash}

    # ── Stage 2: GLB Export ───────────────────────────────────────────────

    def run_stage2(self, face_glb: Optional[Path]) -> str:
        log.info("Stage 2: Exporting governed GLB...")
        if self.scene_type == "tesseract":
            spec_path = str(self.scene_spec_path.resolve())
            glb_path = str(self.glb_path.resolve())
            cmd = [NODE_EXE, str(RENDER_GLB.resolve()), "--spec", spec_path, "--output", glb_path]
            run(cmd, cwd=None, timeout=120)
            if not self.glb_path.exists():
                raise RuntimeError("render-glb.mjs failed to produce GLB")
        else:
            if face_glb and face_glb.exists():
                shutil.copy2(face_glb, self.glb_path)
            else:
                face_fixture = REPO_ROOT / "assets" / "human" / "HumanFaceRiggedProd.glb"
                if face_fixture.exists():
                    shutil.copy2(face_fixture, self.glb_path)
                else:
                    face_fallback = REPO_ROOT / "assets" / "human" / "HumanFaceRigged.glb"
                    if face_fallback.exists():
                        shutil.copy2(face_fallback, self.glb_path)
                    else:
                        raise RuntimeError("No face fixture GLB available")

        glb_hash = sha256_file(self.glb_path)
        log.info("  GLB: %s (hash: %s)", self.glb_path, glb_hash[:16])
        return glb_hash

    # ── Stage 3: Validate ──────────────────────────────────────────────────

    def run_stage3(self) -> Dict:
        log.info("Stage 3: Validating GLB...")
        if self.scene_type != "face":
            log.info("  Skipping (scene_type=%s)", self.scene_type)
            return {"valid": True}
        glb_path = str(self.glb_path.resolve())
        validate_face = str(VALIDATE_FACE.resolve())
        cmd = [NODE_EXE, validate_face, glb_path]
        result = run(cmd, cwd=None, timeout=60)
        validation = {"valid": "Valid: YES" in result.stdout}
        warnings = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith("- "):
                warnings.append(line[2:])
        if warnings:
            validation["warnings"] = warnings
        log.info("  Validation: %s", "PASSED" if validation["valid"] else "FAILED")
        return validation

    # ── Stage 4: Cycles Render ─────────────────────────────────────────────

    def run_stage4(self) -> str:
        log.info("Stage 4: Cycles render (%dx%d, %d samples)...", self.width, self.height, self.samples)
        env = os.environ.copy()
        env["PATH"] += os.pathsep + str(Path(BLENDER_EXE).parent)
        if self.ocio_config and self.ocio_config.exists():
            env["OCIO"] = str(self.ocio_config.resolve())
        glb_path = str(self.glb_path.resolve())
        png_path = str(self.png_path.resolve())
        cycles_script = str(CYCLES_RENDER.resolve())
        cmd = [BLENDER_EXE, "-b", "-P", cycles_script, "--", glb_path, png_path, str(self.samples), str(self.width), str(self.height)]
        if self.export_usd:
            cmd.append("--export-usd")
        run(cmd, env=env, cwd=None, timeout=1800)

        png_hash = sha256_file(self.png_path)
        log.info("  Render: %s (hash: %s)", self.png_path, png_hash[:16])
        usd_path = self.work_dir / "render.usd"
        if usd_path.exists():
            self.usd_hash = sha256_file(usd_path)
            log.info("  USD: %s (hash: %s)", usd_path, self.usd_hash[:16])
        return png_hash

    # ── Stage 5: Provenance ────────────────────────────────────────────────

    def run_stage5(self, validation: Dict, spec_hash: str, glb_hash: str, png_hash: str) -> Dict:
        log.info("Stage 5: Finalizing provenance...")
        self.final_png.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.png_path, self.final_png)

        provenance = {
            "schemaVersion": "1.0.0",
            "runId": uuid.uuid4().hex[:12],
            "timestamp": utc_now(),
            "prompt": self.prompt,
            "quality": self.quality,
            "samples": self.samples,
            "width": self.width,
            "height": self.height,
            "seed": self.seed,
            "colorspace": "ACES 2.0 - SDR 100 nits (Rec.709)" if self.ocio_config and self.ocio_config.exists() else "AgX",
            "shot": self.shot_meta or None,
            "sceneSpec": {"path": str(self.scene_spec_path), "sha256": spec_hash},
            "governedGLB": {"path": str(self.glb_path), "sha256": glb_hash, "validation": validation},
            "renderOutput": {"path": str(self.final_png), "sha256": png_hash, "width": self.width, "height": self.height, "samples": self.samples},
            "usdExport": {"path": str(self.png_path.with_suffix(".usd")), "sha256": self.usd_hash} if getattr(self, "usd_hash", None) else None,
            "governance": {"pipeline": "face_pipeline", "version": "1.0.0", "constitutional": True, "specHash": spec_hash, "deterministic": True},
        }
        provenance["usdExport"] = provenance["usdExport"] or None
        self.provenance_path.write_text(json.dumps(provenance, indent=2))
        log.info("  Provenance: %s", self.provenance_path)
        return provenance

    # ── Orchestrator ───────────────────────────────────────────────────────

    def run(self) -> Dict:
        log.info("=== Render Pipeline Start (scene_type=%s) ===", self.scene_type)
        log.info("Prompt: %s", self.prompt)
        log.info("Quality: %s (%dx%d, %d samples)", self.quality, self.width, self.height, self.samples)
        log.info("Work dir: %s", self.work_dir)

        stage1 = self.run_stage1()
        glb_hash = self.run_stage2(self.face_glb)
        validation = self.run_stage3()
        png_hash = self.run_stage4()
        provenance = self.run_stage5(validation, stage1["spec_hash"], glb_hash, png_hash)

        log.info("=== Render Pipeline Complete ===")
        log.info("Scene: %s", self.scene_type)
        log.info("Output: %s", self.final_png)
        log.info("Provenance: %s", self.provenance_path)

        return {"ok": True, "scene_type": self.scene_type, "output": str(self.final_png), "provenance": str(self.provenance_path), "specHash": stage1["spec_hash"], "glbHash": glb_hash, "pngHash": png_hash}


# ─── CLI ───────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Constitutional Render Pipeline")
    parser.add_argument("--prompt", required=True, help="Description prompt")
    parser.add_argument("--output", "-o", required=True, type=Path, help="Output PNG path")
    parser.add_argument("--scene-type", choices=list(SCENE_TYPES.keys()), default="face", help="Scene type to render")
    parser.add_argument("--quality", choices=list(QUALITY_PRESETS.keys()), default="review", help="Quality preset")
    parser.add_argument("--samples", type=int, help="Override samples")
    parser.add_argument("--width", type=int, help="Override width")
    parser.add_argument("--height", type=int, help="Override height")
    parser.add_argument("--seed", type=int, help="Random seed")
    parser.add_argument("--face-glb", type=Path, help="Existing production face GLB")
    parser.add_argument("--work-dir", type=Path, help="Working directory")
    parser.add_argument("--no-usd", action="store_true", help="Disable USD export")
    parser.add_argument("--ocio-config", type=Path, help="Custom OCIO config path")
    parser.add_argument("--sequence", dest="sequence_id", help="Sequence id (e.g. seq001)")
    parser.add_argument("--episode", dest="episode_id", help="Episode id (e.g. ep01)")
    parser.add_argument("--shot", dest="shot_id", help="Shot id (e.g. shot_010)")
    parser.add_argument("--take", type=int, default=None, help="Take number (>= 0)")
    parser.add_argument("--frame-start", type=int, default=None, help="Frame range start")
    parser.add_argument("--frame-end", type=int, default=None, help="Frame range end")
    parser.add_argument("--scene-version", dest="scene_version", help="SceneSpec version label (e.g. v1.2)")
    parser.add_argument("--shot-version", dest="shot_version", help="Shot version label (e.g. v3)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    pipeline = FacePipeline(
        prompt=args.prompt,
        output=args.output,
        quality=args.quality,
        samples=args.samples,
        width=args.width,
        height=args.height,
        seed=args.seed,
        face_glb=args.face_glb,
        scene_type=args.scene_type,
        work_dir=args.work_dir,
        ocio_config=args.ocio_config,
        shot_meta={
            "sequenceId": args.sequence_id,
            "episodeId": args.episode_id,
            "shotId": args.shot_id,
            "take": args.take,
            "frameStart": args.frame_start,
            "frameEnd": args.frame_end,
            "sceneVersion": args.scene_version,
            "shotVersion": args.shot_version,
        },
    )
    pipeline.export_usd = not args.no_usd

    try:
        result = pipeline.run()
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        log.error("Pipeline failed: %s", e)
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())