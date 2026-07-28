"""Deep execution for validated RenderRequest routes.

Invokes existing MRS Node CLIs (render-scene, proton pipeline / HQ splat,
engine3d still, worlddocument-rt4d). Does **not** implement StoryForge
PromptComposer.

Status: **enforced** for scene-spec, proton (draft+HQ), and rt4d when scripts
present; engine3d still **enforced** when PNG written else skeleton.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any, Callable

from paths import (
    default_output_dir,
    engine3d_still_script,
    find_node,
    proton_pipeline_script,
    proton_splat_script,
    render_scene_script,
    worlddocument_rt4d_script,
)


def _is_hq_quality(render: dict[str, Any]) -> bool:
    q = str(render.get("quality") or "draft").lower()
    return q in {"final", "high", "hq", "cinematic"}


def _is_cinematic_quality(render: dict[str, Any]) -> bool:
    """Opt-in denser stills; must not alter draft CI clamps."""
    return str(render.get("quality") or "draft").lower() == "cinematic"


def _resolve_dims(
    render: dict[str, Any],
    *,
    draft_cap: tuple[int, int] = (128, 96),
    hq_default: tuple[int, int] = (512, 512),
    hard_cap: int = 768,
) -> tuple[int, int]:
    w = int(render["width"])
    h = int(render["height"])
    if _is_cinematic_quality(render):
        # Cinematic: floor toward larger plates; still hard-capped.
        floor_w, floor_h = max(hq_default[0], 512), max(hq_default[1], 512)
        if w < floor_w:
            w = floor_w
        if h < floor_h:
            h = floor_h
        return min(w, hard_cap), min(h, hard_cap)
    if _is_hq_quality(render):
        if w < 256 and h < 256:
            w, h = hq_default
        return min(w, hard_cap), min(h, hard_cap)
    return min(w, draft_cap[0]), min(h, draft_cap[1])


class ExecuteError(RuntimeError):
    """Deep route failed (missing script, subprocess error, bad output)."""


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_json(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(payload)


def _run(
    argv: list[str],
    *,
    timeout: float | None = None,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    to = timeout
    if to is None:
        to = float(os.environ.get("MRS_RENDER_TIMEOUT_SECONDS", "120"))
    return subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=to,
        cwd=str(cwd) if cwd else None,
        check=False,
    )


def _ensure_node() -> str:
    node = find_node()
    if not node:
        raise ExecuteError("node binary not found (set RT4D_NODE_PATH)")
    return node


def execute_scene_spec(
    req: dict[str, Any],
    *,
    out_dir: Path | None = None,
    run_fn: Callable[..., subprocess.CompletedProcess[str]] | None = None,
) -> dict[str, Any]:
    """SceneSpecification → render-scene.mjs → PNG + provenance hashes."""
    spec = req["payload"].get("sceneSpecification")
    if not isinstance(spec, dict):
        raise ExecuteError("scene-spec route requires payload.sceneSpecification")

    # Normalize minimal fixtures into SceneSpecification shape
    spec_out = dict(spec)
    if "kind" not in spec_out:
        spec_out["kind"] = "SceneSpecification"
    if "schemaVersion" not in spec_out:
        spec_out["schemaVersion"] = "1.0"
    if "id" not in spec_out:
        spec_out["id"] = req.get("requestId", "render-request-scene")

    render = req["payload"]["render"]
    width = int(render["width"])
    height = int(render["height"])
    samples = int(render.get("samples") or 2)
    max_depth = int(render.get("maxDepth") or 3)
    seed = render.get("seed")
    if seed is None:
        seed = 42

    script = render_scene_script()
    if script is None:
        raise ExecuteError("render-scene.mjs not found (set SCENE_SPEC_SCRIPT_PATH)")

    out_root = (out_dir or default_output_dir()).resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    req_id = req["requestId"]
    png_path = out_root / f"{req_id}-scene-spec.png"
    prov_path = out_root / f"{req_id}-scene-spec.provenance.json"
    spec_path = out_root / f"{req_id}-scene-spec.json"

    # Clamp for smoke-friendly defaults when quality=draft; HQ/cinematic floors
    if not _is_hq_quality(render):
        width = min(width, 128)
        height = min(height, 96)
        samples = min(samples, 2)
        max_depth = min(max_depth, 3)
    elif _is_cinematic_quality(render):
        # Opt-in cinematic: cleaner RT4D stills. Floor 16 spp @ ≥512 —
        # 32 spp @ 512²×~357 spheres exceeded 600s on CPU hosts (evidence:
        # output/cecp-cinematic-quality scene timeout). Request may raise to 64.
        # Adaptive sampling + aces tonemap + firefly clamp via qualityOpts.
        width = min(max(width, 512), 768)
        height = min(max(height, 512), 768)
        samples = min(max(samples, 24), 64)
        max_depth = max(max_depth, 6)
    else:
        width = min(max(width, 256), 768)
        height = min(max(height, 256), 768)
        samples = max(samples, 4)
        max_depth = max(max_depth, 4)

    # Merge output into spec so CLI uses request dims
    output = dict(spec_out.get("output") or {})
    output.update(
        {
            "width": width,
            "height": height,
            "samples": samples,
            "maxDepth": max_depth,
            "seed": int(seed),
        }
    )
    if _is_cinematic_quality(render):
        qopts = dict(output.get("qualityOpts") or {})
        qopts.setdefault("adaptiveSampling", True)
        qopts.setdefault("tonemap", "aces-lite")
        qopts.setdefault("fireflyMax", 14)
        qopts.setdefault("varianceThreshold", 0.0008)
        qopts.setdefault("minSampleFraction", 0.55)
        output["qualityOpts"] = qopts
        if "exposure" not in output:
            output["exposure"] = 1.55
    spec_out["output"] = output
    spec_path.write_text(json.dumps(spec_out), encoding="utf-8")

    node = _ensure_node()
    argv = [
        node,
        str(script),
        "--",
        "--spec",
        str(spec_path),
        "--width",
        str(width),
        "--height",
        str(height),
        "--samples",
        str(samples),
        "--output",
        str(png_path),
        "--provenance",
        str(prov_path),
    ]
    runner = run_fn or _run
    proc = runner(argv, cwd=script.parent)
    if proc.returncode != 0:
        raise ExecuteError(
            f"render-scene failed ({proc.returncode}): {proc.stderr[-2000:]}"
        )
    if not png_path.is_file():
        raise ExecuteError(f"render-scene did not write PNG: {png_path}")

    png_bytes = png_path.read_bytes()
    png_hash = sha256_bytes(png_bytes)
    prov: dict[str, Any] = {}
    if prov_path.is_file():
        try:
            prov = json.loads(prov_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            prov = {}
    if prov.get("sha256") and prov["sha256"] != png_hash:
        # Prefer file hash as artifact truth
        pass

    return {
        "sceneSpecification": spec_out,
        "artifacts": [
            {
                "role": "beauty-png",
                "uri": str(png_path.as_posix()),
                "sha256": png_hash,
                "mediaType": "image/png",
            }
        ],
        "hashes": {
            "requestSha256": sha256_json(req),
            "sceneSpecSha256": sha256_json(spec_out),
            "pngSha256": png_hash,
            "promptSpecHash": (req.get("provenance") or {}).get("promptSpecHash"),
            "renderIntentHash": (req.get("provenance") or {}).get("renderIntentHash"),
        },
        "cliProvenance": prov,
        "mappedTo": "render-scene.mjs (SceneSpecification → RT4D still)",
        "statusTag": "enforced",
    }


def execute_proton_raster(
    req: dict[str, Any],
    *,
    out_dir: Path | None = None,
    run_fn: Callable[..., subprocess.CompletedProcess[str]] | None = None,
) -> dict[str, Any]:
    """Proton soft-splat: HQ star-demo via render-proton-splat, else pipeline CLI."""
    render = req["payload"]["render"]
    hq = _is_hq_quality(render)
    out_root = (out_dir or default_output_dir()).resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    req_id = req["requestId"]
    node = _ensure_node()
    runner = run_fn or _run
    seed = render.get("seed")
    if seed is None:
        seed = 42

    # HQ / cinematic: denser star field + beauty/depth/normal AOVs
    if hq:
        splat = proton_splat_script()
        if splat is None:
            raise ExecuteError(
                "render-proton-splat.mjs not found (set PROTON_SPLAT_SCRIPT)"
            )
        cinematic = _is_cinematic_quality(render)
        width, height = _resolve_dims(
            render,
            hq_default=(768, 768) if cinematic else (512, 512),
            hard_cap=768,
        )
        still_dir = out_root / f"{req_id}-proton-hq"
        still_dir.mkdir(parents=True, exist_ok=True)
        argv = [
            node,
            str(splat),
            "--star-demo",
            "--quality",
            "high",
            "--width",
            str(width),
            "--height",
            str(height),
            "--out-dir",
            str(still_dir),
            "--aov",
            "depth,normal",
            "--seed",
            str(int(seed)),
            "--lighting-punch",
        ]
        if cinematic:
            # Proton preset already supersamples at high; keep explicit for evidence.
            argv.extend(["--supersample", "2"])
        proc = runner(argv, cwd=splat.parent)
        if proc.returncode != 0:
            raise ExecuteError(
                f"proton HQ splat failed ({proc.returncode}): {proc.stderr[-2000:]}"
            )
        beauty = still_dir / "beauty.png"
        if not beauty.is_file():
            raise ExecuteError(f"proton HQ did not write beauty.png: {beauty}")
        artifacts: list[dict[str, Any]] = [
            {
                "role": "beauty-png",
                "uri": str(beauty.as_posix()),
                "sha256": sha256_bytes(beauty.read_bytes()),
                "mediaType": "image/png",
            }
        ]
        for role, name in (("depth-png", "depth.png"), ("normal-png", "normal.png")):
            p = still_dir / name
            if p.is_file():
                artifacts.append(
                    {
                        "role": role,
                        "uri": str(p.as_posix()),
                        "sha256": sha256_bytes(p.read_bytes()),
                        "mediaType": "image/png",
                    }
                )
        evidence_path = still_dir / "evidence.json"
        evidence: dict[str, Any] = {}
        if evidence_path.is_file():
            try:
                evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                evidence = {}
        png_hash = artifacts[0]["sha256"]
        return {
            "artifacts": artifacts,
            "hashes": {
                "requestSha256": sha256_json(req),
                "pngSha256": png_hash,
                "promptSpecHash": (req.get("provenance") or {}).get("promptSpecHash"),
                "renderIntentHash": (req.get("provenance") or {}).get(
                    "renderIntentHash"
                ),
            },
            "evidence": evidence,
            "mappedTo": "renderer-core/scripts/render-proton-splat.mjs --star-demo",
            "statusTag": "enforced",
        }

    # Draft: simpler bridge pipeline (scene-spec or demo hyperspheres)
    script = proton_pipeline_script()
    if script is None:
        raise ExecuteError(
            "run_proton_pipeline.mjs not found (set PROTON_PIPELINE_SCRIPT)"
        )

    width, height = _resolve_dims(render)
    png_path = out_root / f"{req_id}-proton.png"
    argv = [
        node,
        str(script),
        "--width",
        str(width),
        "--height",
        str(height),
        "--output",
        str(png_path),
    ]
    spec = req["payload"].get("sceneSpecification")
    if isinstance(spec, dict):
        spec_out = dict(spec)
        if "kind" not in spec_out:
            spec_out["kind"] = "SceneSpecification"
        if "schemaVersion" not in spec_out:
            spec_out["schemaVersion"] = "1.0"
        if "id" not in spec_out:
            spec_out["id"] = req_id
        spec_path = out_root / f"{req_id}-proton-spec.json"
        spec_path.write_text(json.dumps(spec_out), encoding="utf-8")
        argv.extend(["--scene-spec", str(spec_path)])
    else:
        argv.append("--demo")

    proc = runner(argv, cwd=script.parent)
    if proc.returncode != 0:
        raise ExecuteError(
            f"proton pipeline failed ({proc.returncode}): {proc.stderr[-2000:]}"
        )
    if not png_path.is_file():
        raise ExecuteError(f"proton pipeline did not write PNG: {png_path}")

    png_hash = sha256_bytes(png_path.read_bytes())
    evidence_path = Path(str(png_path).replace(".png", ".evidence.json"))
    evidence: dict[str, Any] = {}
    if evidence_path.is_file():
        try:
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            evidence = {}

    return {
        "artifacts": [
            {
                "role": "beauty-png",
                "uri": str(png_path.as_posix()),
                "sha256": png_hash,
                "mediaType": "image/png",
            }
        ],
        "hashes": {
            "requestSha256": sha256_json(req),
            "pngSha256": png_hash,
            "promptSpecHash": (req.get("provenance") or {}).get("promptSpecHash"),
            "renderIntentHash": (req.get("provenance") or {}).get("renderIntentHash"),
        },
        "evidence": evidence,
        "mappedTo": "proton-raster-bridge/run_proton_pipeline.mjs",
        "statusTag": "enforced",
    }


def execute_engine3d_world(
    req: dict[str, Any],
    *,
    out_dir: Path | None = None,
    run_fn: Callable[..., subprocess.CompletedProcess[str]] | None = None,
) -> dict[str, Any]:
    """Echo/expand Engine3D world; still render when script present."""
    world = req["payload"].get("engine3dWorldDocument")
    if not isinstance(world, dict):
        raise ExecuteError("engine3d-world requires payload.engine3dWorldDocument")

    out_root = (out_dir or default_output_dir()).resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    req_id = req["requestId"]
    world_path = out_root / f"{req_id}-engine3d-world.json"
    world_path.write_text(json.dumps(world), encoding="utf-8")

    script = engine3d_still_script()
    artifacts: list[dict[str, Any]] = [
        {
            "role": "engine3d-world-json",
            "uri": str(world_path.as_posix()),
            "sha256": sha256_json(world),
            "mediaType": "application/json",
        }
    ]
    status_tag = "partial"
    mapped = "engine3dWorldDocument written; still not run"

    if script is not None:
        node = _ensure_node()
        still_dir = out_root / f"{req_id}-engine3d-still"
        still_dir.mkdir(parents=True, exist_ok=True)
        render = req["payload"]["render"]
        cinematic = _is_cinematic_quality(render)
        width, height = _resolve_dims(
            render,
            draft_cap=(128, 96),
            hq_default=(512, 512) if cinematic else (256, 256),
            hard_cap=512,
        )
        argv = [
            node,
            str(script),
            "--engine3d-still",
            "--out-dir",
            str(still_dir),
            "--width",
            str(width),
            "--height",
            str(height),
            "--aov",
            "depth,normal",
            "--world",
            str(world_path),
            "--no-face-fixture",
        ]
        runner = run_fn or _run
        proc = runner(argv, cwd=script.parent)
        if proc.returncode == 0:
            pngs = sorted(still_dir.rglob("*.png"))
            beauty = next(
                (p for p in pngs if p.name.lower() in {"beauty.png", "beauty-png.png"}),
                pngs[0] if pngs else None,
            )
            if beauty is not None:
                png_hash = sha256_bytes(beauty.read_bytes())
                artifacts.append(
                    {
                        "role": "beauty-png",
                        "uri": str(beauty.as_posix()),
                        "sha256": png_hash,
                        "mediaType": "image/png",
                    }
                )
                for p in pngs:
                    low = p.name.lower()
                    if low == "depth.png":
                        artifacts.append(
                            {
                                "role": "depth-png",
                                "uri": str(p.as_posix()),
                                "sha256": sha256_bytes(p.read_bytes()),
                                "mediaType": "image/png",
                            }
                        )
                    elif low == "normal.png":
                        artifacts.append(
                            {
                                "role": "normal-png",
                                "uri": str(p.as_posix()),
                                "sha256": sha256_bytes(p.read_bytes()),
                                "mediaType": "image/png",
                            }
                        )
                mapped = "render-engine3d-still.mjs"
                status_tag = "enforced"
            else:
                mapped = "engine3d still ran but no PNG; world JSON retained"
                status_tag = "skeleton"
        else:
            mapped = (
                "engine3d still failed; world JSON retained "
                f"(exit {proc.returncode})"
            )
            status_tag = "skeleton"
    else:
        status_tag = "skeleton"
        mapped = "ENGINE3D_STILL_SCRIPT_PATH missing; world JSON only"

    hashes = {
        "requestSha256": sha256_json(req),
        "worldSha256": sha256_json(world),
        "promptSpecHash": (req.get("provenance") or {}).get("promptSpecHash"),
        "renderIntentHash": (req.get("provenance") or {}).get("renderIntentHash"),
    }
    beauty_art = next((a for a in artifacts if a["role"] == "beauty-png"), None)
    if beauty_art:
        hashes["pngSha256"] = beauty_art["sha256"]

    return {
        "engine3dWorldDocument": world,
        "artifacts": artifacts,
        "hashes": hashes,
        "mappedTo": mapped,
        "statusTag": status_tag,
    }


def execute_rt4d(
    req: dict[str, Any],
    *,
    out_dir: Path | None = None,
    run_fn: Callable[..., subprocess.CompletedProcess[str]] | None = None,
) -> dict[str, Any]:
    """RT4D via worldDocument or SceneSpecification fallback."""
    world = req["payload"].get("worldDocumentRt4d")
    if isinstance(world, dict):
        script = worlddocument_rt4d_script()
        if script is None:
            raise ExecuteError(
                "render-worlddocument-rt4d.mjs not found "
                "(set RT4D_WORLD_SCRIPT_PATH)"
            )
        out_root = (out_dir or default_output_dir()).resolve()
        out_root.mkdir(parents=True, exist_ok=True)
        req_id = req["requestId"]
        world_path = out_root / f"{req_id}-rt4d-world.json"
        png_path = out_root / f"{req_id}-rt4d.png"
        world_path.write_text(json.dumps(world), encoding="utf-8")
        node = _ensure_node()
        render = req["payload"]["render"]
        width, height = _resolve_dims(
            render, draft_cap=(128, 96), hq_default=(256, 256), hard_cap=512
        )
        argv = [
            node,
            str(script),
            "--world",
            str(world_path),
            "--width",
            str(width),
            "--height",
            str(height),
            "--output",
            str(png_path),
        ]
        runner = run_fn or _run
        proc = runner(argv, cwd=script.parent)
        if proc.returncode != 0 or not png_path.is_file():
            raise ExecuteError(
                f"rt4d world render failed ({proc.returncode}): "
                f"{proc.stderr[-2000:]}"
            )
        png_hash = sha256_bytes(png_path.read_bytes())
        return {
            "artifacts": [
                {
                    "role": "beauty-png",
                    "uri": str(png_path.as_posix()),
                    "sha256": png_hash,
                    "mediaType": "image/png",
                }
            ],
            "hashes": {
                "requestSha256": sha256_json(req),
                "worldSha256": sha256_json(world),
                "pngSha256": png_hash,
            },
            "mappedTo": "render-worlddocument-rt4d.mjs",
            "statusTag": "enforced",
        }

    # Fallback: scene-spec path is the enforced RT4D still surface
    if isinstance(req["payload"].get("sceneSpecification"), dict):
        result = execute_scene_spec(req, out_dir=out_dir, run_fn=run_fn)
        result["mappedTo"] = (
            "rt4d route → render-scene.mjs (SceneSpecification fallback)"
        )
        return result

    raise ExecuteError(
        "rt4d route requires payload.worldDocumentRt4d or sceneSpecification"
    )


def execute_route(
    req: dict[str, Any],
    *,
    out_dir: Path | None = None,
    run_fn: Callable[..., subprocess.CompletedProcess[str]] | None = None,
) -> dict[str, Any]:
    route = req["payload"]["route"]
    if route == "scene-spec":
        return execute_scene_spec(req, out_dir=out_dir, run_fn=run_fn)
    if route == "proton-raster":
        return execute_proton_raster(req, out_dir=out_dir, run_fn=run_fn)
    if route == "engine3d-world":
        return execute_engine3d_world(req, out_dir=out_dir, run_fn=run_fn)
    if route == "rt4d":
        return execute_rt4d(req, out_dir=out_dir, run_fn=run_fn)
    raise ExecuteError(f"unhandled route for execute: {route}")
