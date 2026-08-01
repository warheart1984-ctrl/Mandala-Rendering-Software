"""B2-backed pre-render: structure fallback + 24h schedule spread.

Two B2 lanes (both under ``GENBLAZE_STORAGE_PREFIX``):

* ``{prefix}/pre-render/`` — structure still + schedule/manifest (failover when
  Fal / HF Space / GMI fail).
* ``{prefix}/demo-cache/{shot}/fNNNN/`` — beauty/demo shot frames (existing).

**24h spread (honest):** ``spawn_24h_spread_pipeline`` writes a schedule of
``shots_per_hour * 24`` due timestamps (default 96 @ 4/hour) and uploads the
structure once. Operators (or cron) call ``--run-due`` to generate only slots
whose ``due_at`` has passed — the process does **not** need 24h uptime / sleep.
Optional ``--execute-window`` still sleeps between gens for a single long run.

Usage::

  python -m app.pre_render --spawn --upload-b2
  python -m app.pre_render --run-due --upload-b2
  python -m app.pre_render --schedule-hint-only

Status: **partial** — schedule + B2 layout + failover labels are tested;
live GMI/fal/hfspace gens need credentials/credits.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.anime_world_profile import default_example_path
from app.config import get_settings
from app.demo_cache import (
    SOURCE_B2_STRUCTURE,
    SOURCE_LIVE_GENERATE,
    SOURCE_STRUCTURE_ONLY,
    build_frame_provenance,
    cache_frame_key,
    claim_label,
    sha256_bytes,
    upload_frame_to_b2,
    write_local_sidecars,
)
from app.gmi_provider import (
    GmiError,
    GmiNotConfiguredError,
    generate_image_gmi,
    gmi_availability,
)
from app.provider_cascade import cascade_health

logger = logging.getLogger(__name__)

PRE_RENDER_KIND = "genblaze-pre-render-structure"
SCHEDULE_SCHEMA = "1.0"
DEFAULT_SHOTS_PER_HOUR = 4
DEFAULT_WINDOW_HOURS = 24.0


# ── B2 key helpers (pre-render lane) ─────────────────────────────────────────


def pre_render_prefix(storage_prefix: str) -> str:
    prefix = (storage_prefix or "genblaze-media").strip().strip("/")
    return f"{prefix}/pre-render"


def structure_asset_key(storage_prefix: str) -> str:
    return f"{pre_render_prefix(storage_prefix)}/structure.png"


def structure_manifest_key(storage_prefix: str) -> str:
    return f"{pre_render_prefix(storage_prefix)}/manifest.json"


def schedule_key(storage_prefix: str) -> str:
    return f"{pre_render_prefix(storage_prefix)}/schedule.json"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _parse_iso(ts: str) -> datetime:
    raw = (ts or "").strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    return datetime.fromisoformat(raw)


# ── Schedule builders ────────────────────────────────────────────────────────


def build_24h_schedule(
    *,
    shots_per_hour: int = DEFAULT_SHOTS_PER_HOUR,
    window_hours: float = DEFAULT_WINDOW_HOURS,
    start_at: datetime | None = None,
    shot_id: str = "mandala-open",
) -> dict[str, Any]:
    """Build a wall-clock schedule of ``shots_per_hour * window_hours`` slots.

    Interval = 3600 / shots_per_hour seconds (900s at 4/hour → 96 slots / 24h).
    """
    sph = max(1, int(shots_per_hour))
    hours = float(window_hours)
    if hours <= 0:
        raise ValueError("window_hours must be > 0")
    slot_count = int(sph * hours)
    interval_s = 3600.0 / float(sph)
    start = start_at or _utc_now()
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    slots: list[dict[str, Any]] = []
    for i in range(slot_count):
        due = start + timedelta(seconds=i * interval_s)
        slots.append(
            {
                "index": i,
                "due_at": due.isoformat(),
                "status": "pending",
                "shot_id": shot_id,
                "frame": i,
                "asset_key": None,
                "completed_at": None,
                "error": None,
            }
        )
    return {
        "schema_version": SCHEDULE_SCHEMA,
        "kind": "genblaze-pre-render-schedule",
        "shots_per_hour": sph,
        "window_hours": hours,
        "interval_seconds": interval_s,
        "slot_count": slot_count,
        "start_at": start.isoformat(),
        "created_at": _utc_now_iso(),
        "slots": slots,
    }


def schedule_hint(frame_count: int, window_hours: float = 24.0) -> dict[str, Any]:
    """Suggest sleep between frames to spread work across a wall-clock window."""
    if frame_count <= 0:
        return {"sleep_seconds": 0, "window_hours": window_hours, "frames": 0}
    total = window_hours * 3600.0
    sleep = total / frame_count if frame_count else 0
    return {
        "sleep_seconds": round(sleep, 1),
        "window_hours": window_hours,
        "frames": frame_count,
        "note": (
            f"Sleep ~{sleep:.0f}s between frames to spread {frame_count} gens "
            f"across {window_hours:g}h — prefer --spawn + --run-due over one "
            f"long sleep process."
        ),
    }


# ── Tiny PNG + frame-range helpers (demo-cache path) ─────────────────────────


def _tiny_png() -> bytes:
    """1×1 PNG placeholder for offline dry scheduling tests."""
    import struct
    import zlib

    def chunk(t: bytes, d: bytes) -> bytes:
        c = t + d
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(d)) + c + crc

    raw = b"\x00\xff\x00\x00\xff"
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def _parse_frame_range(spec: str) -> list[int]:
    """Parse ``0-23`` or ``0,1,2`` or ``5`` into frame indices."""
    spec = (spec or "").strip()
    if not spec:
        raise ValueError("empty frame spec")
    frames: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a), int(b)
            if end < start:
                raise ValueError(f"bad range {part}")
            frames.extend(range(start, end + 1))
        else:
            frames.append(int(part))
    return frames


def _load_plan(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("plan must be a JSON object")
    return data


# ── B2 I/O helpers ───────────────────────────────────────────────────────────


def _backend_put_bytes(settings: Any, key: str, data: bytes, content_type: str) -> None:
    from app.pipeline import build_backend

    backend = build_backend(settings)
    try:
        backend.put_bytes(key, data, content_type=content_type)
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()


def _backend_get_bytes(settings: Any, key: str) -> bytes | None:
    from app.pipeline import build_backend

    if not getattr(settings, "b2_configured", False):
        return None
    backend = build_backend(settings)
    try:
        get_bytes = getattr(backend, "get_bytes", None) or getattr(
            backend, "download_bytes", None
        )
        if get_bytes is not None:
            try:
                return get_bytes(key)
            except Exception as exc:  # noqa: BLE001
                logger.info("pre_render get miss %s: %s", key, exc)
                return None
        client = getattr(backend, "_client", None) or getattr(backend, "client", None)
        if client is None:
            return None
        try:
            obj = client.get_object(Bucket=settings.b2_bucket, Key=key)
            return obj["Body"].read()
        except Exception as exc:  # noqa: BLE001
            logger.info("pre_render get miss %s: %s", key, exc)
            return None
    finally:
        close = getattr(backend, "close", None)
        if callable(close):
            close()


# ── Structure render (structure-only constitutional pipeline) ────────────────


def _render_structure_only(
    *,
    settings: Any,
    structure_profile_path: str | Path | None,
    out_dir: Path,
    structure_png_override: bytes | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """Produce a structure still via constitutional pipeline (painter=none).

    Uses AnimeWorldProfile JSON (default ``mandala-cel-v1.example.json``), never
    the ``.py`` module path. When ``structure_png_override`` is set, skips Engine3D
    and writes those bytes as the structure plate.
    """
    from app.constitutional_anime_render import (
        PIPELINE_VERSION,
        build_arg_parser,
        run_pipeline,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    profile_path = (
        Path(structure_profile_path).resolve()
        if structure_profile_path
        else default_example_path()
    )
    if not profile_path.is_file():
        raise FileNotFoundError(
            f"AnimeWorldProfile JSON not found: {profile_path} "
            "(pass a schemas/anime/examples/*.json path, not a .py module)"
        )

    structure_arg: str | None = None
    if structure_png_override is not None:
        plate = out_dir / "_input_structure.png"
        plate.write_bytes(structure_png_override)
        structure_arg = str(plate)

    parser = build_arg_parser()
    argv = [
        "--out-dir",
        str(out_dir),
        "--profile",
        str(profile_path),
        "--painter",
        "none",
        "--no-cel-proxy",
    ]
    if structure_arg:
        argv.extend(["--structure", structure_arg, "--structure-source", "provided"])
    else:
        # Prefer continuity reuse; Engine3D only when operator opts in via env.
        argv.append("--no-reuse-continuity")
        # Without continuity / --structure / --run-engine3d, pipeline fails —
        # use a tiny deterministic plate so spawn works offline / in CI.
        plate = out_dir / "_input_structure.png"
        plate.write_bytes(_tiny_png())
        argv.extend(["--structure", str(plate), "--structure-source", "provided"])

    args = parser.parse_args(argv)
    manifest = run_pipeline(args)
    structure_path = out_dir / "structure.png"
    if not structure_path.is_file():
        raise RuntimeError("structure-only pipeline did not write structure.png")
    structure_bytes = structure_path.read_bytes()
    man_dict = (
        manifest.to_dict() if hasattr(manifest, "to_dict") else dict(manifest)  # type: ignore[arg-type]
    )
    man_dict["pipeline_version"] = getattr(manifest, "pipeline_version", PIPELINE_VERSION)
    return structure_bytes, man_dict


# ── Public API ───────────────────────────────────────────────────────────────


def spawn_24h_spread_pipeline(
    settings: Any,
    structure_profile_path: str | Path | None = None,
    shots_per_hour: int = DEFAULT_SHOTS_PER_HOUR,
    *,
    window_hours: float = DEFAULT_WINDOW_HOURS,
    shot_id: str = "mandala-open",
    out_dir: Path | None = None,
    upload_b2: bool = True,
    structure_png: bytes | None = None,
    prompt: str | None = None,
) -> dict[str, Any]:
    """Pre-render structure once + write a 24h schedule (``shots_per_hour * 24`` slots).

    Skips B2 upload when ``settings.b2_configured`` is false (returns
    ``status=skipped_b2`` with local artifacts). Does **not** sleep for 24h —
    use ``run_due_slots`` / ``--run-due`` to generate slots over the window.
    """
    created = _utc_now_iso()
    schedule = build_24h_schedule(
        shots_per_hour=shots_per_hour,
        window_hours=window_hours,
        shot_id=shot_id,
    )
    root = out_dir or Path(
        tempfile.mkdtemp(prefix="genblaze-pre-render-")
    )
    root = Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)

    structure_bytes, pipeline_manifest = _render_structure_only(
        settings=settings,
        structure_profile_path=structure_profile_path,
        out_dir=root / "structure-run",
        structure_png_override=structure_png,
    )
    digest = sha256_bytes(structure_bytes)
    asset_key = structure_asset_key(settings.storage_prefix)
    man_key = structure_manifest_key(settings.storage_prefix)
    sched_key = schedule_key(settings.storage_prefix)

    provenance = {
        "schema_version": "1.0",
        "kind": PRE_RENDER_KIND,
        "source": SOURCE_STRUCTURE_ONLY,
        "structure_sha256": digest,
        "created_at": created,
        "schedule": {
            "shots_per_hour": schedule["shots_per_hour"],
            "window_hours": schedule["window_hours"],
            "slot_count": schedule["slot_count"],
            "interval_seconds": schedule["interval_seconds"],
            "start_at": schedule["start_at"],
        },
        "intent_id": pipeline_manifest.get("intentId")
        or f"intent.pre-render.{shot_id}",
        "world_id": pipeline_manifest.get("worldId") or f"world:pre-render:{shot_id}",
        "timeline_id": pipeline_manifest.get("timelineId")
        or f"timeline:pre-render:{shot_id}",
        "anime_world_profile_id": pipeline_manifest.get("anime_world_profile_id"),
        "pipeline_version": pipeline_manifest.get("pipeline_version"),
        "asset_key": asset_key,
        "manifest_key": man_key,
        "schedule_key": sched_key,
        "prompt": prompt,
        "parameters": {
            "shot_id": shot_id,
            "shots_per_hour": shots_per_hour,
            "window_hours": window_hours,
            "lane": "structure-only",
        },
        "detail": (
            "Structure still pre-rendered once; beauty gens deferred to "
            "schedule/--run-due (demo-cache lane)."
        ),
        "demo_cache_relationship": (
            f"Shot frames live under {settings.storage_prefix}/demo-cache/; "
            f"this object is the structure failover under "
            f"{settings.storage_prefix}/pre-render/."
        ),
    }

    (root / "structure.png").write_bytes(structure_bytes)
    (root / "manifest.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True), encoding="utf-8"
    )
    (root / "schedule.json").write_text(
        json.dumps(schedule, indent=2), encoding="utf-8"
    )

    uploaded: dict[str, Any] | None = None
    status = "ok"
    if upload_b2:
        if not getattr(settings, "b2_configured", False):
            status = "skipped_b2"
            logger.warning(
                "B2 not configured — wrote local pre-render artifacts only under %s",
                root,
            )
        else:
            _backend_put_bytes(
                settings, asset_key, structure_bytes, "image/png"
            )
            _backend_put_bytes(
                settings,
                man_key,
                json.dumps(provenance, indent=2, sort_keys=True).encode("utf-8"),
                "application/json",
            )
            _backend_put_bytes(
                settings,
                sched_key,
                json.dumps(schedule, indent=2).encode("utf-8"),
                "application/json",
            )
            uploaded = {
                "structure_key": asset_key,
                "manifest_key": man_key,
                "schedule_key": sched_key,
                "structure_sha256": digest,
            }

    return {
        "status": status,
        "structure_sha256": digest,
        "created_at": created,
        "slot_count": schedule["slot_count"],
        "shots_per_hour": shots_per_hour,
        "window_hours": window_hours,
        "local_dir": str(root),
        "keys": uploaded
        or {
            "structure_key": asset_key,
            "manifest_key": man_key,
            "schedule_key": sched_key,
        },
        "schedule": schedule,
        "provenance": provenance,
        "spread_mode": "schedule+run-due",
        "note": (
            "24h spread = schedule file with due_at slots; call --run-due "
            "(cron/tick) to generate pending due slots. Not a single 24h sleep."
        ),
    }


async def spawn_24h_pre_render(
    settings: Any,
    structure_profile_path: str | Path | None = None,
    shots_per_hour: int = DEFAULT_SHOTS_PER_HOUR,
    **kwargs: Any,
) -> dict[str, Any]:
    """Async wrapper around :func:`spawn_24h_spread_pipeline` (pipeline is sync)."""
    return await asyncio.to_thread(
        spawn_24h_spread_pipeline,
        settings,
        structure_profile_path,
        shots_per_hour,
        **kwargs,
    )


# Alias matching the user's sketch name
spawn_24h_spread = spawn_24h_spread_pipeline


def load_cached_structure_if_available(
    settings: Any,
) -> tuple[bytes | None, str]:
    """Load ``{prefix}/pre-render/structure.png`` from B2.

    Returns ``(bytes, reason)`` on hit, or ``(None, reason)`` on miss / skip.
    """
    if not getattr(settings, "b2_configured", False):
        return None, "b2_not_configured"
    key = structure_asset_key(settings.storage_prefix)
    data = _backend_get_bytes(settings, key)
    if not data:
        return None, f"miss:{key}"
    man_raw = _backend_get_bytes(settings, structure_manifest_key(settings.storage_prefix))
    if man_raw:
        try:
            man = json.loads(man_raw.decode("utf-8"))
            expected = man.get("structure_sha256") or man.get("asset_sha256")
            if expected and expected != sha256_bytes(data):
                return None, f"sha_mismatch:{key}"
        except Exception:  # noqa: BLE001
            pass
    return data, f"hit:{key}"


def run_live_polish(
    settings: Any,
    prompt: str,
    structure_png: bytes,
    *,
    structure_profile_path: str | Path | None = None,
    allow_cel_proxy: bool = True,
    painter_pref: str = "auto",
) -> dict[str, Any]:
    """Polish using the provided ``structure_png`` bytes (written to a temp plate).

    Order (auto): fal → hfspace → gmicloud → lemonade → cel-proxy.
    """
    from app.anime_world_profile import load_anime_world_profile, validate_anime_world_profile
    from app.constitutional_anime_render import (
        BACKEND_NONE,
        LANE_STRUCTURE_ONLY,
        probe_painters,
        run_beauty_stage,
    )

    if not structure_png:
        raise ValueError("structure_png bytes required for run_live_polish")

    profile_path = (
        Path(structure_profile_path).resolve()
        if structure_profile_path
        else default_example_path()
    )
    profile = load_anime_world_profile(profile_path)
    issues = validate_anime_world_profile(profile)

    # Ensure bytes are on disk for any painter that needs a path later;
    # beauty stage itself takes bytes — write for provenance/debug.
    with tempfile.TemporaryDirectory(prefix="genblaze-live-polish-") as tmp:
        plate = Path(tmp) / "structure.png"
        plate.write_bytes(structure_png)
        probes = {p.backend: p for p in probe_painters(live=painter_pref != "none")}
        beauty_bytes, lane, backend, anime_claim, detail = run_beauty_stage(
            structure_png=structure_png,
            profile=profile,
            painter_pref=painter_pref,
            allow_cel_proxy=allow_cel_proxy,
            probe_map=probes,
            profile_issues=issues,
        )
        # Prompt is recorded; beauty stage builds its own steered prompt from
        # the profile. If operator prompt is non-empty, append to detail.
        if prompt and prompt.strip():
            detail = f"{detail} | operator_prompt_chars={len(prompt.strip())}"

        return {
            "status": "ok" if anime_claim else "structure-only",
            "source": SOURCE_LIVE_GENERATE if anime_claim else SOURCE_STRUCTURE_ONLY,
            "source_label": claim_label(
                SOURCE_LIVE_GENERATE if anime_claim else SOURCE_STRUCTURE_ONLY
            ),
            "lane": lane,
            "backend": backend,
            "anime_claim": anime_claim,
            "detail": detail,
            "image_bytes": beauty_bytes,
            "structure_sha256": sha256_bytes(structure_png),
            "beauty_sha256": sha256_bytes(beauty_bytes),
            "structure_path_used": str(plate),
            "polish_used_structure_bytes": True,
            "failed_closed": backend == BACKEND_NONE or lane == LANE_STRUCTURE_ONLY,
        }


def run_live_pipeline_with_b2_fallback(
    settings: Any,
    prompt: str,
    structure_png: bytes | None = None,
    *,
    structure_profile_path: str | Path | None = None,
    allow_cel_proxy: bool = True,
) -> dict[str, Any]:
    """Live polish first; on failure serve B2 ``pre-render/structure.png``.

    Cascade intent: fal → hfspace → gmicloud → cel-proxy, then B2 structure.
    """
    structure = structure_png
    structure_reason = "provided"
    if structure is None:
        structure, structure_reason = load_cached_structure_if_available(settings)
    if structure is None:
        # Last resort: tiny plate so polish can still attempt (or fail closed).
        structure = _tiny_png()
        structure_reason = "placeholder_tiny_png"

    try:
        result = run_live_polish(
            settings,
            prompt,
            structure,
            structure_profile_path=structure_profile_path,
            allow_cel_proxy=allow_cel_proxy,
            painter_pref="auto",
        )
    except Exception as exc:  # noqa: BLE001
        result = {
            "status": "error",
            "anime_claim": False,
            "failed_closed": True,
            "detail": f"live polish raised: {exc}",
            "image_bytes": None,
        }

    if result.get("anime_claim") and result.get("image_bytes"):
        result["fallback"] = None
        result["structure_source"] = structure_reason
        return result

    # Live painters failed → B2 structure failover
    cached, reason = load_cached_structure_if_available(settings)
    if cached is not None:
        return {
            "status": "ok",
            "source": SOURCE_B2_STRUCTURE,
            "source_label": claim_label(SOURCE_B2_STRUCTURE),
            "lane": "structure-only",
            "backend": "b2-pre-render",
            "anime_claim": False,
            "detail": (
                f"live painters failed ({result.get('detail')}); "
                f"served B2 structure ({reason})"
            ),
            "image_bytes": cached,
            "structure_sha256": sha256_bytes(cached),
            "beauty_sha256": sha256_bytes(cached),
            "fallback": "b2-structure-cache",
            "live_failure": result.get("detail"),
            "structure_source": reason,
        }

    # No B2 structure — return structure-only from local plate / failed polish
    pixels = result.get("image_bytes") or structure
    return {
        "status": "structure-only",
        "source": SOURCE_STRUCTURE_ONLY,
        "source_label": claim_label(SOURCE_STRUCTURE_ONLY),
        "lane": "structure-only",
        "backend": result.get("backend") or "none",
        "anime_claim": False,
        "detail": (
            f"live painters failed and B2 structure miss ({reason}); "
            f"live={result.get('detail')}"
        ),
        "image_bytes": pixels,
        "structure_sha256": sha256_bytes(structure),
        "beauty_sha256": sha256_bytes(pixels),
        "fallback": None,
        "structure_source": structure_reason,
    }


def load_schedule(
    settings: Any,
    *,
    local_path: Path | None = None,
) -> dict[str, Any] | None:
    """Load schedule JSON from local path or B2."""
    if local_path and local_path.is_file():
        return json.loads(local_path.read_text(encoding="utf-8"))
    raw = _backend_get_bytes(settings, schedule_key(settings.storage_prefix))
    if not raw:
        return None
    return json.loads(raw.decode("utf-8"))


def save_schedule(
    settings: Any,
    schedule: dict[str, Any],
    *,
    local_path: Path | None = None,
    upload_b2: bool = True,
) -> None:
    payload = json.dumps(schedule, indent=2).encode("utf-8")
    if local_path:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(payload)
    if upload_b2 and getattr(settings, "b2_configured", False):
        _backend_put_bytes(
            settings,
            schedule_key(settings.storage_prefix),
            payload,
            "application/json",
        )


def run_due_slots(
    settings: Any,
    *,
    prompt: str = "cel-shaded mandala oracle mask, anime look",
    out_root: Path | None = None,
    upload_b2: bool = True,
    allow_placeholder: bool = False,
    provider_preference: str = "auto",
    local_schedule: Path | None = None,
    now: datetime | None = None,
    max_slots: int | None = None,
) -> dict[str, Any]:
    """Generate demo-cache frames for schedule slots whose ``due_at`` <= now."""
    schedule = load_schedule(settings, local_path=local_schedule)
    if schedule is None:
        return {
            "status": "error",
            "error": (
                "No schedule found. Run --spawn first "
                f"(expected B2 key {schedule_key(settings.storage_prefix)})."
            ),
            "completed": 0,
        }

    clock = now or _utc_now()
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)

    out = Path(out_root or "tmp/genblaze-demo-cache").resolve()
    out.mkdir(parents=True, exist_ok=True)

    # Prefer structure from B2 for polish continuity (optional input).
    structure_bytes, _struct_reason = load_cached_structure_if_available(settings)

    completed: list[dict[str, Any]] = []
    skipped = 0
    for slot in schedule.get("slots") or []:
        if slot.get("status") == "done":
            skipped += 1
            continue
        due_at = _parse_iso(str(slot["due_at"]))
        if due_at > clock:
            continue
        if max_slots is not None and len(completed) >= max_slots:
            break

        shot_id = str(slot.get("shot_id") or "mandala-open")
        frame = int(slot.get("frame") if slot.get("frame") is not None else slot["index"])
        try:
            row = render_one_frame(
                settings,
                shot_id=shot_id,
                frame=frame,
                prompt=prompt,
                out_root=out,
                upload_b2=upload_b2,
                allow_placeholder=allow_placeholder,
                anime_world_profile_id=None,
                provider_preference=provider_preference,
                structure_png=structure_bytes,
            )
            slot["status"] = "done"
            slot["completed_at"] = _utc_now_iso()
            slot["asset_key"] = row.get("asset_key")
            slot["error"] = None
            completed.append(row)
        except Exception as exc:  # noqa: BLE001
            slot["status"] = "error"
            slot["error"] = str(exc)
            slot["completed_at"] = _utc_now_iso()
            logger.warning("run-due slot %s failed: %s", slot.get("index"), exc)

    save_schedule(
        settings,
        schedule,
        local_path=local_schedule or (out / "schedule.json"),
        upload_b2=upload_b2,
    )
    return {
        "status": "ok",
        "completed": len(completed),
        "skipped_done": skipped,
        "results": completed,
        "schedule_slot_count": schedule.get("slot_count"),
        "b2_demo_cache_prefix": f"{settings.storage_prefix}/demo-cache/",
        "b2_pre_render_prefix": f"{settings.storage_prefix}/pre-render/",
        "spread_mode": "schedule+run-due",
    }


# ── Existing demo-cache frame render (kept) ──────────────────────────────────


def render_one_frame(
    settings: Any,
    *,
    shot_id: str,
    frame: int,
    prompt: str,
    out_root: Path,
    upload_b2: bool,
    allow_placeholder: bool,
    anime_world_profile_id: str | None,
    provider_preference: str,
    structure_png: bytes | None = None,
) -> dict[str, Any]:
    """Generate one demo-cache frame, write sidecars, optional B2 upload.

    When ``structure_png`` is provided and GMI is unavailable, ``run_live_polish``
    may produce cel-proxy / structure-only pixels (honest labels).
    """
    image_bytes: bytes | None = None
    provider = "placeholder"
    model = None
    detail = None

    if provider_preference in ("gmi", "auto"):
        try:
            result = generate_image_gmi(settings, prompt)
            image_bytes = result.image_bytes
            provider = result.provider
            model = result.model
            detail = result.detail
        except (GmiNotConfiguredError, GmiError) as exc:
            logger.warning("GMI frame %s/%s failed: %s", shot_id, frame, exc)
            if provider_preference == "gmi" and not allow_placeholder and structure_png is None:
                raise

    if image_bytes is None and structure_png is not None:
        polished = run_live_polish(
            settings,
            prompt,
            structure_png,
            allow_cel_proxy=True,
            painter_pref="auto",
        )
        image_bytes = polished["image_bytes"]
        provider = str(polished.get("backend") or "polish")
        detail = polished.get("detail")

    if image_bytes is None:
        if not allow_placeholder:
            raise RuntimeError(
                "No image provider succeeded. Set GMI_API_KEY + install "
                "genblaze-gmicloud, provide B2 structure for polish fallback, "
                "or pass --allow-placeholder for dry layout tests."
            )
        image_bytes = _tiny_png()
        provider = "placeholder"
        detail = "placeholder PNG (not live beauty)"

    digest = sha256_bytes(image_bytes)
    prov = build_frame_provenance(
        source=SOURCE_LIVE_GENERATE,
        shot_id=shot_id,
        frame=frame,
        asset_sha256=digest,
        storage_prefix=settings.storage_prefix,
        provider=provider,
        model=model,
        prompt=prompt,
        anime_world_profile_id=anime_world_profile_id,
        detail=detail,
    )
    frame_dir = out_root / shot_id / f"f{frame:04d}"
    paths = write_local_sidecars(frame_dir, image_bytes, prov)
    uploaded: dict[str, Any] | None = None
    if upload_b2:
        uploaded = upload_frame_to_b2(settings, image_bytes, prov)

    return {
        "shot_id": shot_id,
        "frame": frame,
        "provider": provider,
        "model": model,
        "asset_sha256": digest,
        "local_render": str(paths["render"]),
        "local_manifest": str(paths["manifest"]),
        "b2": uploaded,
        "asset_key": cache_frame_key(settings.storage_prefix, shot_id, frame),
        "source": SOURCE_LIVE_GENERATE,
    }


def run_pre_render(args: argparse.Namespace) -> int:
    """Legacy demo-cache batch path (optional long sleep via --execute-window)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    settings = get_settings()
    skip_local = bool(getattr(args, "skip_local_sd", False)) or bool(
        getattr(settings, "skip_local_sd", False)
    )
    if skip_local:
        logger.info(
            "GENBLAZE_SKIP_LOCAL_SD / --skip-local-sd: local Lemonade/SD skipped; "
            "this CLI uses GMI (or --allow-placeholder). Prefer a GMI-credit host."
        )
    out_root = Path(args.out_dir).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    jobs: list[dict[str, Any]] = []
    if args.plan:
        plan = _load_plan(Path(args.plan))
        shot_id = plan.get("shot_id") or args.shot_id
        prompt = plan.get("prompt") or args.prompt
        frames = plan.get("frames")
        if isinstance(frames, str):
            frame_list = _parse_frame_range(frames)
        elif isinstance(frames, list):
            frame_list = [int(f) for f in frames]
        else:
            frame_list = _parse_frame_range(args.frames)
        anime_id = plan.get("anime_world_profile_id") or args.anime_world_profile_id
        for fr in frame_list:
            p = (
                plan.get("prompts", {}).get(str(fr), prompt)
                if isinstance(plan.get("prompts"), dict)
                else prompt
            )
            jobs.append(
                {
                    "shot_id": shot_id,
                    "frame": fr,
                    "prompt": p,
                    "anime_world_profile_id": anime_id,
                }
            )
    else:
        if not args.shot_id or not args.prompt:
            logger.error("--shot-id and --prompt required (or --plan)")
            return 2
        for fr in _parse_frame_range(args.frames):
            jobs.append(
                {
                    "shot_id": args.shot_id,
                    "frame": fr,
                    "prompt": args.prompt,
                    "anime_world_profile_id": args.anime_world_profile_id,
                }
            )

    hint = schedule_hint(len(jobs), window_hours=float(args.window_hours))
    sleep_s = (
        float(args.sleep_seconds)
        if args.sleep_seconds is not None
        else (hint["sleep_seconds"] if args.execute_window else 0.0)
    )
    if args.schedule_hint_only:
        print(
            json.dumps(
                {
                    "schedule": hint,
                    "jobs": len(jobs),
                    "cascade": cascade_health(settings),
                    "skip_local_sd": skip_local,
                    "gmi": gmi_availability(settings),
                    "preferred_spread": "schedule+run-due (--spawn / --run-due)",
                    "note": (
                        "No live GMI spend. Unit/CI path: pytest tests/test_demo_cache.py "
                        "+ tests/test_pre_render.py + this --schedule-hint-only flag."
                    ),
                },
                indent=2,
            )
        )
        return 0

    logger.info(
        "pre-render %d frames · sleep=%.1fs · upload_b2=%s · gmi=%s",
        len(jobs),
        sleep_s,
        args.upload_b2,
        gmi_availability(settings).get("available"),
    )
    results: list[dict[str, Any]] = []
    for i, job in enumerate(jobs):
        logger.info("frame %s/%s (%d/%d)", job["shot_id"], job["frame"], i + 1, len(jobs))
        row = render_one_frame(
            settings,
            shot_id=job["shot_id"],
            frame=int(job["frame"]),
            prompt=str(job["prompt"]),
            out_root=out_root,
            upload_b2=bool(args.upload_b2),
            allow_placeholder=bool(args.allow_placeholder),
            anime_world_profile_id=job.get("anime_world_profile_id"),
            provider_preference=args.provider,
        )
        results.append(row)
        if i + 1 < len(jobs) and sleep_s > 0:
            logger.info("sleeping %.1fs (execute-window batching)", sleep_s)
            time.sleep(sleep_s)

    summary = {
        "status": "ok",
        "frames": len(results),
        "schedule": hint,
        "sleep_seconds_used": sleep_s,
        "results": results,
        "b2_prefix": f"{settings.storage_prefix}/demo-cache/",
        "cascade": cascade_health(settings),
    }
    summary_path = out_root / "pre-render-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"summary": str(summary_path), "frames": len(results)}, indent=2))
    return 0


