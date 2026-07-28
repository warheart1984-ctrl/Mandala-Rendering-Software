"""Tests for Genblaze prompt→scene API (Architect acceptance).

Status: **enforced** — health, mocked POST, error mapping, settings env wiring.
Match light style of test_engine3d_still.py.
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.config import Settings, get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.prompt_scene_provider import (  # noqa: E402
    PROMPT_SCENE_PROVIDER_ID,
    PROMPT_SCENE_SETUP_HELP,
    PromptSceneBridgeError,
    prompt_scene_availability,
    prompt_scene_bridge_default_script_path,
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
        prompt_scene_bridge_enabled=True,
        prompt_scene_bridge_script_path=None,
        prompt_scene_bridge_python=None,
        prompt_scene_infinity_src=None,
        prompt_scene_bridge_timeout_seconds=90.0,
        prompt_scene_expand_world=False,
        engine3d_still_enabled=True,
        engine3d_still_script_path=None,
        engine3d_still_timeout_seconds=60.0,
        worlddocument_rt4d_script_path=None,
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


def _bridge_payload() -> dict:
    return {
        "ok": True,
        "prompt": "gothic altar",
        "sceneSpecification": {
            "schemaVersion": "1.0",
            "kind": "SceneSpecification",
            "id": "gothic_altar",
            "materials": [{"id": "mood", "color": "#8a2be2"}],
            "entities": [
                {
                    "id": "primary",
                    "materialId": "mood",
                    "geometry": {"kind": "surface", "surfaceId": "tesseract"},
                }
            ],
            "camera": {"position4d": [4, 1, 0, 0], "target4d": [0, 0, 0, 0]},
            "output": {"width": 256, "height": 192, "samples": 4, "maxDepth": 4, "seed": 1},
        },
        "engine3dWorldDocument": {
            "schemaVersion": "engine3d-world/1.0",
            "id": "star-from-prompt-1",
            "generator": {"id": "star-generator", "type": "star", "seed": 1},
            "objects": [],
            "materials": [],
            "lights": [],
            "cameras": [],
        },
        "infinityScene": {"theme": "gothic_ritual", "keywords": ["altar"]},
        "laneMeta": {"provider": "fallback"},
    }


def test_health_exposes_prompt_scene_bridge(tmp_path, monkeypatch):
    """AC: GET /health includes prompt-scene availability / provider key."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert "prompt_scene" in body
    assert isinstance(body["prompt_scene"], dict)
    assert body["prompt_scene"]["provider"] == PROMPT_SCENE_PROVIDER_ID
    assert body["prompt_scene"]["endpoint"] == "/api/prompt-to-scene"
    assert "prompt_scene_note" in body
    assert "prompt-to-scene" in body["prompt_scene_note"]


