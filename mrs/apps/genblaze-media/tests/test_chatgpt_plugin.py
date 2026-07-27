"""ChatGPT / Custom GPT plugin surface tests."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.chatgpt_plugin import build_ai_plugin_manifest, build_plugin_openapi
from app.config import Settings
from app.main import app


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


def test_manifest_builder_none_auth():
    m = build_ai_plugin_manifest("https://abc.ngrok-free.app", require_bearer=False)
    assert m["name_for_model"] == "engine3d_renderer"
    assert m["auth"]["type"] == "none"
    assert m["api"]["url"].endswith("/plugin/openapi.json")
    assert "RT4D as background" in m["description_for_model"]
    assert "1024" in m["description_for_model"]


def test_manifest_builder_bearer():
    m = build_ai_plugin_manifest("https://example.com", require_bearer=True)
    assert m["auth"]["type"] == "service_http"
    assert m["auth"]["authorization_type"] == "bearer"


def test_plugin_openapi_matches_real_endpoint():
    spec = build_plugin_openapi("https://example.com", require_bearer=True)
    path = spec["paths"]["/api/engine3d-still"]["post"]
    assert path["operationId"] == "renderEngine3dStill"
    props = spec["components"]["schemas"]["Engine3dStillRequest"]["properties"]
    assert props["width"]["maximum"] == 1024
    assert "structure" in spec["components"]["schemas"]["Engine3dStillResponse"]["properties"]
    assert "bearerAuth" in spec["components"]["securitySchemes"]


def test_well_known_and_plugin_openapi_routes(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(public_base_url="https://tunnel.example"),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.get("/.well-known/ai-plugin.json")
    assert r.status_code == 200
    body = r.json()
    assert body["api"]["url"] == "https://tunnel.example/plugin/openapi.json"
    assert body["auth"]["type"] == "none"

    o = client.get("/plugin/openapi.json")
    assert o.status_code == 200
    assert "/api/engine3d-still" in o.json()["paths"]

    logo = client.get("/assets/engine3d-logo.svg")
    assert logo.status_code == 200
    legal = client.get("/legal")
    assert legal.status_code == 200


def test_health_exposes_chatgpt_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert "chatgpt_plugin" in resp.json()


def test_bearer_required_when_plugin_key_set(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(chatgpt_plugin_key="secret-token-xyz"),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    denied = client.post("/api/engine3d-still", json={"width": 64, "height": 64})
    assert denied.status_code == 401

    # Sub-paths must also be gated (prefix match, not exact-only).
    nested = client.post(
        "/api/engine3d-still/extra",
        json={"width": 64, "height": 64},
    )
    assert nested.status_code == 401

    # Wrong token
    bad = client.post(
        "/api/engine3d-still",
        json={"width": 64, "height": 64},
        headers={"Authorization": "Bearer wrong"},
    )
    assert bad.status_code == 401

    # Manifest + openapi stay public
    assert client.get("/.well-known/ai-plugin.json").status_code == 200
    assert client.get("/plugin/openapi.json").status_code == 200
    manifest = client.get("/.well-known/ai-plugin.json").json()
    assert manifest["auth"]["type"] == "service_http"


def test_is_plugin_protected_path_prefix_match():
    from app.chatgpt_plugin import is_plugin_protected_path

    assert is_plugin_protected_path("/api/engine3d-still") is True
    assert is_plugin_protected_path("/api/engine3d-still/") is True
    assert is_plugin_protected_path("/api/engine3d-still/nested") is True
    assert is_plugin_protected_path("/api/engine3d-sequence") is True
    assert is_plugin_protected_path("/api/polish-still") is True
    assert is_plugin_protected_path("/api/generate") is False
    assert is_plugin_protected_path("/health") is False


def test_cors_not_auto_enabled_by_plugin_key(monkeypatch):
    """CHATGPT_PLUGIN_KEY must not silently open allow_origins=['*']."""
    monkeypatch.setenv("CHATGPT_PLUGIN_KEY", "plugin-secret-for-cors-test")
    monkeypatch.delenv("GENBLAZE_CORS_ALLOW_ALL", raising=False)
    from app.config import get_settings

    settings = get_settings()
    assert settings.chatgpt_plugin_key == "plugin-secret-for-cors-test"
    assert settings.cors_allow_all is False


def test_cors_explicit_allow_all(monkeypatch):
    monkeypatch.setenv("GENBLAZE_CORS_ALLOW_ALL", "1")
    monkeypatch.delenv("CHATGPT_PLUGIN_KEY", raising=False)
    from app.config import get_settings

    assert get_settings().cors_allow_all is True
