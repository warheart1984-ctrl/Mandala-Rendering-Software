#!/usr/bin/env python3
"""Clean-checkout demo: Intent → structure/cel plate → ffmpeg → evidence pack.

Reliable path does **not** require Unreal Engine. UE AnimeStylizer is an optional
declared/partial leg documented in the evidence README.

Usage (from repo root)::

  python scripts/hackathon-governed-anime-demo.py
  python scripts/hackathon-governed-anime-demo.py --frames 24 --out tmp/hackathon-governed-anime-demo

Status: **partial** — offline-deterministic plates + provenance; ffmpeg when present;
live Genblaze /api/anime optional via --call-api.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import struct
import subprocess
import sys
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

REPO = Path(__file__).resolve().parents[1]
GENBLAZE_APP = REPO / "mrs" / "apps" / "genblaze-media"
PROFILE = REPO / "schemas" / "anime" / "examples" / "mandala-cel-v1.example.json"
EVIDENCE_DOCS = REPO / "docs" / "ops" / "hackathon-evidence" / "governed-anime-pipeline"
DEFAULT_OUT = REPO / "tmp" / "hackathon-governed-anime-demo"

# Palette stops from AnimePalette_Morning (matches AnimeStylizer LUT generator)
_PALETTE = [
    (0.05, 0.02, 0.08),
    (0.15, 0.08, 0.12),
    (0.35, 0.15, 0.10),
    (0.65, 0.35, 0.15),
    (0.95, 0.65, 0.25),
    (1.00, 0.85, 0.45),
]


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _lerp(a: float, b: float, t: float) -> float:
    return a * (1.0 - t) + b * t


def _sample_palette(t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    seg = t * (len(_PALETTE) - 1)
    i = min(int(seg), len(_PALETTE) - 2)
    a = seg - i
    c1, c2 = _PALETTE[i], _PALETTE[i + 1]
    r = _lerp(c1[0], c2[0], a)
    g = _lerp(c1[1], c2[1], a)
    b = _lerp(c1[2], c2[2], a)
    return (
        max(0, min(255, int(round(r * 255)))),
        max(0, min(255, int(round(g * 255)))),
        max(0, min(255, int(round(b * 255)))),
    )


def _write_png_rgba(path: Path, width: int, height: int, rgba: bytes) -> None:
    try:
        from PIL import Image  # type: ignore

        Image.frombytes("RGBA", (width, height), rgba).save(path)
        return
    except ImportError:
        pass

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    )


def _cel_frame(width: int, height: int, frame: int, total: int) -> bytes:
    """Deterministic structure/cel plate — offline, no UE / no diffusion."""
    phase = (2.0 * math.pi * frame) / max(1, total)
    pixels = bytearray()
    cx, cy = width / 2.0, height / 2.0
    for y in range(height):
        for x in range(width):
            dx = (x - cx) / max(1.0, cx)
            dy = (y - cy) / max(1.0, cy)
            r = math.sqrt(dx * dx + dy * dy)
            ang = math.atan2(dy, dx) + phase
            # Mandala-ish rings + angular lobes (structure cue)
            ring = abs(math.sin(r * 8.0 - phase * 2.0))
            lobe = 0.5 + 0.5 * math.sin(ang * 6.0)
            lum = max(0.0, min(1.0, 0.25 + 0.55 * ring * lobe + 0.15 * (1.0 - r)))
            # 3-band cel posterize (AnimeWorldProfile shadow_steps-ish)
            band = math.floor(lum * 3.0) / 3.0
            pr, pg, pb = _sample_palette(band)
            # Soft ink edge near outer radius
            edge = 1.0 if r < 0.92 else max(0.0, 1.0 - (r - 0.92) * 12.0)
            pixels.extend(
                (
                    int(pr * edge),
                    int(pg * edge),
                    int(pb * edge),
                    255,
                )
            )
    return bytes(pixels)


def _load_profile() -> dict:
    data = json.loads(PROFILE.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"bad profile: {PROFILE}")
    return data


def _try_ffmpeg(frames_dir: Path, out_mp4: Path, fps: int) -> dict:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return {
            "status": "skipped",
            "reason": "ffmpeg not on PATH",
            "capability": "declared",
        }
    pattern = str(frames_dir / "frame_%04d.png")
    cmd = [
        ffmpeg,
        "-y",
        "-framerate",
        str(fps),
        "-i",
        pattern,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        str(out_mp4),
    ]
    t0 = time.perf_counter()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.perf_counter() - t0
    if proc.returncode != 0:
        return {
            "status": "fail",
            "reason": (proc.stderr or proc.stdout or "ffmpeg failed")[:800],
            "capability": "partial",
            "elapsed_seconds": round(elapsed, 3),
            "command": cmd,
        }
    data = out_mp4.read_bytes()
    return {
        "status": "ok",
        "capability": "partial",
        "path": str(out_mp4).replace("\\", "/"),
        "sha256": _sha256(data),
        "bytes": len(data),
        "elapsed_seconds": round(elapsed, 3),
        "command": cmd,
    }


def _write_run_receipt(out: Path, manifest: dict, provenance: dict, replay: dict) -> Path:
    """Write a concise judge/operator receipt for the generated demo folder."""
    lines = [
        "# Governed Anime Demo — Run Receipt",
        "",
        "| Field | Value |",
        "| --- | --- |",
        f"| Status | **{manifest.get('status', 'partial')}** |",
        f"| Story | {manifest.get('story')} |",
        f"| Created at | {manifest.get('created_at')} |",
        f"| End-to-end time | {manifest.get('timing', {}).get('end_to_end_seconds')} seconds |",
        f"| Frames | {replay.get('frame_count')} @ {replay.get('fps')} fps |",
        f"| AnimeWorldProfile | `{provenance.get('anime_world_profile_id')}` |",
        f"| Projection method | `{provenance.get('projection_method')}` |",
        f"| Structure plate SHA-256 | `{provenance.get('structure_plate_sha256')}` |",
        f"| MP4 SHA-256 | `{replay.get('anime_demo_mp4_sha256')}` |",
        "",
        "## Pipeline",
        "",
        "```text",
        "Intent → Genblaze /api/anime handoff → deterministic structure/cel plates",
        "      → ffmpeg H.264 export → provenance → replay metadata",
        "```",
        "",
        "## Honest capability status",
        "",
        "| Capability | Status |",
        "| --- | --- |",
        "| Genblaze `/api/anime` handoff | partial |",
        "| Offline deterministic structure/cel plate | partial |",
        "| ffmpeg H.264 export | "
        f"{manifest.get('ffmpeg', {}).get('capability', 'declared')} / {manifest.get('ffmpeg', {}).get('status')} |",
        "| UE AnimeStylizer | skeleton / partial; optional consumer leg |",
        "| UE compile | unknown unless operator runs UE 5.3+ locally |",
        "| CKL replay enforcement | declared; this folder records replay hashes |",
        "",
        "## Re-run",
        "",
        "```bash",
        "python scripts/hackathon-governed-anime-demo.py --frames "
        f"{replay.get('frame_count')} --fps {replay.get('fps')} "
        "--out tmp/hackathon-governed-anime-demo",
        "```",
        "",
        "## Key files",
        "",
        "- `anime_demo.mp4` — generated video when ffmpeg is present",
        "- `structure_plate.png` — first deterministic structure/cel plate",
        "- `api_anime_handoff.json` — Genblaze → UE handoff shape",
        "- `provenance.json` — profile/projection/hash provenance",
        "- `replay_metadata.json` — frame hashes for replay comparison",
        "- `manifest.json` — full machine-readable run summary",
    ]
    receipt = out / "RUN_RECEIPT.md"
    receipt.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return receipt


def _bundle_evidence(out: Path) -> dict:
    """Create a compact zip with judge-facing artifacts, excluding raw frames."""
    bundle = out / "governed-anime-demo-evidence.zip"
    include = [
        "anime_demo.mp4",
        "structure_plate.png",
        "api_anime_handoff.json",
        "provenance.json",
        "replay_metadata.json",
        "manifest.json",
        "RUN_RECEIPT.md",
    ]
    with ZipFile(bundle, "w", compression=ZIP_DEFLATED) as zf:
        for rel in include:
            path = out / rel
            if path.exists():
                zf.write(path, rel)
    return {
        "path": str(bundle).replace("\\", "/"),
        "sha256": _sha256(bundle.read_bytes()),
        "bytes": bundle.stat().st_size,
        "contents": [rel for rel in include if (out / rel).exists()],
    }


def _call_api(base_url: str, projection_method: str) -> dict | None:
    try:
        import urllib.request

        body = json.dumps(
            {
                "dry_run": True,
                "projection_method": projection_method,
                "prompt": "hackathon governed anime demo",
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            base_url.rstrip("/") + "/api/anime",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {"status": "unavailable", "error": str(exc)}


def _handoff_local(projection_method: str) -> dict:
    sys.path.insert(0, str(GENBLAZE_APP))
    from app.anime_ue_handoff import build_anime_ue_handoff

    return build_anime_ue_handoff(
        projection_method=projection_method,
        anime_world_profile_path=PROFILE,
        prompt="hackathon governed anime demo",
        dry_run=True,
    )


def assemble(out: Path, frames: int, fps: int, width: int, height: int, call_api: str | None) -> dict:
    t0 = time.perf_counter()
    out.mkdir(parents=True, exist_ok=True)
    frames_dir = out / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DOCS.mkdir(parents=True, exist_ok=True)

    # Repeated demo runs must not inherit stale hashes from an interrupted run.
    # Keep the cleanup scoped to known generated artifacts inside the explicit
    # output directory; do not delete arbitrary operator files.
    for old_frame in frames_dir.glob("frame_*.png"):
        old_frame.unlink()
    for rel in [
        "structure_plate.png",
        "anime_demo.mp4",
        "api_anime_handoff.json",
        "api_anime_live.json",
        "provenance.json",
        "replay_metadata.json",
        "manifest.json",
        "RUN_RECEIPT.md",
        "governed-anime-demo-evidence.zip",
    ]:
        old_artifact = out / rel
        if old_artifact.exists():
            old_artifact.unlink()

    profile = _load_profile()
    profile_id = str(profile.get("profileId"))
    projection_method = "projector4d-sot"

    frame_meta = []
    for i in range(frames):
        rgba = _cel_frame(width, height, i, frames)
        path = frames_dir / f"frame_{i:04d}.png"
        _write_png_rgba(path, width, height, rgba)
        raw = path.read_bytes()
        frame_meta.append(
            {
                "index": i,
                "path": str(path.relative_to(out)).replace("\\", "/"),
                "sha256": _sha256(raw),
                "bytes": len(raw),
            }
        )

    # Structure plate = first frame (handoff for UE LoadStructurePlate)
    structure_src = frames_dir / "frame_0000.png"
    structure_dst = out / "structure_plate.png"
    shutil.copy2(structure_src, structure_dst)
    structure_sha = _sha256(structure_dst.read_bytes())

    handoff = _handoff_local(projection_method)
    handoff["structure"] = {
        "path": "structure_plate.png",
        "asset_sha256": structure_sha,
        "width": width,
        "height": height,
        "source": "offline-deterministic-cel",
    }
    handoff["provenance"]["asset_sha256"] = structure_sha
    (out / "api_anime_handoff.json").write_text(json.dumps(handoff, indent=2) + "\n", encoding="utf-8")

    api_payload = None
    if call_api:
        api_payload = _call_api(call_api, projection_method)
        (out / "api_anime_live.json").write_text(
            json.dumps(api_payload, indent=2) + "\n", encoding="utf-8"
        )

    ffmpeg_result = _try_ffmpeg(frames_dir, out / "anime_demo.mp4", fps)

    elapsed = round(time.perf_counter() - t0, 3)
    timing = {
        "status": "timed",
        "end_to_end_seconds": elapsed,
        "note": "Local offline assemble time (not UE; not live Genblaze render).",
    }

    provenance = {
        "schema": "schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json",
        "intentId": f"hackathon-governed-anime-{datetime.now(timezone.utc).strftime('%Y%m%d')}",
        "worldId": "world.hackathon-governed-anime.demo",
        "timelineId": "timeline.hackathon-governed-anime.demo",
        "anime_world_profile_id": profile_id,
        "anime_world_profile_path": str(PROFILE.relative_to(REPO)).replace("\\", "/"),
        "projection_method": projection_method,
        "projector_id": "projector4d-sot",
        "lane": "anime-structure",
        "print_sot_touched": False,
        "digital_printer_touched": False,
        "structure_plate_sha256": structure_sha,
        "contract": "docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md",
        "created_at": _utc(),
        "capability_tags": {
            "genblaze_api_anime": "partial",
            "structure_plate_offline": "partial",
            "ue_anime_stylizer": "skeleton/partial",
            "ffmpeg_export": ffmpeg_result.get("capability", "declared"),
            "replay": "declared",
        },
    }
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")

    replay = {
        "status": "declared",
        "note": (
            "ReplayService conformance exists in MRS engine; this demo records "
            "deterministic frame hashes for operator replay, not CKL-enforced play."
        ),
        "fps": fps,
        "frame_count": frames,
        "frame_sha256": [f["sha256"] for f in frame_meta],
        "structure_plate_sha256": structure_sha,
        "anime_demo_mp4_sha256": ffmpeg_result.get("sha256"),
    }
    (out / "replay_metadata.json").write_text(json.dumps(replay, indent=2) + "\n", encoding="utf-8")

    artifact_list = {
        "structure_plate.png": structure_sha,
        "api_anime_handoff.json": _sha256((out / "api_anime_handoff.json").read_bytes()),
        "provenance.json": _sha256((out / "provenance.json").read_bytes()),
        "replay_metadata.json": _sha256((out / "replay_metadata.json").read_bytes()),
        "frames/": f"{frames} png files",
    }
    if ffmpeg_result.get("status") == "ok":
        artifact_list["anime_demo.mp4"] = ffmpeg_result["sha256"]

    manifest = {
        "title": "Governed Creative Anime Pipeline — Hackathon Demo Evidence",
        "status": "partial",
        "story": "Intent → Genblaze /api/anime → structure plate → (optional UE) → ffmpeg → Evidence → Replay",
        "set_to_render": {
            "genblaze_structure_ffmpeg": True,
            "full_ue_anime_stylizer": False,
            "note": (
                "Yes for offline/Genblaze structure→ffmpeg path. "
                "No for full UE AnimeStylizer (skeleton/partial; compile unknown)."
            ),
        },
        "created_at": _utc(),
        "timing": timing,
        "ffmpeg": ffmpeg_result,
        "artifacts": artifact_list,
        "frames": frame_meta,
        "api_live": api_payload,
        "profile_id": profile_id,
        "projection_method": projection_method,
        "ue_optional_leg": {
            "path": "unreal/AnimeStylizer/",
            "status": "skeleton/partial",
            "readiness": "unreal/AnimeStylizer/HACKATHON_READINESS.md",
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    receipt = _write_run_receipt(out, manifest, provenance, replay)
    bundle = _bundle_evidence(out)
    manifest["run_receipt"] = {
        "path": str(receipt).replace("\\", "/"),
        "sha256": _sha256(receipt.read_bytes()),
    }
    manifest["evidence_bundle"] = bundle
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Sync small evidence into docs/ (no large binaries — hashes + README pointers)
    docs_manifest = {
        **{k: manifest[k] for k in (
            "title", "status", "story", "set_to_render", "created_at",
            "timing", "profile_id", "projection_method", "ue_optional_leg",
        )},
        "ffmpeg_status": ffmpeg_result.get("status"),
        "ffmpeg_sha256": ffmpeg_result.get("sha256"),
        "structure_plate_sha256": structure_sha,
        "local_demo_dir": (
            str(out.relative_to(REPO)).replace("\\", "/")
            if str(out.resolve()).startswith(str(REPO.resolve()))
            else str(out)
        ),
        "demo_command": (
            "python scripts/hackathon-governed-anime-demo.py "
            f"--frames {frames} --out tmp/hackathon-governed-anime-demo"
        ),
        "run_receipt_sha256": manifest["run_receipt"]["sha256"],
        "evidence_bundle_sha256": bundle["sha256"],
        "evidence_bundle_contents": bundle["contents"],
    }
    (EVIDENCE_DOCS / "LAST_RUN_MANIFEST.json").write_text(
        json.dumps(docs_manifest, indent=2) + "\n", encoding="utf-8"
    )
    shutil.copy2(out / "provenance.json", EVIDENCE_DOCS / "provenance.example.json")
    shutil.copy2(out / "replay_metadata.json", EVIDENCE_DOCS / "replay_metadata.example.json")
    shutil.copy2(out / "api_anime_handoff.json", EVIDENCE_DOCS / "api_anime_handoff.example.json")
    shutil.copy2(out / "RUN_RECEIPT.md", EVIDENCE_DOCS / "RUN_RECEIPT.example.md")

    print(f"Demo evidence -> {out}")
    print(f"  structure_plate.png  sha256={structure_sha[:16]}...")
    print(f"  frames               {frames}")
    print(f"  ffmpeg               {ffmpeg_result.get('status')}")
    print(f"  end-to-end           {elapsed}s")
    print(f"  evidence zip         {bundle['path']}")
    print(f"  docs sync            {EVIDENCE_DOCS.relative_to(REPO)}")
    return manifest


def main() -> int:
    p = argparse.ArgumentParser(description="Hackathon governed-anime demo assembler")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--frames", type=int, default=24)
    p.add_argument("--fps", type=int, default=12)
    p.add_argument("--width", type=int, default=256)
    p.add_argument("--height", type=int, default=256)
    p.add_argument(
        "--call-api",
        default=None,
        help="Optional Genblaze base URL (e.g. http://127.0.0.1:8787) for live /api/anime dry_run",
    )
    args = p.parse_args()
    if not PROFILE.is_file():
        print(f"Missing AnimeWorldProfile: {PROFILE}", file=sys.stderr)
        return 1
    assemble(
        out=args.out.resolve(),
        frames=args.frames,
        fps=args.fps,
        width=args.width,
        height=args.height,
        call_api=args.call_api,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
