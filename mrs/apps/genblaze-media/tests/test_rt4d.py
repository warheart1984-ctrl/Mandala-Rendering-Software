"""Tests for the RT4D deterministic renderer image backend.

Mock subprocess for the provider unit tests; optionally run a real CLI
invocation when Node and the monorepo script are present.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# Keep dry-run default so other modules that import Settings at import time stay offline.
os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.config import Settings, rt4d_default_script_path
from app.main import app
from app.rt4d_provider import (
    RT4D_PROVIDER_ID,
    generate_image_rt4d,
    rt4d_availability,
)


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
        rt4d_script_path=str(rt4d_default_script_path()),
        rt4d_width=64,
        rt4d_height=48,
        rt4d_samples=4,
        rt4d_max_depth=3,
        rt4d_timeout_seconds=120.0,
    )
    base.update(overrides)
    return Settings(**base)


# Minimal valid 64x48-ish PNG is expensive to hand-craft; use a small real PNG
# (1x1) only for mock paths — quality assessment will reject it as blank, so
# the mock path builds a larger non-blank PNG via Pillow when available.
def _nonblank_png_bytes(width: int = 64, height: int = 48) -> bytes:
    try:
        from PIL import Image
        import io

        im = Image.new("RGB", (width, height), (40, 120, 200))
        # Add a bright rectangle so unique colors >> blank thresholds
        for x in range(10, 40):
            for y in range(10, 30):
                im.putpixel((x, y), (220, 180, 40))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        # Fallback: return a tiny PNG; tests that need quality.ok will skip.
        return bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
            "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
        )


@pytest.fixture(autouse=True)
def _isolate_preview_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))


def test_rt4d_availability_reports_script_and_node():
    s = _settings()
    info = rt4d_availability(s)
    assert "available" in info
    assert info["script_path"]
    assert info["node_path"] == "node"
    # In the monorepo checkout the script should exist; node may or may not.
    assert Path(info["script_path"]).is_file()


def test_health_exposes_rt4d_fields(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings(image_backend="rt4d"))
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    body = client.get("/health").json()
    assert body["image_backend"] == "rt4d"
    assert RT4D_PROVIDER_ID in body["image_backends"]
    assert "nvidia-genai" in body["image_backends"]
    assert body["image_fallback_to_rt4d"] is False
    assert isinstance(body["rt4d"], dict)
    assert "available" in body["rt4d"]
    assert "NOT text-to-image" in body["rt4d_note"]


def test_generate_rt4d_mocked_subprocess(tmp_path, monkeypatch):
    """Provider writes PNG + provenance without a live Node render."""
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    provenance = {
        "engine": "mrs-renderer-core/rt4d",
        "kind": "deterministic-procedural-4d-render",
        "scene": "tesseract-vertices",
        "palette": "neon",
        "seed": 1,
        "sha256": sha,
        "width": 64,
        "height": 48,
        "mean_luminance": 80.0,
    }

    def fake_run(argv, **kwargs):
        # argv: [node, script, ... --output <path>]
        out_idx = argv.index("--output") + 1
        out_path = Path(argv[out_idx])
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(provenance) + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    # Make script appear present regardless of sandbox path.
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script), b2_key_id=None, b2_app_key=None)

    result = generate_image_rt4d(settings, "cyan tesseract lattice")
    assert result.provider == RT4D_PROVIDER_ID
    assert result.model == "mrs-renderer-core/rt4d"
    assert result.status == "ok"
    assert result.asset_sha256 == sha
    assert result.provenance is not None
    assert result.provenance["scene"] == "tesseract-vertices"
    assert result.quality is not None
    assert result.quality["ok"] is True
    assert result.provenance["kind"].startswith("deterministic")


def test_api_generate_dispatches_to_rt4d(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()

    def fake_run(argv, **kwargs):
        out_path = Path(argv[argv.index("--output") + 1])
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-procedural-4d-render",
                    "scene": "lattice-grid",
                    "seed": 42,
                    "sha256": sha,
                    "mean_luminance": 60.0,
                }
            )
            + "\n",
            stderr="",
        )

    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script))

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "neon lattice grid", "embed": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == RT4D_PROVIDER_ID
    assert body["asset_sha256"] == sha
    assert body["provenance"]["scene"] == "lattice-grid"


def test_fallback_to_rt4d_on_nvidia_failure(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(
        image_backend="nvidia",
        image_fallback_to_rt4d=True,
        nvidia_api_key="nvapi-test",
        rt4d_script_path=str(script),
    )

    def boom(*_a, **_k):
        raise RuntimeError("NVIDIA image generate failed (504): {\"_raw\": \"\"}")

    def fake_run(argv, **kwargs):
        out_path = Path(argv[argv.index("--output") + 1])
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-procedural-4d-render",
                    "scene": "central-orb",
                    "seed": 7,
                    "sha256": sha,
                    "mean_luminance": 55.0,
                }
            )
            + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.main.generate_image", boom)
    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr(
        "app.main.rt4d_availability",
        lambda _s: {"available": True},
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "cool sphere", "embed": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == RT4D_PROVIDER_ID
    assert "RT4D fallback" in (body.get("detail") or "")


def test_rt4d_missing_node_returns_503(tmp_path, monkeypatch):
    settings = _settings(rt4d_script_path=str(tmp_path / "missing.mjs"))
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: None)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "anything", "embed": False})
    assert r.status_code == 503
    assert "Node" in r.json()["detail"] or "render-still" in r.json()["detail"]


@pytest.mark.skipif(
    shutil.which("node") is None or not rt4d_default_script_path().is_file(),
    reason="Node or render-still.mjs not available in this environment",
)
def test_real_rt4d_cli_invocation(tmp_path, monkeypatch):
    """End-to-end: real Node CLI → valid non-blank PNG → GenerateResult."""
    settings = _settings(
        rt4d_width=48,
        rt4d_height=36,
        rt4d_samples=4,
        rt4d_max_depth=3,
        rt4d_script_path=str(rt4d_default_script_path()),
    )
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))
    result = generate_image_rt4d(settings, "cyan tesseract lattice")
    assert result.provider == RT4D_PROVIDER_ID
    assert result.asset_sha256 and len(result.asset_sha256) == 64
    assert result.quality and result.quality["ok"] is True
    assert result.provenance["scene"] == "tesseract-vertices"
    assert result.provenance["palette"] == "neon"
    assert (result.quality.get("mean_luminance") or 0) > 8
