"""Tile-faithful Genblaze dispatch + FinalFrame merge tests."""

from __future__ import annotations

import struct
import zlib
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.config import Settings
from app.idac.domains.rendering.genblaze_tile_dispatch import (
    dispatch_tile_faithful,
    encode_rgba_png,
    merge_tile_pngs_into_final_frame,
    normalize_tile_bounds,
    refresh_tile_execution_evidence,
    should_tile_faithful_dispatch,
)


def _solid_tile_png(w: int, h: int, rgb: tuple[int, int, int]) -> bytes:
    rgba = bytes(rgb + (255,)) * (w * h)
    return encode_rgba_png(w, h, rgba)


def test_normalize_tile_bounds_from_atcm_tile():
    bounds = normalize_tile_bounds({"tile_id": 0, "x": 64, "y": 0, "width": 64, "height": 64})
    assert bounds == {"x": 64, "y": 0, "w": 64, "h": 64}


def test_should_tile_faithful_when_atcm_plan():
    rp = {
        "execution_mode": "full_frame_with_tile_evidence",
        "tiles": [{"x": 0, "y": 0, "width": 32, "height": 32}],
    }
    assert should_tile_faithful_dispatch(lane="engine3d_still", render_plan=rp)
    assert not should_tile_faithful_dispatch(lane="rt4d", render_plan=rp)


def test_merge_two_tiles_into_final_frame():
    left = _solid_tile_png(2, 2, (255, 0, 0))
    right = _solid_tile_png(2, 2, (0, 255, 0))
    merged, digest = merge_tile_pngs_into_final_frame(
        frame_width=4,
        frame_height=2,
        placements=[
            ({"x": 0, "y": 0, "w": 2, "h": 2}, left),
            ({"x": 2, "y": 0, "w": 2, "h": 2}, right),
        ],
    )
    assert len(digest) == 64
    assert merged[:8] == b"\x89PNG\r\n\x1a\n"


def test_dispatch_tile_faithful_loops_genblaze(monkeypatch):
    settings = Settings(planner_mode="heuristic", genblaze_base_url="http://127.0.0.1:8787")
    render_plan = {
        "execution_mode": "full_frame_with_tile_evidence",
        "frame": {"width": 4, "height": 2},
        "tiles": [
            {"tile_id": 0, "x": 0, "y": 0, "width": 2, "height": 2},
            {"tile_id": 1, "x": 2, "y": 0, "width": 2, "height": 2},
        ],
        "tile_execution_evidence": {"status": "partial"},
    }
    calls: list[dict] = []

    def fake_dispatch(_settings, target, client=None):
        calls.append(dict(target.payload))
        idx = len(calls) - 1
        return {"structure": {"run_id": f"00000000-0000-0000-0000-00000000000{idx}"}}

    png_by_run = {
        "00000000-0000-0000-0000-000000000000": _solid_tile_png(2, 2, (10, 10, 10)),
        "00000000-0000-0000-0000-000000000001": _solid_tile_png(2, 2, (20, 20, 20)),
    }

    class FakeClient:
        def get(self, url, timeout=None):
            run_id = url.rsplit("/", 1)[-1]
            resp = MagicMock()
            resp.content = png_by_run[run_id]
            resp.raise_for_status = MagicMock()
            return resp

        def close(self):
            pass

    with patch(
        "app.idac.domains.rendering.genblaze_tile_dispatch.dispatch_render",
        side_effect=fake_dispatch,
    ):
        result = dispatch_tile_faithful(
            settings,
            render_plan=render_plan,
            base_payload={"width": 4, "height": 2, "aov_depth": False},
            client=FakeClient(),
        )

    assert len(calls) == 2
    assert calls[0]["crop_region"] == {"x": 0, "y": 0, "w": 2, "h": 2}
    assert calls[1]["tile_index"] == 1
    final = result["structure"]["final_frame"]
    assert final["merge_strategy"] == "rgba_composite"
    assert final["composite_sha256"]
    tee = refresh_tile_execution_evidence(render_plan, result)
    assert tee["status"] == "enforced"
    assert tee["downstream_dispatch"] == "tile_faithful_http_loop"
