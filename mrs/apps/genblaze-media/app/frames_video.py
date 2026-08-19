"""Local frames-to-video backend: N seeded stills stitched with ffmpeg.

The "stitch" video path of the merged Genblaze Media server:
- generates ``frames_video_count`` local stills (RT4D deterministic Node render
  by default, or Lemonade SD-Turbo when ``GENBLAZE_FRAMES_SOURCE=lemonade``),
  each with a distinct deterministic seed, then
- assembles them into an H.264 MP4 with ffmpeg.

HONEST SCOPE:
    This is **not** a generative video model (no motion prediction, no Seedance,
    no Cosmos). Output is a sequence of independently-sampled stills played in
    order — a flipbook. Receipts carry provider id ``rt4d-local-frames`` (RT4D
    source) or ``lemonade-local-frames`` (SD-Turbo source) and a ``frames`` list
    so operators can never confuse it with cloud video.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import APP_DIR, Settings
from app.pipeline import (
    GenerationQualityError,
    _best_effort_delete_keys,
    _presign_preview,
    build_backend,
)
from app.preview_cache import put_preview

logger = logging.getLogger(__name__)

FRAMES_PROVIDER_ID = "lemonade-local-frames"
RT4D_FRAMES_PROVIDER_ID = "rt4d-local-frames"
RT4D_MODEL_ID = "mrs-renderer-core/rt4d"

DEFAULT_FRAMES = 12
DEFAULT_FPS = 6
DEFAULT_SIZE = "512x512"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _ffmpeg_path() -> str:
    explicit = (os.getenv("GENBLAZE_FFMPEG") or "").strip()
    if explicit:
        return explicit
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError(
        "ffmpeg not found on PATH for the local frames video backend. "
        "Install ffmpeg or set GENBLAZE_FFMPEG to its full path."
    )


@dataclass
class FramesVideoResult:
    run_id: str
    prompt: str
    model: str
    provider: str = FRAMES_PROVIDER_ID
    status: str = "ok"
    asset_key: str | None = None
    manifest_key: str | None = None
    asset_sha256: str | None = None
    preview_url: str | None = None
    created_at: str | None = None
    dry_run: bool = False
    modality: str = "video"
    detail: str | None = None
    quality: dict[str, Any] | None = None
    duration_seconds: float | None = None
    resolution: str | None = None
    cmm_id: str = "CMM-LocalFrames-v1.0"
    domain_id: str = "CH-GNMD-v1.0"
    # Every frame's provenance (provider, model, seed, sha256). Never invented.
    frames: list[dict[str, Any]] = field(default_factory=list)
    ffmpeg_cmd: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d.get("duration_seconds") is None:
            d.pop("duration_seconds", None)
        if d.get("resolution") is None:
            d.pop("resolution", None)
        if d.get("ffmpeg_cmd") is None:
            d.pop("ffmpeg_cmd", None)
        return d


def _generate_one_frame(settings: Settings, prompt: str, seed: int) -> tuple[bytes, dict[str, Any]]:
    """One seeded local still. Returns (png_bytes, provenance).

    Dispatches to the configured ``frames_video_source``:
    - "rt4d" — deterministic Node render-still (same prompt+seed → identical
      PNG). Works on hosts where Lemonade's sd-server binary cannot start.
    - "lemonade" — local SD-Turbo via Lemonade's OpenAI-compatible API.
    """
    source = getattr(settings, "frames_video_source", "rt4d") or "rt4d"
    if source == "lemonade":
        from app.lemonade_provider import _call_lemonade

        png, prov = _call_lemonade(settings, prompt, seed=seed)
        prov["seed"] = int(seed)
        return png, prov

    from app.rt4d_provider import RT4D_MODEL_ID, RT4D_PROVIDER_ID, _run_render_cli
    from app.render_quality import resolve_still_render_params

    params = resolve_still_render_params(settings)
    out_png = Path(tempfile.mkdtemp(prefix="genblaze-frame-")) / "frame.png"
    try:
        provenance = _run_render_cli(settings, prompt, seed, out_png, params)
        if not out_png.is_file():
            raise GenerationQualityError("RT4D frame render produced no output file")
        png = out_png.read_bytes()
    finally:
        shutil.rmtree(out_png.parent, ignore_errors=True)

    if not png:
        raise GenerationQualityError("RT4D frame render produced empty bytes")
    prov = {
        "provider": RT4D_PROVIDER_ID,
        "model": RT4D_MODEL_ID,
        "seed": int(seed),
        "render": provenance,
        "note": (
            "Deterministic RT4D frame; NOT diffusion / not a generative model. "
            "Same prompt+seed → identical PNG."
        ),
    }
    return png, prov


def _write_frames(work_dir: Path, frames: list[bytes]) -> list[Path]:
    """Write PNG bytes to frame_%04d.png for ffmpeg pattern input."""
    paths: list[Path] = []
    for idx, data in enumerate(frames):
        if not data:
            raise GenerationQualityError(f"frame {idx} produced empty bytes")
        path = work_dir / f"frame_{idx:04d}.png"
        path.write_bytes(data)
        paths.append(path)
    return paths


def _stitch_mp4(work_dir: Path, frame_paths: list[Path], fps: int) -> bytes:
    """ffmpeg: image sequence -> H.264 MP4 (yuv420p for browser playback)."""
    ffmpeg = _ffmpeg_path()
    pattern = work_dir / "frame_%04d.png"
    out_path = work_dir / "stitch.mp4"
    cmd = [
        ffmpeg,
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(pattern),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    logger.info("frames stitch cmd=%s frames=%d fps=%d", " ".join(cmd), len(frame_paths), fps)
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900, check=False)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-600:]
        raise GenerationQualityError(f"ffmpeg stitch failed: {tail}")
    if not out_path.is_file() or out_path.stat().st_size == 0:
        raise GenerationQualityError("ffmpeg produced an empty mp4")
    return out_path.read_bytes()


def _assess_mp4(data: bytes) -> dict[str, Any]:
    ok = False
    reason = "empty"
    fmt = None
    if data and len(data) >= 8:
        if data[4:8] == b"ftyp":
            ok = True
            fmt = "mp4"
            reason = "ok"
        elif len(data) > 1024:
            ok = True
            fmt = "unknown"
            reason = "ok-opaque"
        else:
            reason = "unrecognized or too small for a video asset"
    return {
        "ok": ok,
        "byte_len": len(data) if data else 0,
        "format": fmt,
        "reason": reason,
    }


def generate_frames_video(
    settings: Settings,
    prompt: str,
    *,
    frames: int | None = None,
    fps: int | None = None,
    base_seed: int | None = None,
) -> FramesVideoResult:
    """Generate a local flipbook video from seeded stills.

    Never invents timing or motion claims: ``duration_seconds`` is derived from
    ``frames / fps`` (frame timing the operator asked for), and the detail line
    explicitly labels the output a flipbook of local stills.
    """
    cleaned = (prompt or "").strip()
    if not cleaned:
        raise ValueError("prompt is required")
    source = getattr(settings, "frames_video_source", "rt4d") or "rt4d"
    if getattr(settings, "skip_local_sd", False) and source == "lemonade":
        raise RuntimeError(
            "GENBLAZE_SKIP_LOCAL_SD=1: local Lemonade/SD disabled on this host. "
            "Unset the flag or set GENBLAZE_FRAMES_SOURCE=rt4d to use the local "
            "frames video backend."
        )

    count = int(frames or getattr(settings, "frames_video_count", None) or DEFAULT_FRAMES)
    count = max(2, min(120, count))
    rate = int(fps or getattr(settings, "frames_video_fps", None) or DEFAULT_FPS)
    rate = max(1, min(60, rate))
    base = int(base_seed if base_seed is not None else getattr(settings, "frames_video_seed", None) or 1337)

    run_id = str(uuid.uuid4())
    created_at = _utc_now()
    provider_id = FRAMES_PROVIDER_ID if source == "lemonade" else RT4D_FRAMES_PROVIDER_ID
    model = getattr(settings, "lemonade_model", None) or "SD-Turbo" if source == "lemonade" else RT4D_MODEL_ID
    size = getattr(settings, "lemonade_size", None) or DEFAULT_SIZE
    detail = (
        "CMM-LocalFrames-v1.0 flipbook: independent local stills played in order "
        "(not a generative video model)."
    )

    work_dir = Path(tempfile.mkdtemp(prefix="genblaze-frames-"))
    frame_entries: list[dict[str, Any]] = []
    raw_frames: list[bytes] = []
    try:
        for i in range(count):
            seed = base + i
            png, prov = _generate_one_frame(settings, cleaned, seed)
            raw_frames.append(png)
            frame_entries.append(
                {
                    "frame": i,
                    "seed": seed,
                    "provider": prov.get("provider"),
                    "model": prov.get("model"),
                    "sha256": hashlib.sha256(png).hexdigest(),
                    "size": size,
                }
            )
            logger.info("frames gen %d/%d seed=%d bytes=%d", i + 1, count, seed, len(png))

        frame_paths = _write_frames(work_dir, raw_frames)
        mp4 = _stitch_mp4(work_dir, frame_paths, rate)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    assessment = _assess_mp4(mp4)
    if not assessment["ok"]:
        raise GenerationQualityError(assessment.get("reason") or "frames stitch unusable")

    asset_key = f"{settings.storage_prefix}/local-frames/{run_id}/clip.mp4"
    manifest_key = f"{settings.storage_prefix}/local-frames/{run_id}/manifest.json"
    sha256 = hashlib.sha256(mp4).hexdigest()
    duration = count / rate

    manifest = {
        "schema": "mrs-genblaze-media-video-local-frames",
        "cmm_id": "CMM-LocalFrames-v1.0",
        "domain_id": "CH-GNMD-v1.0",
        "run_id": run_id,
        "prompt": cleaned,
        "model": model,
        "provider": provider_id,
        "modality": "video",
        "asset_sha256": sha256,
        "frames": count,
        "fps": rate,
        "base_seed": base,
        "duration_seconds": duration,
        "size": size,
        "frame_provenance": frame_entries,
        "frame_source": source,
        "replay_class": "provider-contract",
        "created_at": created_at,
        "lineage": "new-work-no-story-forge",
        "temporal_layers": "flipbook-stills-not-motion",
    }

    preview_url: str | None = None
    if settings.b2_configured:
        backend = build_backend(settings)
        try:
            backend.put(asset_key, mp4, content_type="video/mp4")
            backend.put(
                manifest_key,
                json.dumps(manifest, indent=2).encode("utf-8"),
                content_type="application/json",
            )
            preview_url = _presign_preview(backend, settings, asset_key, None)
        finally:
            close = getattr(backend, "close", None)
            if callable(close):
                close()

    gen = FramesVideoResult(
        run_id=run_id,
        prompt=cleaned,
        model=model,
        provider=provider_id,
        status="ok",
        asset_key=asset_key if settings.b2_configured else None,
        manifest_key=manifest_key if settings.b2_configured else None,
        asset_sha256=sha256,
        preview_url=preview_url,
        created_at=created_at,
        dry_run=False,
        modality="video",
        detail=detail,
        quality=assessment,
        duration_seconds=duration,
        resolution=size,
        cmm_id="CMM-LocalFrames-v1.0",
        frames=frame_entries,
    )
    # Local preview cache so the UI serves the mp4 without B2 download.
    put_preview(APP_DIR, run_id, mp4)
    return gen
