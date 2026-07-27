"""Tests for Engine3D still + composite (mocked CLI; no live fal)."""

from __future__ import annotations

import io
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.composite_still import (
    composite_provenance,
    composite_sha256,
    composite_subject_over_background,
)
from app.config import Settings
from app.engine3d_sequence_provider import (
    ENGINE3D_SEQUENCE_KIND,
    engine3d_sequence_availability,
)
from app.engine3d_still_provider import (
    ENGINE3D_STILL_KIND,
    Engine3dStillPathError,
    engine3d_still_availability,
    resolve_engine3d_cli_path,
)
from app.main import app
from app.pipeline import GenerateResult
from app.preview_cache import put_preview


def _tiny_png() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (32, 32), (40, 80, 120))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


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
        image_backend="rt4d",
        image_fallback_to_rt4d=False,
        rt4d_node_path="node",
        rt4d_script_path=None,
        scene_spec_script_path=None,
        rt4d_width=256,
        rt4d_height=256,
        rt4d_samples=6,
        rt4d_max_depth=5,
        rt4d_timeout_seconds=180.0,
        rt4d_allow_heavy=False,
        render_quality_default="draft",
        rt4d_draft_width=256,
        rt4d_draft_height=256,
        rt4d_draft_samples=4,
        rt4d_draft_max_depth=3,
        image_to_scene_model="meta/llama-3.2-11b-vision-instruct",
        image_to_scene_chat_url="https://integrate.api.nvidia.com/v1/chat/completions",
        image_to_scene_timeout_seconds=60.0,
        validate_scene_spec_script_path=None,
        flux_then_scene=False,
        polish_enabled=False,
        polish_model=None,
        polish_default_strength=0.45,
        polish_backend="auto",
        engine3d_still_enabled=True,
        engine3d_still_script_path=None,
        engine3d_still_timeout_seconds=60.0,
        engine3d_sequence_enabled=True,
        engine3d_sequence_script_path=None,
        engine3d_sequence_timeout_seconds=60.0,
        engine3d_sequence_max_frames=24,
        chatgpt_plugin_key=None,
        public_base_url=None,
        cors_allow_all=False,
    )
    base.update(overrides)
    return Settings(**base)


