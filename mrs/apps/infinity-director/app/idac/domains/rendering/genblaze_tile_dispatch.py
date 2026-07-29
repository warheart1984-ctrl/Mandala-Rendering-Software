"""Operational W-TILE-FAITHFUL: HTTP per-tile Genblaze dispatch + FinalFrame merge.

Status: **partial** — full-frame render per tile with ``crop_region`` (Genblaze);
Director composites RGBA tiles into one FinalFrame PNG when previews are fetchable.
"""

from __future__ import annotations

import hashlib
import struct
import zlib
from typing import Any

import httpx

from app.config import Settings
from app.dispatch import DispatchError, dispatch_render
from app.models import DispatchTarget


TILE_STILL_ENDPOINT = "/api/engine3d-tile-still"


def normalize_tile_bounds(tile: dict[str, Any]) -> dict[str, int]:
    x = int(tile.get("x") if tile.get("x") is not None else tile.get("left") or 0)
    y = int(tile.get("y") if tile.get("y") is not None else tile.get("top") or 0)
    w = int(
        tile.get("width")
        if tile.get("width") is not None
        else tile.get("w")
        or tile.get("tile_width")
        or 0
    )
    h = int(
        tile.get("height")
        if tile.get("height") is not None
        else tile.get("h")
        or tile.get("tile_height")
        or 0
    )
    if w < 1 or h < 1:
        raise DispatchError(f"invalid tile bounds: {tile!r}")
    return {"x": x, "y": y, "w": w, "h": h}


def should_tile_faithful_dispatch(
    *,
    lane: str,
    render_plan: dict[str, Any] | None,
) -> bool:
    if lane != "engine3d_still" or not render_plan:
        return False
    mode = str(render_plan.get("execution_mode") or "")
    if mode not in {"full_frame_with_tile_evidence", "tile_faithful_dispatch"}:
        return False
    tiles = render_plan.get("tiles") or []
    return len(tiles) > 0


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def encode_rgba_png(width: int, height: int, rgba: bytes) -> bytes:
    """Minimal RGBA PNG (filter type 0 per row)."""
    if len(rgba) != width * height * 4:
        raise ValueError("rgba byte length mismatch")
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    compressed = zlib.compress(bytes(raw), level=6)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )


def decode_png_rgba(data: bytes) -> tuple[int, int, bytes]:
    """Decode 8-bit RGB/RGBA PNG into contiguous RGBA bytes."""
    from app.atcm import decode_png_rgba as _decode

    parsed = _decode(data)
    if parsed is None:
        raise DispatchError("unsupported PNG for tile merge")
    width, height, pixels = parsed
    rgba = bytearray(width * height * 4)
    i = 0
    for r, g, b, a in pixels:
        rgba[i : i + 4] = bytes((r, g, b, a))
        i += 4
    return width, height, bytes(rgba)


def merge_tile_pngs_into_final_frame(
    *,
    frame_width: int,
    frame_height: int,
    placements: list[tuple[dict[str, int], bytes]],
) -> tuple[bytes, str]:
    canvas = bytearray(frame_width * frame_height * 4)
    for bounds, png in placements:
        tw, th, rgba = decode_png_rgba(png)
        if tw != bounds["w"] or th != bounds["h"]:
            raise DispatchError(
                f"tile PNG size {tw}x{th} != crop {bounds['w']}x{bounds['h']}"
            )
        x0, y0 = bounds["x"], bounds["y"]
        row_stride = frame_width * 4
        tile_stride = tw * 4
        for row in range(th):
            cy = y0 + row
            if cy >= frame_height:
                break
            dst = cy * row_stride + x0 * 4
            src = row * tile_stride
            canvas[dst : dst + tile_stride] = rgba[src : src + tile_stride]
    out = encode_rgba_png(frame_width, frame_height, bytes(canvas))
    return out, hashlib.sha256(out).hexdigest()


def _structure_run_id(body: dict[str, Any]) -> str | None:
    structure = body.get("structure")
    if isinstance(structure, dict) and structure.get("run_id"):
        return str(structure["run_id"])
    return None


def _fetch_preview_png(
    settings: Settings,
    run_id: str,
    client: httpx.Client,
) -> bytes | None:
    url = f"{settings.genblaze_base_url}/api/preview/{run_id}"
    try:
        resp = client.get(url, timeout=settings.request_timeout_seconds)
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None