def test_post_prompt_to_scene_mocked(tmp_path, monkeypatch):
    """AC: POST /api/prompt-to-scene returns structured scene JSON (bridge mocked)."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    monkeypatch.setattr(
        "app.main.prompt_to_scene",
        lambda settings, prompt, **kwargs: {
            "ok": True,
            "provider": PROMPT_SCENE_PROVIDER_ID,
            "prompt": prompt,
            "sceneSpecification": _bridge_payload()["sceneSpecification"],
            "engine3dWorldDocument": _bridge_payload()["engine3dWorldDocument"],
            "infinityScene": _bridge_payload()["infinityScene"],
            "laneMeta": _bridge_payload()["laneMeta"],
            "rendered": False,
        },
    )
    client = TestClient(app)
    resp = client.post(
        "/api/prompt-to-scene",
        json={"prompt": "a gothic altar under a blood moon"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["provider"] == PROMPT_SCENE_PROVIDER_ID
    assert body["rendered"] is False
    assert body["sceneSpecification"]["kind"] == "SceneSpecification"
    assert body["engine3dWorldDocument"]["objects"] == []


def test_prompt_to_scene_render_true(tmp_path, monkeypatch):
    """AC: render=true attaches still / preview via SceneSpecification RT4D path."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")

    def fake_prompt_to_scene(settings, prompt, **kwargs):
        assert kwargs.get("render") is True
        return {
            "ok": True,
            "provider": PROMPT_SCENE_PROVIDER_ID,
            "prompt": prompt,
            "sceneSpecification": _bridge_payload()["sceneSpecification"],
            "engine3dWorldDocument": _bridge_payload()["engine3dWorldDocument"],
            "infinityScene": _bridge_payload()["infinityScene"],
            "laneMeta": _bridge_payload()["laneMeta"],
            "rendered": True,
            "render": {
                "run_id": "11111111-1111-1111-1111-111111111111",
                "preview_url": "/api/preview/11111111-1111-1111-1111-111111111111",
                "kind": "prompt-scene-bridge-rt4d",
            },
        }

    monkeypatch.setattr("app.main.prompt_to_scene", fake_prompt_to_scene)
    client = TestClient(app)
    resp = client.post(
        "/api/prompt-to-scene",
        json={"prompt": "lattice mandala", "render": True, "quality": "draft"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rendered"] is True
    assert "render" in body
    assert body["render"]["kind"] == "prompt-scene-bridge-rt4d"


def test_prompt_to_scene_render_false(tmp_path, monkeypatch):
    """AC: render=false (default) returns sceneSpecification without requiring still."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    seen = {}

    def fake_prompt_to_scene(settings, prompt, **kwargs):
        seen.update(kwargs)
        return {
            "ok": True,
            "provider": PROMPT_SCENE_PROVIDER_ID,
            "prompt": prompt,
            "sceneSpecification": _bridge_payload()["sceneSpecification"],
            "engine3dWorldDocument": _bridge_payload()["engine3dWorldDocument"],
            "rendered": False,
        }

    monkeypatch.setattr("app.main.prompt_to_scene", fake_prompt_to_scene)
    client = TestClient(app)
    resp = client.post("/api/prompt-to-scene", json={"prompt": "archive ledger"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["rendered"] is False
    assert "render" not in body
    assert seen.get("render") is False


def test_prompt_to_scene_400_bad_request(tmp_path, monkeypatch):
    """AC: missing/empty prompt → HTTP 400."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    # Pydantic rejects empty / missing prompt before handler.
    resp_missing = client.post("/api/prompt-to-scene", json={})
    assert resp_missing.status_code == 422
    resp_empty = client.post("/api/prompt-to-scene", json={"prompt": ""})
    assert resp_empty.status_code == 422

    monkeypatch.setattr(
        "app.main.prompt_to_scene",
        MagicMock(side_effect=ValueError("prompt is required")),
    )
    resp_value = client.post(
        "/api/prompt-to-scene",
        json={"prompt": "x"},
    )
    assert resp_value.status_code == 400
    assert "prompt" in resp_value.json()["detail"].lower()


def test_prompt_to_scene_502_bridge_failure(tmp_path, monkeypatch):
    """AC: bridge CLI failure → HTTP 502."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    monkeypatch.setattr(
        "app.main.prompt_to_scene",
        MagicMock(side_effect=PromptSceneBridgeError("bridge failed: boom")),
    )
    client = TestClient(app)
    resp = client.post("/api/prompt-to-scene", json={"prompt": "altar"})
    assert resp.status_code == 502
    assert "bridge" in resp.json()["detail"].lower()


def test_prompt_to_scene_503_unavailable(tmp_path, monkeypatch):
    """AC: disabled / missing script → HTTP 503."""
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    monkeypatch.setattr(
        "app.main.prompt_to_scene",
        MagicMock(
            side_effect=RuntimeError(
                "prompt→scene bridge disabled (set PROMPT_SCENE_BRIDGE_ENABLED=1)"
            )
        ),
    )
    client = TestClient(app)
    resp = client.post("/api/prompt-to-scene", json={"prompt": "altar"})
    assert resp.status_code == 503
    assert "disabled" in resp.json()["detail"].lower()


def test_settings_prompt_scene_bridge_wiring(monkeypatch):
    """AC: Settings exposes prompt_scene_bridge_* and get_settings wires env."""
    monkeypatch.setenv("PROMPT_SCENE_BRIDGE_ENABLED", "0")
    monkeypatch.setenv("PROMPT_SCENE_BRIDGE_SCRIPT", "/tmp/run_bridge.py")
    monkeypatch.setenv("PROMPT_SCENE_BRIDGE_PYTHON", "python3.11")
    monkeypatch.setenv("INFINITY_STORY_SRC", "/tmp/infinity-src")
    monkeypatch.setenv("PROMPT_SCENE_BRIDGE_TIMEOUT", "42")
    monkeypatch.setenv("PROMPT_SCENE_EXPAND_WORLD", "1")
    settings = get_settings()
    assert settings.prompt_scene_bridge_enabled is False
    assert settings.prompt_scene_bridge_script_path == "/tmp/run_bridge.py"
    assert settings.prompt_scene_bridge_python == "python3.11"
    assert settings.prompt_scene_infinity_src == "/tmp/infinity-src"
    assert settings.prompt_scene_bridge_timeout_seconds == 42.0
    assert settings.prompt_scene_expand_world is True

    avail = prompt_scene_availability(settings)
    assert avail["provider"] == PROMPT_SCENE_PROVIDER_ID
    assert avail["enabled"] is False
    assert avail["available"] is False
    assert avail["expand_world"] is True


def test_prompt_scene_bridge_default_script_docker_layout(tmp_path, monkeypatch):
    """AC: when monorepo path missing, default resolves APP_DIR/prompt-scene-bridge."""
    fake_repo = tmp_path / "not-a-monorepo"
    fake_repo.mkdir()
    app_dir = tmp_path / "app"
    bridge_dir = app_dir / "prompt-scene-bridge"
    bridge_dir.mkdir(parents=True)
    script = bridge_dir / "run_bridge.py"
    script.write_text("# docker stub\n", encoding="utf-8")
    monkeypatch.setattr("app.prompt_scene_provider.APP_DIR", app_dir)
    resolved = prompt_scene_bridge_default_script_path(
        repo_root=fake_repo, app_dir=app_dir
    )
    assert resolved == script
    assert "Docker /app/prompt-scene-bridge" in PROMPT_SCENE_SETUP_HELP


def test_ban_note_app_must_not_import_narrative_lane():
    """AC: Genblaze app/*.py stays free of banned narrative-package strings (CI)."""
    app_dir = Path(__file__).resolve().parents[1] / "app"
    offenders = []
    for path in app_dir.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "story_forge" in text or "storyforge" in text:
            offenders.append(path.name)
    assert offenders == [], f"banned narrative strings in: {offenders}"
