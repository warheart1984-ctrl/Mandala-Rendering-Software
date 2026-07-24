"""Health and dry-run smoke tests (no live NVIDIA / B2 required)."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ["GENBLAZE_DRY_RUN"] = "1"

from app.config import Settings
from app.embeddings import cosine_similarity
from app.main import app  # noqa: E402


def _offline_settings(**overrides) -> Settings:
    base = dict(
        nvidia_api_key=None,
        b2_key_id=None,
        b2_app_key=None,
        b2_bucket="test-bucket",
        b2_region="us-east-005",
        b2_endpoint="https://s3.us-east-005.backblazeb2.com",
        storage_prefix="genblaze-media",
        image_model="black-forest-labs/flux.1-schnell",
        embed_model="nvidia/nv-embedcode-7b-v1",
        embed_url="https://integrate.api.nvidia.com/v1/embeddings",
        embed_timeout_seconds=60.0,
        store_full_embeddings=True,
        presign_expires_seconds=3600,
        dry_run=True,
        dotenv_loaded=(),
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    monkeypatch.setattr("app.main.get_settings", _offline_settings)
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    return TestClient(app)


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "mrs-genblaze-media"
    assert body["nvidia_configured"] is False
    assert body["b2_configured"] is False
    assert body["embed_model"] == "nvidia/nv-embedcode-7b-v1"


def test_ui_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Genblaze" in r.text


def test_generate_dry_run(client):
    r = client.post("/api/generate", json={"prompt": "unit test mandala concept"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dry_run"] is True
    assert body["status"] == "ok"
    assert body["prompt"] == "unit test mandala concept"
    assert body["asset_sha256"]


def test_assets_after_generate(client):
    client.post("/api/generate", json={"prompt": "listed asset"})
    r = client.get("/api/assets")
    assert r.status_code == 200
    assets = r.json()["assets"]
    assert len(assets) >= 1
    assert assets[0]["prompt"] == "listed asset"


def test_generate_requires_nvidia_when_not_dry(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(
            nvidia_api_key=None,
            b2_key_id="id",
            b2_app_key="key",
            b2_bucket="bucket",
            dry_run=False,
        ),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent2.json")
    c = TestClient(app)
    r = c.post("/api/generate", json={"prompt": "should fail"})
    assert r.status_code == 503
    assert "NVIDIA_API_KEY" in r.json()["detail"]


def test_cosine_similarity_unit():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_resolve_repo_root_docker_shallow(tmp_path):
    from app.config import resolve_repo_root

    # Simulate /app with no monorepo parents deep enough / no mrs layout
    assert resolve_repo_root(tmp_path) == tmp_path