def test_composite_subject_over_background():
    from PIL import Image

    bg = Image.new("RGB", (64, 64), (10, 20, 80))
    sub = Image.new("RGB", (64, 64), (200, 150, 120))
    # Dark corner = clear heuristic
    for y in range(20):
        for x in range(20):
            sub.putpixel((x, y), (20, 20, 25))
    bbuf = io.BytesIO()
    sbuf = io.BytesIO()
    bg.save(bbuf, format="PNG")
    sub.save(sbuf, format="PNG")
    out = composite_subject_over_background(
        background_png=bbuf.getvalue(),
        subject_png=sbuf.getvalue(),
        target_size=(64, 64),
    )
    assert out[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(composite_sha256(out)) == 64
    # No-alpha heuristic: dark studio corner should reveal background blue channel.
    out_img = Image.open(io.BytesIO(out)).convert("RGB")
    corner = out_img.getpixel((5, 5))
    subject_px = out_img.getpixel((40, 40))
    assert corner[2] > 50  # background blue shows through clear region
    assert subject_px[0] > 150  # opaque subject skin remains
    prov = composite_provenance(
        structure_run_id="a",
        rt4d_background_run_id="b",
        composite_sha256_hex=composite_sha256(out),
        resized=True,
    )
    assert prov["structure_source"] == "engine3d_composite"


def test_composite_no_alpha_heuristic_vectorized_large():
    """Regression: no-alpha path must stay vectorized (no O(n) Python pixels at 256²)."""
    from PIL import Image

    size = 256
    bg = Image.new("RGB", (size, size), (10, 20, 80))
    sub = Image.new("RGB", (size, size), (20, 20, 25))  # all clear-ish
    for y in range(80, 180):
        for x in range(80, 180):
            sub.putpixel((x, y), (210, 160, 130))
    bbuf = io.BytesIO()
    sbuf = io.BytesIO()
    bg.save(bbuf, format="PNG")
    sub.save(sbuf, format="PNG")
    out = composite_subject_over_background(
        background_png=bbuf.getvalue(),
        subject_png=sbuf.getvalue(),
    )
    img = Image.open(io.BytesIO(out)).convert("RGB")
    assert img.getpixel((10, 10))[2] > 50
    assert img.getpixel((120, 120))[0] > 150


def test_engine3d_still_availability_shape():
    avail = engine3d_still_availability(_settings())
    assert "available" in avail
    assert "note" in avail
    assert "sphere-bridge" in avail["note"].lower() or "NOT RT4D" in avail["note"]


def test_resolve_engine3d_cli_path_rejects_traversal(tmp_path):
    """``../../etc/passwd`` style paths must not reach the Node CLI."""
    with pytest.raises(Engine3dStillPathError, match="\\.\\."):
        resolve_engine3d_cli_path(
            "../../etc/passwd",
            field="world_path",
            repo_root=tmp_path,
        )
    with pytest.raises(Engine3dStillPathError, match="allowlisted"):
        resolve_engine3d_cli_path(
            "/etc/passwd",
            field="human_glb",
            repo_root=tmp_path,
        )


def test_resolve_engine3d_cli_path_allows_fixture_and_operator(tmp_path, monkeypatch):
    assets = tmp_path / "mrs" / "assets" / "human"
    assets.mkdir(parents=True)
    fixture = assets / "HumanFaceRigged.glb"
    fixture.write_bytes(b"glTF")
    op_root = tmp_path / "operator-assets" / "human"
    op_root.mkdir(parents=True)
    op_glb = op_root / "HumanFaceRigged.glb"
    op_glb.write_bytes(b"glTF")

    resolved_fixture = resolve_engine3d_cli_path(
        "mrs/assets/human/HumanFaceRigged.glb",
        field="human_glb",
        repo_root=tmp_path,
    )
    assert resolved_fixture == str(fixture.resolve())

    resolved_op = resolve_engine3d_cli_path(
        str(op_glb),
        field="human_glb",
        repo_root=tmp_path,
    )
    assert resolved_op == str(op_glb.resolve())

    custom = tmp_path / "custom-op" / "human"
    custom.mkdir(parents=True)
    custom_glb = custom / "face.glb"
    custom_glb.write_bytes(b"glTF")
    monkeypatch.setenv("OPERATOR_ASSETS_ROOT", str(tmp_path / "custom-op"))
    resolved_custom = resolve_engine3d_cli_path(
        str(custom_glb),
        field="human_glb",
        repo_root=tmp_path,
    )
    assert resolved_custom == str(custom_glb.resolve())


def test_api_engine3d_still_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.post(
        "/api/engine3d-still",
        json={"world_path": "../../etc/passwd", "width": 64, "height": 64},
    )
    assert resp.status_code == 400
    assert ".." in resp.json()["detail"] or "allowlisted" in resp.json()["detail"]


def test_health_exposes_engine3d_still(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert "engine3d_still" in body
    assert isinstance(body["engine3d_still"], dict)


def test_api_engine3d_still_mocked(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    png = _tiny_png()

    def fake_gen(settings, **kwargs):
        run_id = "11111111-1111-1111-1111-111111111111"
        from app.config import APP_DIR

        put_preview(APP_DIR, run_id, png)
        return GenerateResult(
            run_id=run_id,
            prompt="engine3d-still:demo",
            model="mrs-engine3d-core/soft-raster",
            provider="engine3d-still",
            status="ok",
            asset_key=f"genblaze-media/engine3d-still/{run_id}/beauty.png",
            manifest_key=f"genblaze-media/engine3d-still/{run_id}/manifest.json",
            asset_sha256="a" * 64,
            preview_url=f"/api/preview/{run_id}",
            created_at="2026-01-01T00:00:00+00:00",
            dry_run=False,
            provenance={"kind": ENGINE3D_STILL_KIND, "structure_source": "engine3d_raster"},
        )

    monkeypatch.setattr("app.main.generate_engine3d_still", fake_gen)
    client = TestClient(app)
    resp = client.post("/api/engine3d-still", json={"width": 64, "height": 64})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "structure" in body
    assert body["structure"]["kind"] == ENGINE3D_STILL_KIND
    assert "sphere-bridge" in body["note"].lower() or "NOT RT4D" in body["note"]


def test_api_engine3d_still_polish_requires_prompt(tmp_path, monkeypatch):
    """Legacy name: empty prompt is now allowed (face/generic defaults apply)."""
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(polish_enabled=True, fal_api_key="fal-test"),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex
    from app.pipeline import GenerateResult
    from app.preview_cache import put_preview

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    png = _tiny_png()

    def fake_gen(settings, **kwargs):
        run_id = "11111111-1111-1111-1111-111111111111"
        from app.config import APP_DIR

        put_preview(APP_DIR, run_id, png)
        return GenerateResult(
            run_id=run_id,
            prompt="engine3d-still:demo",
            model="mrs-engine3d-core/soft-raster",
            provider="engine3d-still",
            status="ok",
            asset_key=f"genblaze-media/engine3d-still/{run_id}/beauty.png",
            manifest_key=f"genblaze-media/engine3d-still/{run_id}/manifest.json",
            asset_sha256="a" * 64,
            preview_url=f"/api/preview/{run_id}",
            created_at="2026-01-01T00:00:00+00:00",
            dry_run=False,
            provenance={
                "kind": ENGINE3D_STILL_KIND,
                "structure_source": "engine3d_raster",
                "structure_record": {"face_rig": True, "face_asset": "fixture"},
            },
        )

    def fake_polish(*_args, **_kwargs):
        return {
            "run_id": "33333333-3333-3333-3333-333333333333",
            "preview_url": "/api/preview/33333333-3333-3333-3333-333333333333",
            "model": "fal-ai/flux/dev/image-to-image",
            "provider": "fal",
            "asset_sha256": "c" * 64,
        }

    monkeypatch.setattr("app.main.generate_engine3d_still", fake_gen)
    monkeypatch.setattr("app.main._polish_pipeline", fake_polish)
    client = TestClient(app)
    resp = client.post("/api/engine3d-still", json={"polish": True, "width": 64, "height": 64})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "polish" in body
    assert body.get("face_polish", {}).get("face_rig") is True


def test_engine3d_sequence_availability_shape():
    avail = engine3d_sequence_availability(_settings())
    assert "available" in avail
    assert "max_frames" in avail


def test_health_exposes_engine3d_sequence(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert "engine3d_sequence" in resp.json()


def test_api_engine3d_sequence_mocked(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    png = _tiny_png()

    def fake_seq(settings, **kwargs):
        run_id = "22222222-2222-2222-2222-222222222222"
        from app.config import APP_DIR

        put_preview(APP_DIR, run_id, png)
        return GenerateResult(
            run_id=run_id,
            prompt="engine3d-sequence:demo-orbit",
            model="mrs-engine3d-core/soft-raster-sequence",
            provider="engine3d-sequence",
            status="ok",
            asset_key=f"genblaze-media/engine3d-sequence/{run_id}/frame_0000_final.png",
            manifest_key=f"genblaze-media/engine3d-sequence/{run_id}/sequence_record.json",
            asset_sha256="b" * 64,
            preview_url=f"/api/preview/{run_id}",
            created_at="2026-01-01T00:00:00+00:00",
            dry_run=False,
            provenance={
                "kind": ENGINE3D_SEQUENCE_KIND,
                "structure_source": "engine3d_raster",
                "frame_count": 2,
            },
        )

    monkeypatch.setattr("app.main.generate_engine3d_sequence", fake_seq)
    client = TestClient(app)
    resp = client.post(
        "/api/engine3d-sequence",
        json={"width": 64, "height": 48, "duration": 0.5, "fps": 4},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["sequence"]["kind"] == ENGINE3D_SEQUENCE_KIND
    assert "8K" in body["note"] or "farm" in body["note"].lower()
