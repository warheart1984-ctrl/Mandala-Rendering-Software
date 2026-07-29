"""Staged tile execution evidence — planning metadata only (no Genblaze per-tile shade)."""

from __future__ import annotations

from typing import Any


def build_staged_tile_execution_evidence(
    *,
    tiles: list[dict[str, Any]],
    frame: dict[str, Any],
) -> dict[str, Any]:
    """Subdivide RenderPlan tiles into sequential execution records without downstream ROI API."""
    staged: list[dict[str, Any]] = []
    for index, tile in enumerate(tiles):
        staged.append(
            {
                "sequence_index": index,
                "tile_id": tile.get("id") or f"tile-{index}",
                "bounds": {
                    "x": tile.get("x"),
                    "y": tile.get("y"),
                    "w": tile.get("w"),
                    "h": tile.get("h"),
                },
                "complexity_C": tile.get("complexity") or tile.get("C"),
                "dispatch": {
                    "status": "api_available",
                    "endpoint": "/api/engine3d-tile-still",
                    "method": "POST",
                    "payload_fields": ["crop_region", "width", "height", "tile_index"],
                    "note": "Full-frame render then ROI crop — not GPU tile-only shader",
                },
            },
        )
    return {
        "kind": "StagedTileExecutionEvidence",
        "status": "partial",
        "enforcement": "partial",
        "frame": {"width": frame.get("width"), "height": frame.get("height")},
        "tile_count": len(staged),
        "downstream_dispatch": "single_full_frame_only",
        "staged_tiles": staged,
    }
