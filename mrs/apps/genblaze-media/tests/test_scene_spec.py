"""Tests for POST /api/render-scene (SceneSpecification path)."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.config import (
    Settings,
    _resolve_renderer_core_script,
    scene_spec_default_script_path,
    validate_scene_spec_default_script_path,
)
from app.config import Settings, scene_spec_default_script_path
from app.main import app
from app.rt4d_provider import RT4DRenderError
from app.scene_spec_provider import (
    SCENE_SPEC_PROVIDER_ID,
    SCENE_SPEC_SETUP_HELP,
    render_scene_spec,
    scene_spec_availability,
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
        image_backend="nvidia",
        image_fallback_to_rt4d=False,
        rt4d_node_path="node",
        rt4d_script_path=None,
        scene_spec_script_path=str(scene_spec_default_script_path()),
        rt4d_width=64,
        rt4d_height=48,
        rt4d_samples=4,
        rt4d_max_depth=3,
        rt4d_timeout_seconds=120.0,
    )
    base.update(overrides)
    return Settings(**base)


def _nonblank_png_bytes(width: int = 64, height: int = 48) -> bytes:
    try:
        from PIL import Image
        import io

        im = Image.new("RGB", (width, height), (40, 120, 200))
        for x in range(10, 40):
            for y in range(10, 30):
                im.putpixel((x, y), (220, 180, 40))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        return bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
            "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
        )


VALID_SPEC = {
    "schemaVersion": "1.0",
    "kind": "SceneSpecification",
    "id": "api-tess",
    "entities": [
        {
            "id": "tess",
            "geometry": {"kind": "surface", "surfaceId": "tesseract"},
        }
    ],
    "output": {"width": 64, "height": 48, "samples": 2, "seed": 9},
}


@pytest.fixture(autouse=True)
def _isolate_preview_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))


def test_scene_spec_availability_reports_script():
    info = scene_spec_availability(_settings())
    assert "available" in info
    assert Path(info["script_path"]).is_file()


def test_health_exposes_scene_spec(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    body = client.get("/health").json()
    assert isinstance(body["scene_spec"], dict)
    assert "available" in body["scene_spec"]
    assert "render-clip" in body["scene_spec_note"]


def test_render_scene_invalid_spec_400(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.post(
        "/api/render-scene",
        json={"spec": {"schemaVersion": "1.0", "id": "bad", "entities": []}},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "errors" in detail
    assert any(e.get("path") == "entities" for e in detail["errors"])


def test_render_scene_mocked_200(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()

    def fake_run(argv, **kwargs):
        out_path = Path(argv[argv.index("--output") + 1])
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-scene-spec-4d-render",
                    "specHash": "abc",
                    "seed": 9,
                    "sha256": sha,
                    "frameIndex": 0,
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
    resp = client.post("/api/render-scene", json={"spec": VALID_SPEC})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider"] == SCENE_SPEC_PROVIDER_ID
    assert body["asset_sha256"] == sha
    assert body["provenance"]["kind"].startswith("deterministic-scene-spec")


def test_render_scene_setup_503(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(scene_spec_script_path=str(tmp_path / "missing.mjs")),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.post("/api/render-scene", json={"spec": VALID_SPEC})
    assert resp.status_code == 503
    assert "Node" in resp.json()["detail"] or "render-scene" in resp.json()["detail"]


def test_render_scene_crash_502(tmp_path, monkeypatch):
    def fake_run(argv, **kwargs):
        return MagicMock(returncode=1, stdout="", stderr="boom crash")

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
    resp = client.post("/api/render-scene", json={"spec": VALID_SPEC})
    assert resp.status_code == 502


def test_provider_cli_validation_errors_raise_value_error(tmp_path, monkeypatch):
    def fake_run(argv, **kwargs):
        return MagicMock(
            returncode=1,
            stdout="",
            stderr=json.dumps(
                {
                    "error": "SPEC_INVALID",
                    "errors": [{"path": "entities[0].geometry.kind", "message": "bad"}],
                }
            )
            + "\nbang\n",
        )

    monkeypatch.setattr("app.scene_spec_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(scene_spec_script_path=str(script))
    with pytest.raises(ValueError) as ei:
        render_scene_spec(settings, VALID_SPEC)
    assert "errors" in ei.value.args[0]


def test_provider_raises_rt4d_render_error_on_timeout(tmp_path, monkeypatch):
    import subprocess as sp

    def fake_run(*a, **k):
        raise sp.TimeoutExpired(cmd="node", timeout=1)

    monkeypatch.setattr("app.scene_spec_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    with pytest.raises(RT4DRenderError):
        render_scene_spec(_settings(scene_spec_script_path=str(script)), VALID_SPEC)


def test_setup_help_constant():
    assert "render-scene.mjs" in SCENE_SPEC_SETUP_HELP


def test_resolve_prefers_monorepo_layout(tmp_path):
    """When the monorepo path exists it wins over the Docker fallback."""
    mono_scripts = tmp_path / "repo" / "mrs" / "packages" / "renderer-core" / "scripts"
    mono_scripts.mkdir(parents=True)
    (mono_scripts / "render-scene.mjs").write_text("// mono\n", encoding="utf-8")

    docker_scripts = tmp_path / "app" / "renderer-core" / "scripts"
    docker_scripts.mkdir(parents=True)
    (docker_scripts / "render-scene.mjs").write_text("// docker\n", encoding="utf-8")

    resolved = _resolve_renderer_core_script(
        "render-scene.mjs",
        repo_root=tmp_path / "repo",
        app_dir=tmp_path / "app",
    )
    assert resolved == mono_scripts / "render-scene.mjs"


def test_resolve_falls_back_to_docker_layout(tmp_path):
    """Docker image copies renderer-core to <app_dir>/renderer-core; resolve it
    even though the monorepo path (<repo>/mrs/packages/...) is absent."""
    repo_root = tmp_path / "app"  # /app has no mrs/packages tree
    docker_scripts = repo_root / "renderer-core" / "scripts"
    docker_scripts.mkdir(parents=True)
    for name in ("render-scene.mjs", "validate-scene-spec.mjs"):
        (docker_scripts / name).write_text("// docker\n", encoding="utf-8")

    scene = _resolve_renderer_core_script(
        "render-scene.mjs", repo_root=repo_root, app_dir=repo_root
    )
    validate = _resolve_renderer_core_script(
        "validate-scene-spec.mjs", repo_root=repo_root, app_dir=repo_root
    )
    assert scene == docker_scripts / "render-scene.mjs"
    assert scene.is_file()
    assert validate == docker_scripts / "validate-scene-spec.mjs"
    assert validate.is_file()


def test_resolve_missing_returns_monorepo_path(tmp_path):
    """Neither layout present → return the canonical monorepo path (not found)."""
    resolved = _resolve_renderer_core_script(
        "render-scene.mjs",
        repo_root=tmp_path / "repo",
        app_dir=tmp_path / "app",
    )
    assert resolved == (
        tmp_path / "repo" / "mrs" / "packages" / "renderer-core" / "scripts"
        / "render-scene.mjs"
    )
    assert not resolved.is_file()


def test_scene_spec_availability_docker_layout(tmp_path, monkeypatch):
    """A Docker-layout script (no env override) makes scene-spec available when
    node resolves — the exact gap that produced the operator 503."""
    docker_scripts = tmp_path / "app" / "renderer-core" / "scripts"
    docker_scripts.mkdir(parents=True)
    script = docker_scripts / "render-scene.mjs"
    script.write_text("// docker\n", encoding="utf-8")

    monkeypatch.setattr(
        "app.config._resolve_renderer_core_script",
        lambda name, repo_root=None, app_dir=None: script
        if name == "render-scene.mjs"
        else docker_scripts / name,
    )
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")

    # scene_spec_script_path=None → falls back to the (patched) default resolver.
    info = scene_spec_availability(_settings(scene_spec_script_path=None))
    assert info["script_found"] is True
    assert info["available"] is True
    assert info["script_path"] == str(script)