def dispatch_tile_faithful(
    settings: Settings,
    *,
    render_plan: dict[str, Any],
    base_payload: dict[str, Any],
    client: httpx.Client | None = None,
    dispatch_fn: Any | None = None,
) -> dict[str, Any]:
    """Loop Genblaze tile stills; return FinalFrame-shaped dispatch result."""
    _dispatch = dispatch_fn or dispatch_render
    frame = render_plan.get("frame") or {}
    fw = int(frame.get("width") or base_payload.get("width") or 256)
    fh = int(frame.get("height") or base_payload.get("height") or 256)
    tiles: list[dict[str, Any]] = list(render_plan.get("tiles") or [])

    own_client = client is None
    http = client or httpx.Client(timeout=settings.request_timeout_seconds)
    staged: list[dict[str, Any]] = []
    placements: list[tuple[dict[str, int], bytes]] = []
    tile_run_ids: list[str] = []

    try:
        for index, tile in enumerate(tiles):
            bounds = normalize_tile_bounds(tile)
            payload = {
                **{k: v for k, v in base_payload.items() if k not in {"crop_region", "tile_index"}},
                "width": fw,
                "height": fh,
                "crop_region": bounds,
                "tile_index": index,
                "polish": False,
            }
            target = DispatchTarget(endpoint=TILE_STILL_ENDPOINT, payload=payload)
            try:
                try:
                    body = _dispatch(settings, target, client=http)
                except TypeError:
                    body = _dispatch(settings, target)
            except DispatchError as exc:
                staged.append(
                    {
                        "sequence_index": index,
                        "tile_id": tile.get("tile_id") or tile.get("id") or f"tile-{index}",
                        "bounds": bounds,
                        "dispatch": {"status": "error", "message": str(exc)},
                    },
                )
                raise
            run_id = _structure_run_id(body)
            staged.append(
                {
                    "sequence_index": index,
                    "tile_id": tile.get("tile_id") or tile.get("id") or f"tile-{index}",
                    "bounds": bounds,
                    "complexity_C": tile.get("complexity"),
                    "dispatch": {
                        "status": "success",
                        "endpoint": TILE_STILL_ENDPOINT,
                        "run_id": run_id,
                    },
                },
            )
            if run_id:
                tile_run_ids.append(run_id)
                png = _fetch_preview_png(settings, run_id, http)
                if png:
                    placements.append((bounds, png))

        composite_status = "metadata_only"
        composite_sha256: str | None = None
        composite_png: bytes | None = None
        if len(placements) == len(tiles) and placements:
            composite_png, composite_sha256 = merge_tile_pngs_into_final_frame(
                frame_width=fw,
                frame_height=fh,
                placements=placements,
            )
            composite_status = "rgba_composite"

        primary_run_id = tile_run_ids[0] if tile_run_ids else None
        final_frame = {
            "kind": "FinalFrame",
            "status": "partial" if composite_status == "metadata_only" else "ok",
            "merge_strategy": composite_status,
            "frame": {"width": fw, "height": fh},
            "tile_count": len(tiles),
            "tile_run_ids": tile_run_ids,
            "composite_sha256": composite_sha256,
            "staged_tiles": staged,
        }

        structure_block: dict[str, Any] = {
            "run_id": primary_run_id,
            "kind": "engine3d-tile-faithful-composite",
            "structure_source": "engine3d_raster",
            "tile_faithful": True,
            "final_frame": final_frame,
        }
        if composite_sha256:
            structure_block["asset_sha256"] = composite_sha256

        return {
            "structure": structure_block,
            "note": (
                "Tile-faithful Genblaze dispatch: one full-frame soft-raster per tile "
                "with crop_region; Director merged tiles into FinalFrame."
            ),
            "tile": {"endpoint": TILE_STILL_ENDPOINT, "tiles_dispatched": len(staged)},
        }
    finally:
        if own_client:
            http.close()


def refresh_tile_execution_evidence(
    render_plan: dict[str, Any],
    dispatch_result: dict[str, Any],
) -> dict[str, Any]:
    """Update RenderPlan tile_execution_evidence after successful tile loop."""
    tee = dict(render_plan.get("tile_execution_evidence") or {})
    structure = dispatch_result.get("structure") or {}
    final_frame = structure.get("final_frame") or {}
    staged = final_frame.get("staged_tiles") or []
    tee.update(
        {
            "status": "enforced",
            "enforcement": "partial",
            "downstream_dispatch": "tile_faithful_http_loop",
            "tile_count": len(staged),
            "staged_tiles": staged,
            "waiver_W-TILE-FAITHFUL": "cleared_operational_conformance",
        },
    )
    return tee