def spawn_24h_pre_render_cli(args: argparse.Namespace) -> int:
    """CLI handler for ``--spawn`` / ``--run-due`` (structure + schedule lane)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    settings = get_settings()

    if args.run_due:
        result = run_due_slots(
            settings,
            prompt=args.prompt
            or "cel-shaded mandala oracle mask, anime look",
            out_root=Path(args.out_dir),
            upload_b2=bool(args.upload_b2),
            allow_placeholder=bool(args.allow_placeholder),
            provider_preference=args.provider,
            local_schedule=Path(args.schedule_file) if args.schedule_file else None,
            max_slots=args.max_slots,
        )
        print(json.dumps({k: v for k, v in result.items() if k != "results"}, indent=2))
        if result.get("results"):
            print(
                json.dumps(
                    {"completed_keys": [r.get("asset_key") for r in result["results"]]},
                    indent=2,
                )
            )
        return 0 if result.get("status") == "ok" else 1

    # --spawn
    out = Path(args.out_dir).resolve()
    result = spawn_24h_spread_pipeline(
        settings,
        structure_profile_path=args.profile,
        shots_per_hour=int(args.shots_per_hour),
        window_hours=float(args.window_hours),
        shot_id=args.shot_id or "mandala-open",
        out_dir=out,
        upload_b2=bool(args.upload_b2),
        prompt=args.prompt,
    )
    print(
        json.dumps(
            {
                "status": result["status"],
                "structure_sha256": result["structure_sha256"],
                "slot_count": result["slot_count"],
                "keys": result["keys"],
                "local_dir": result["local_dir"],
                "spread_mode": result["spread_mode"],
                "note": result["note"],
            },
            indent=2,
        )
    )
    return 0 if result["status"] in {"ok", "skipped_b2"} else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "GenBlaze pre-render: B2 structure failover + 24h schedule "
            "(prefer --spawn / --run-due)"
        )
    )
    mode = p.add_mutually_exclusive_group()
    mode.add_argument(
        "--spawn",
        action="store_true",
        help="Structure-only once + write 24h schedule (schedule+run-due spread)",
    )
    mode.add_argument(
        "--run-due",
        action="store_true",
        help="Generate demo-cache frames for due schedule slots only",
    )
    p.add_argument("--plan", help="JSON shot plan path (legacy batch mode)")
    p.add_argument("--shot-id", help="Shot id (e.g. mandala-open)")
    p.add_argument("--frames", default="0", help="Frame range: 0-23 or 0,1,2")
    p.add_argument("--prompt", help="T2I / polish prompt")
    p.add_argument(
        "--profile",
        default=None,
        help="AnimeWorldProfile JSON path (default: mandala-cel-v1 example)",
    )
    p.add_argument(
        "--out-dir",
        default="../../../tmp/genblaze-demo-cache",
        help="Local output root",
    )
    p.add_argument("--upload-b2", action="store_true", help="Upload to B2")
    p.add_argument(
        "--shots-per-hour",
        type=int,
        default=DEFAULT_SHOTS_PER_HOUR,
        help="Schedule density (default 4 → 96 slots / 24h)",
    )
    p.add_argument(
        "--sleep-seconds",
        type=float,
        default=None,
        help="Sleep between frames when --execute-window (legacy)",
    )
    p.add_argument("--window-hours", type=float, default=24.0, help="Spread window")
    p.add_argument(
        "--execute-window",
        action="store_true",
        help=(
            "Legacy: sleep between batch frames in one process. "
            "Prefer --spawn + --run-due."
        ),
    )
    p.add_argument(
        "--schedule-hint-only",
        action="store_true",
        help="Print suggested sleep; do not generate",
    )
    p.add_argument(
        "--schedule-file",
        default=None,
        help="Local schedule.json path for --run-due (else B2)",
    )
    p.add_argument(
        "--max-slots",
        type=int,
        default=None,
        help="Cap due slots processed in one --run-due tick",
    )
    p.add_argument(
        "--allow-placeholder",
        action="store_true",
        help="Write tiny PNG when providers unavailable (layout/dry tests only)",
    )
    p.add_argument(
        "--provider",
        default="auto",
        choices=("auto", "gmi"),
        help="Image provider for demo-cache frame gens",
    )
    p.add_argument(
        "--skip-local-sd",
        action="store_true",
        help=(
            "Declare AMD/local-SD skip (same as GENBLAZE_SKIP_LOCAL_SD=1). "
            "This CLI never calls Lemonade; flag documents operator intent."
        ),
    )
    p.add_argument("--anime-world-profile-id", default=None)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.spawn or args.run_due:
            return spawn_24h_pre_render_cli(args)
        return run_pre_render(args)
    except Exception as exc:  # noqa: BLE001
        logger.error("%s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
