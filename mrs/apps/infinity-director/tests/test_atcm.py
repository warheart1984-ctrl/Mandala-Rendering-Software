"""ATCM unit tests — work model + tile planning (no Genblaze required)."""

from __future__ import annotations

import struct
import zlib

from app.atcm import make_tiles, plan_atcm, prompt_complexity_cues


def _png_rgba(width: int, height: int, fill=(40, 40, 40, 255), stripe=False) -> bytes:
    """Write a minimal filter-0 RGBA PNG."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter None
        for x in range(width):
            if stripe and (x + y) % 7 == 0:
                raw.extend((220, 40, 40, 255))
            else:
                raw.extend(fill)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def test_make_tiles_covers_frame():
    tiles = make_tiles(256, 256, 64)
    assert len(tiles) == 16
    assert sum(t.width * t.height for t in tiles) == 256 * 256


def test_prompt_cues_dense_vs_simple():
    dense = prompt_complexity_cues("tesseract lattice with glass caustics")
    simple = prompt_complexity_cues("empty sky wall flat warmup")
    assert dense > simple


def test_plan_atcm_estimates_work_reduction_for_simple_prompt():
    plan = plan_atcm(width=256, height=256, prompt="empty sky wall flat structure", tile_size=64)
    assert plan["algorithm"] == "ATCM"
    assert plan["print_sot"] is False
    assert plan["work_model"]["label"] == "estimate_not_measured"
    assert plan["work_model"]["estimated_speedup"] >= 1.0
    assert plan["suggested_speed_profile"] in {"fast", "beauty"}
    assert len(plan["tiles"]) == 16


def test_plan_atcm_with_png_prepass():
    png = _png_rgba(64, 64, fill=(30, 30, 30, 255), stripe=True)
    plan = plan_atcm(
        width=256,
        height=256,
        prompt="soft structure",
        tile_size=64,
        prepass_png=png,
    )
    assert plan["prepass"]["used_image"] is True
    assert plan["work_model"]["tile_count"] == 16


def test_direct_atcm_profile(monkeypatch):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import app
    from app.models import MemoryboardHints

    settings = Settings(
        genblaze_base_url="https://genblaze.example.test",
        planner_mode="heuristic",
        default_quality="draft",
        default_engine3d_width=256,
        default_engine3d_height=256,
        default_prompt_to_scene_width=256,
        default_prompt_to_scene_height=192,
        default_prompt_to_scene_samples=2,
        default_prompt_to_scene_max_depth=3,
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.read_memoryboard", lambda *_a, **_k: MemoryboardHints())

    def _dispatch(_settings, target):
        return {
            "structure": {
                "run_id": "atcm-1",
                "preview_url": "/preview/atcm-1",
                "provider": "engine3d-still",
            }
        }

    monkeypatch.setattr("app.main.dispatch_render", _dispatch)
    client = TestClient(app)
    response = client.post(
        "/api/direct",
        json={"prompt": "empty sky wall flat mesh", "speed_profile": "atcm"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["atcm"] is not None
    assert body["atcm"]["algorithm"] == "ATCM"
    assert body["atcm"]["work_model"]["label"] == "estimate_not_measured"
    assert body["render_plan"] is not None
    assert body["render_plan"]["accelerator"] == "ATCM"
    assert body["complexity_evidence"] is not None
    assert body["lane"] == "engine3d_still"
