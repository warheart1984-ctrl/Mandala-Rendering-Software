"""Tests for draft/final render quality presets (hackathon fast path)."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.config import Settings, scene_spec_default_script_path
from app.main import app
from app.render_quality import (
    DRAFT_HEIGHT,
    DRAFT_MAX_DEPTH,
    DRAFT_SAMPLES,
    DRAFT_WIDTH,
    apply_quality_to_output,
    normalize_quality,
    quality_presets,
    resolve_quality,
)
from app.scene_spec_provider import render_scene_spec


def _settings(**overrides) -> Settings:
    base = dict(
        nvidia_api_key=None,
        fal_api_key=None,
        b2_key_id=None,
        b2_app_key=None,
        b2_bucket="test-bucket",
        b2_region="us-east-005",
        b2_endpoint="https://s3.us-east-005.backblazeb2.com",
        storage_prefix="genblaze-media",
        image_model="black-forest-labs/flux.1-schnell",
        video_model="nvidia/cosmos-1.0-7b-diffusion-text2world",
        video_enabled=False,
        video_backend="nvidia",
        seedance_model="bytedance/seedance-2.0/text-to-video",
        seedance_resolution="720p",
        seedance_duration="5",
        seedance_aspect_ratio="16:9",
        seedance_generate_audio=True,
        seedance_watermark=False,
        embed_model="nvidia/nv-embedcode-7b-v1",
        embed_url="https://integrate.api.nvidia.com/v1/embeddings",
        embed_timeout_seconds=60.0,
        store_full_embeddings=True,
        presign_expires_seconds=3600,
        dry_run=False,
        b2_probe_on_health=False,
        abstract_retry_on_blank=True,
        empty_504_retry=False,
        empty_504_retry_delay_seconds=45.0,
        nvidia_warmup_on_startup=False,
        dotenv_loaded=(),
        image_backend="nvidia",
        image_fallback_to_rt4d=False,
        rt4d_node_path="node",
        rt4d_script_path=None,
        scene_spec_script_path=str(scene_spec_default_script_path()),
        rt4d_width=448,
        rt4d_height=448,
        rt4d_samples=20,
        rt4d_max_depth=5,
        rt4d_timeout_seconds=120.0,
        render_quality_default="draft",
        rt4d_draft_width=DRAFT_WIDTH,
        rt4d_draft_height=DRAFT_HEIGHT,
        rt4d_draft_samples=DRAFT_SAMPLES,
        rt4d_draft_max_depth=DRAFT_MAX_DEPTH,
    )
    base.update(overrides)
    return Settings(**base)


def _nonblank_png_bytes(width: int = 64, height: int = 48) -> bytes:
    try:
        from PIL import Image
        import io

        im = Image.new("RGB", (width, height), (40, 120, 200))
        for x in range(10, min(40, width)):
            for y in range(10, min(30, height)):
                im.putpixel((x, y), (220, 180, 40))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        return bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
            "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
        )


HEAVY_SPEC = {
    "schemaVersion": "1.0",
    "kind": "SceneSpecification",
    "id": "heavy",
    "entities": [
        {
            "id": "tess",
            "geometry": {"kind": "surface", "surfaceId": "tesseract"},
        }
    ],
    "output": {"width": 448, "height": 448, "samples": 20, "maxDepth": 5, "seed": 9},
}


@pytest.fixture(autouse=True)
def _isolate_preview_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))


def test_normalize_quality_aliases():
    assert normalize_quality("fast") == "draft"
    assert normalize_quality("DRAFT") == "draft"
    assert normalize_quality("high") == "final"
    assert normalize_quality("final") == "final"
    assert normalize_quality("nope") == "draft"
    assert normalize_quality(None) == "draft"


def test_default_quality_is_draft():
    settings = _settings()
    assert resolve_quality(settings) == "draft"
    assert resolve_quality(settings, None) == "draft"
    assert settings.render_quality_default == "draft"


def test_draft_clamp_overwrites_heavy_spec():
    settings = _settings()
    out, applied = apply_quality_to_output(HEAVY_SPEC, settings, "draft")
    assert applied == {
        "width": DRAFT_WIDTH,
        "height": DRAFT_HEIGHT,
        "samples": DRAFT_SAMPLES,
        "maxDepth": DRAFT_MAX_DEPTH,
    }
    assert out["output"]["width"] == DRAFT_WIDTH
    assert out["output"]["samples"] == DRAFT_SAMPLES
    assert out["output"]["maxDepth"] == DRAFT_MAX_DEPTH
    # Seed and other fields preserved.
    assert out["output"]["seed"] == 9
    assert out["id"] == "heavy"


def test_draft_preserves_smaller_explicit_values():
    settings = _settings()
    spec = {
        **HEAVY_SPEC,
        "output": {"width": 128, "height": 96, "samples": 2, "maxDepth": 2, "seed": 1},
    }
    _, applied = apply_quality_to_output(spec, settings, "draft")
    assert applied == {
        "width": 128,
        "height": 96,
        "samples": 2,
        "maxDepth": 2,
    }


def test_final_preserves_higher_settings_within_profile():
    settings = _settings()
    out, applied = apply_quality_to_output(HEAVY_SPEC, settings, "final")
    # Explicit heavy values are kept (final does not overwrite).
    assert out["output"]["width"] == 448
    assert out["output"]["samples"] == 20
    assert out["output"]["maxDepth"] == 5
    assert applied["samples"] == 20


def test_final_fills_missing_from_rt4d_profile():
    settings = _settings()
    sparse = {
        "schemaVersion": "1.0",
        "kind": "SceneSpecification",
        "id": "sparse",
        "entities": [
            {"id": "t", "geometry": {"kind": "surface", "surfaceId": "tesseract"}}
        ],
        "output": {"seed": 3},
    }
    _, applied = apply_quality_to_output(sparse, settings, "final")
    assert applied == {
        "width": 448,
        "height": 448,
        "samples": 20,
        "maxDepth": 5,
    }


def test_quality_presets_expose_draft_and_final():
    presets = quality_presets(_settings())
    assert presets["draft"]["width"] == DRAFT_WIDTH
    assert presets["draft"]["samples"] == DRAFT_SAMPLES
    assert presets["final"]["width"] == 448
    assert presets["final"]["samples"] == 20


def test_cli_writes_clamped_spec_json(tmp_path, monkeypatch):
    """_run_scene_cli must write the draft-clamped spec, not the original 448/20."""
    written: dict = {}

    def fake_run(argv, **kwargs):
        spec_path = Path(argv[argv.index("--spec") + 1])
        written["spec"] = json.loads(spec_path.read_text(encoding="utf-8"))
        out_path = Path(argv[argv.index("--output") + 1])
        png = _nonblank_png_bytes()
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-scene-spec-4d-render",
                    "specHash": "abc",
                    "seed": 9,
                    "sha256": hashlib.sha256(png).hexdigest(),
                }
            )
            + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.scene_spec_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(scene_spec_script_path=str(script))

    result = render_scene_spec(settings, HEAVY_SPEC, quality="draft")
    assert written["spec"]["output"]["width"] == DRAFT_WIDTH
    assert written["spec"]["output"]["samples"] == DRAFT_SAMPLES
    assert written["spec"]["output"]["maxDepth"] == DRAFT_MAX_DEPTH
    assert result.provenance["quality"] == "draft"
    assert result.provenance["output"]["samples"] == DRAFT_SAMPLES


def test_api_render_scene_default_quality_is_draft(tmp_path, monkeypatch):
    written: dict = {}

    def fake_run(argv, **kwargs):
        spec_path = Path(argv[argv.index("--spec") + 1])
        written["spec"] = json.loads(spec_path.read_text(encoding="utf-8"))
        out_path = Path(argv[argv.index("--output") + 1])
        png = _nonblank_png_bytes()
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-scene-spec-4d-render",
                    "specHash": "abc",
                    "seed": 9,
                    "sha256": hashlib.sha256(png).hexdigest(),
                }
            )
            + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.scene_spec_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(scene_spec_script_path=str(script)),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    # Omit quality → server default draft must clamp.
    resp = client.post("/api/render-scene", json={"spec": HEAVY_SPEC})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provenance"]["quality"] == "draft"
    assert written["spec"]["output"]["samples"] == DRAFT_SAMPLES


def test_api_render_scene_final_keeps_heavy(tmp_path, monkeypatch):
    written: dict = {}

    def fake_run(argv, **kwargs):
        spec_path = Path(argv[argv.index("--spec") + 1])
        written["spec"] = json.loads(spec_path.read_text(encoding="utf-8"))
        out_path = Path(argv[argv.index("--output") + 1])
        png = _nonblank_png_bytes()
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-scene-spec-4d-render",
                    "specHash": "abc",
                    "seed": 9,
                    "sha256": hashlib.sha256(png).hexdigest(),
                }
            )
            + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.scene_spec_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(scene_spec_script_path=str(script)),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.post(
        "/api/render-scene",
        json={"spec": HEAVY_SPEC, "quality": "final"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["provenance"]["quality"] == "final"
    assert written["spec"]["output"]["samples"] == 20
    assert written["spec"]["output"]["width"] == 448


def test_health_exposes_quality_presets(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    body = client.get("/health").json()
    scene = body["scene_spec"]
    assert scene["quality_default"] == "draft"
    assert scene["quality_presets"]["draft"]["samples"] == DRAFT_SAMPLES
    assert scene["quality_presets"]["final"]["samples"] == 20
    assert "draft" in body["scene_spec_note"].lower()
