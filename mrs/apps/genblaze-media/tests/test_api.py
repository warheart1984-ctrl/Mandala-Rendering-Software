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
        b2_probe_on_health=False,
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
    assert body["b2_probe_on_health"] is False
    assert body["b2_probe_skipped"] is False
    assert body["b2_probe"] is None
    assert body["embed_model"] == "nvidia/nv-embedcode-7b-v1"


def test_health_skips_b2_list_by_default(monkeypatch, tmp_path):
    """With B2 configured but probe flag off, /health must not call ListObjects."""
    called = {"probe": False}

    def _fake_probe(_settings):
        called["probe"] = True
        return {"ok": True, "sample_keys": []}

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(
            b2_key_id="id",
            b2_app_key="key",
            b2_bucket="bucket",
            b2_probe_on_health=False,
        ),
    )
    monkeypatch.setattr("app.main.probe_b2", _fake_probe)
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "health-skip.json")
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["b2_configured"] is True
    assert body["b2_probe_on_health"] is False
    assert body["b2_probe_skipped"] is True
    assert body["b2_probe"] is None
    assert called["probe"] is False


def test_health_probes_b2_when_flagged(monkeypatch, tmp_path):
    called = {"probe": False}

    def _fake_probe(_settings):
        called["probe"] = True
        return {"ok": True, "sample_keys": ["genblaze-media/x.jpg"], "count_listed": 1}

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(
            b2_key_id="id",
            b2_app_key="key",
            b2_bucket="bucket",
            b2_probe_on_health=True,
        ),
    )
    monkeypatch.setattr("app.main.probe_b2", _fake_probe)
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "health-probe.json")
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["b2_probe_on_health"] is True
    assert body["b2_probe_skipped"] is False
    assert body["b2_probe"]["ok"] is True
    assert called["probe"] is True


def test_b2_probe_on_health_env_default_off(monkeypatch):
    from app.config import get_settings

    monkeypatch.delenv("B2_PROBE_ON_HEALTH", raising=False)
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    settings = get_settings()
    assert settings.b2_probe_on_health is False


def test_b2_probe_on_health_env_opt_in(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("B2_PROBE_ON_HEALTH", "1")
    monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
    settings = get_settings()
    assert settings.b2_probe_on_health is True


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


def test_nvidia_timeouts_defaults(monkeypatch):
    from app.nvidia_http import NvidiaGenaiTimeouts, build_nvidia_genai_client

    for key in (
        "GENBLAZE_HTTP_TIMEOUT",
        "GENBLAZE_NVCF_TIMEOUT",
        "GENBLAZE_PIPELINE_TIMEOUT",
        "GENBLAZE_NVCF_POLL_SECONDS",
        "GENBLAZE_CONNECT_TIMEOUT",
    ):
        monkeypatch.delenv(key, raising=False)

    cfg = NvidiaGenaiTimeouts.from_env()
    assert cfg.http_timeout == 600.0
    assert cfg.nvcf_timeout == 600.0
    assert cfg.pipeline_timeout == 720
    assert cfg.nvcf_poll_seconds == 90
    assert cfg.connect_timeout == 30.0

    client = build_nvidia_genai_client("nvapi-test", cfg)
    try:
        assert client.headers["NVCF-POLL-SECONDS"] == "90"
        assert client.timeout.read == 600.0
        assert client.timeout.connect == 30.0
    finally:
        client.close()


def test_nvidia_timeouts_http_floors_above_poll(monkeypatch):
    from app.nvidia_http import NvidiaGenaiTimeouts

    monkeypatch.setenv("GENBLAZE_NVCF_POLL_SECONDS", "120")
    monkeypatch.setenv("GENBLAZE_HTTP_TIMEOUT", "100")  # too low vs poll
    cfg = NvidiaGenaiTimeouts.from_env()
    assert cfg.nvcf_poll_seconds == 120
    assert cfg.http_timeout == 150.0  # poll + 30


def test_health_includes_nvidia_timeouts(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "nvidia_timeouts" in body
    assert body["nvidia_timeouts"]["http_read_seconds"] >= 90
    assert body["nvidia_timeouts"]["nvcf_poll_seconds"] <= 300


def test_nvidia_output_dir_under_temp():
    from app.pipeline import _nvidia_output_dir
    import tempfile
    from pathlib import Path

    d = _nvidia_output_dir()
    try:
        temp_root = Path(tempfile.gettempdir()).resolve()
        assert d.resolve().is_relative_to(temp_root)
        assert d.is_dir()
    finally:
        import shutil

        shutil.rmtree(d, ignore_errors=True)


def test_format_transfer_failures():
    from app.pipeline import _format_transfer_failures

    assert _format_transfer_failures([]) == ""
    msg = _format_transfer_failures([RuntimeError("Access denied: outside allowed")])
    assert "RuntimeError" in msg
    assert "Access denied" in msg


def test_reraise_with_transfer_cause_preserves_type():
    from app.pipeline import _reraise_with_transfer_cause

    class SinkError(Exception):
        pass

    with pytest.raises(SinkError, match="underlying transfer error") as ei:
        _reraise_with_transfer_cause(
            SinkError("1/1 asset transfer(s) failed; manifest was not uploaded"),
            [RuntimeError("Access denied: local file path /app/x.png is outside allowed")],
        )
    assert ei.value.__cause__ is not None
    assert "Access denied" in str(ei.value.__cause__)


def test_api_generate_surfaces_transfer_cause(monkeypatch, tmp_path):
    """502 detail must include underlying transfer error, not only SinkError text."""
    from app import main as main_mod
    from app.index_store import AssetIndex

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(
            nvidia_api_key="nvapi-test",
            b2_key_id="id",
            b2_app_key="key",
            b2_bucket="bucket",
            dry_run=False,
        ),
    )
    main_mod._index = AssetIndex(tmp_path / "recent-xfer.json")

    class SinkError(Exception):
        pass

    def boom(_settings, _prompt):
        err = SinkError(
            "Run abc: 1/1 asset transfer(s) failed; manifest was not uploaded; "
            "underlying transfer error: StorageError: Access denied: outside allowed"
        )
        err.__cause__ = RuntimeError("Access denied: outside allowed")
        raise err

    monkeypatch.setattr("app.main.generate_image", boom)
    c = TestClient(app)
    r = c.post("/api/generate", json={"prompt": "surface transfer"})
    assert r.status_code == 502
    detail = r.json()["detail"]
    assert "asset transfer" in detail
    assert "Access denied" in detail or "underlying" in detail


def test_sanitize_strips_meta_commentary():
    from app.prompt_sanitize import sanitize_prompt

    raw = (
        "A glowing cyan 4D tesseract on a table, neon grid. Ok this not good ."
    )
    cleaned = sanitize_prompt(raw)
    assert "not good" not in cleaned.lower()
    assert "tesseract" in cleaned.lower()
    assert "glowing glowing" not in sanitize_prompt("glowing glowing cyan cube").lower()


def test_assess_rejects_solid_black_jpeg():
    import io

    from PIL import Image

    from app.image_quality import assess_image_bytes

    buf = io.BytesIO()
    Image.new("RGB", (1024, 1024), (0, 0, 0)).save(buf, format="JPEG", quality=90)
    data = buf.getvalue()
    assessment = assess_image_bytes(data)
    assert assessment.is_blank
    assert assessment.mean_luminance is not None
    assert assessment.mean_luminance < 1.0


def test_assess_accepts_non_black_png():
    import io

    from PIL import Image

    from app.image_quality import assess_image_bytes

    buf = io.BytesIO()
    Image.new("RGB", (256, 256), (40, 120, 200)).save(buf, format="PNG")
    assessment = assess_image_bytes(buf.getvalue())
    assert assessment.ok


def test_api_generate_blank_image_returns_422(monkeypatch, tmp_path):
    from app import main as main_mod
    from app.index_store import AssetIndex
    from app.pipeline import GenerationQualityError

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(
            nvidia_api_key="nvapi-test",
            b2_key_id="id",
            b2_app_key="key",
            b2_bucket="bucket",
            dry_run=False,
        ),
    )
    main_mod._index = AssetIndex(tmp_path / "recent-blank.json")

    def boom(_settings, _prompt):
        raise GenerationQualityError(
            "NVIDIA returned a near-black / empty still (mean luminance 0.00)"
        )

    monkeypatch.setattr("app.main.generate_image", boom)
    c = TestClient(app)
    r = c.post("/api/generate", json={"prompt": "person holding tesseract"})
    assert r.status_code == 422
    assert "near-black" in r.json()["detail"]


def test_extract_nvidia_warnings():
    from app.image_quality import extract_nvidia_warnings

    warns = extract_nvidia_warnings(
        {
            "artifacts": [{"finishReason": "SAFETY", "base64": "xx"}],
            "warning": "filtered",
        }
    )
    assert any("SAFETY" in w for w in warns)
    assert any("filtered" in w for w in warns)


def test_blank_reject_deletes_b2_keys(monkeypatch):
    """Rejected blank stills must best-effort delete asset + manifest from B2."""
    import io
    from unittest.mock import MagicMock

    from PIL import Image

    from app.pipeline import GenerationQualityError, GenerateResult, generate_image

    buf = io.BytesIO()
    Image.new("RGB", (1024, 1024), (0, 0, 0)).save(buf, format="JPEG", quality=90)
    blank_jpeg = buf.getvalue()

    settings = _offline_settings(
        nvidia_api_key="nvapi-test",
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
    )

    gen = GenerateResult(
        run_id="run-blank",
        prompt="person with tesseract",
        model=settings.image_model,
        provider="nvidia-image",
        status="ok",
        asset_key="genblaze-media/x/blank.jpg",
        manifest_key="genblaze-media/x/manifest.json",
        asset_sha256="abc",
        preview_url=None,
        created_at="2026-01-01T00:00:00+00:00",
        dry_run=False,
    )

    deleted: list[str] = []

    def fake_run_live_once(**_kwargs):
        return gen, blank_jpeg, []

    def fake_delete_keys(_settings, *keys):
        deleted.extend([k for k in keys if k])

    mock_http = MagicMock()
    mock_http.close = MagicMock()

    monkeypatch.setattr("app.pipeline._run_live_once", fake_run_live_once)
    monkeypatch.setattr("app.pipeline._best_effort_delete_keys", fake_delete_keys)
    monkeypatch.setattr(
        "app.pipeline._nvidia_output_dir",
        lambda: __import__("pathlib").Path(__import__("tempfile").mkdtemp()),
    )
    monkeypatch.setattr(
        "app.nvidia_http.build_nvidia_genai_client",
        lambda *_a, **_k: mock_http,
    )

    with pytest.raises(GenerationQualityError):
        generate_image(settings, "person with tesseract")

    assert "genblaze-media/x/blank.jpg" in deleted
    assert "genblaze-media/x/manifest.json" in deleted
    mock_http.close.assert_called_once()


def test_run_live_once_does_not_close_injected_http_client(monkeypatch, tmp_path):
    """Shared httpx client must survive per-attempt cleanup for sanitize retries."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from app.pipeline import _run_live_once

    settings = _offline_settings(
        nvidia_api_key="nvapi-test",
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
    )

    http_client = MagicMock()
    backend = MagicMock()
    backend.close = MagicMock()
    backend.get_url = MagicMock(side_effect=Exception("no presign"))
    backend.presigned_get = MagicMock(side_effect=Exception("no presign"))

    out = tmp_path / "attempt-0"
    out.mkdir()
    (out / "still.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)

    asset = SimpleNamespace(
        url=f"https://s3.example/{settings.b2_bucket}/genblaze-media/k.png",
        sha256="deadbeef",
    )
    step = SimpleNamespace(assets=[asset], error=None, provider_payload=None)
    run = SimpleNamespace(run_id="r1", steps=[step])
    result = SimpleNamespace(run=run, manifest=SimpleNamespace(manifest_uri=None))

    class FakePipeline:
        def __init__(self, _name):
            pass

        def step(self, *_a, **_k):
            return self

        def run(self, **_k):
            return result

    class FakeProvider:
        def __init__(self, **_kwargs):
            pass

        def close(self):
            # Old bug: pipeline called provider.close() which could tear down
            # a shared httpx client. Current code must not invoke this.
            http_client.close()

    monkeypatch.setattr("app.pipeline.build_backend", lambda _s: backend)
    monkeypatch.setattr("genblaze_core.Pipeline", FakePipeline)
    monkeypatch.setattr(
        "genblaze_core.ObjectStorageSink",
        lambda *a, **k: MagicMock(_transfer=None),
    )
    monkeypatch.setattr("genblaze_nvidia.NvidiaImageProvider", FakeProvider)

    timeouts = SimpleNamespace(
        http_timeout=1.0,
        nvcf_timeout=1.0,
        pipeline_timeout=1,
    )

    # Call twice with the same client — must not close between attempts.
    for _ in range(2):
        gen, _bytes, _warns = _run_live_once(
            settings=settings,
            prompt="cyan cube",
            timeouts=timeouts,
            http_client=http_client,
            output_dir=out,
        )
        assert gen.status == "ok"

    http_client.close.assert_not_called()
    assert backend.close.call_count == 2


def test_soft_safety_warning_keeps_usable_still(monkeypatch):
    """Soft warning tokens must not discard a non-blank image."""
    import io
    from unittest.mock import MagicMock

    from PIL import Image

    from app.pipeline import GenerateResult, generate_image

    buf = io.BytesIO()
    Image.new("RGB", (256, 256), (40, 120, 200)).save(buf, format="PNG")
    good_png = buf.getvalue()

    settings = _offline_settings(
        nvidia_api_key="nvapi-test",
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
    )
    gen = GenerateResult(
        run_id="run-ok",
        prompt="cyan cube",
        model=settings.image_model,
        provider="nvidia-image",
        status="ok",
        asset_key="genblaze-media/x/ok.png",
        manifest_key=None,
        asset_sha256="abc",
        preview_url=None,
        created_at="2026-01-01T00:00:00+00:00",
        dry_run=False,
    )
    deleted: list[str] = []
    mock_http = MagicMock()

    monkeypatch.setattr(
        "app.pipeline._run_live_once",
        lambda **_k: (gen, good_png, ["safety filter note: low risk"]),
    )
    monkeypatch.setattr(
        "app.pipeline._best_effort_delete_keys",
        lambda _s, *keys: deleted.extend([k for k in keys if k]),
    )
    monkeypatch.setattr(
        "app.pipeline._nvidia_output_dir",
        lambda: __import__("pathlib").Path(__import__("tempfile").mkdtemp()),
    )
    monkeypatch.setattr(
        "app.nvidia_http.build_nvidia_genai_client",
        lambda *_a, **_k: mock_http,
    )

    out = generate_image(settings, "cyan cube")
    assert out.status == "ok"
    assert out.quality and out.quality["ok"] is True
    assert deleted == []
    assert "nvidia warnings" in (out.detail or "")
    mock_http.close.assert_called_once()


def test_sanitize_first_attempt_uses_cleaned_prompt(monkeypatch):
    from unittest.mock import MagicMock

    from app.pipeline import GenerateResult, generate_image

    settings = _offline_settings(
        nvidia_api_key="nvapi-test",
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
    )
    seen: list[str] = []

    def fake_run(**kwargs):
        seen.append(kwargs["prompt"])
        gen = GenerateResult(
            run_id="r",
            prompt=kwargs["prompt"],
            model=settings.image_model,
            provider="nvidia-image",
            status="ok",
            asset_key=None,
            manifest_key=None,
            asset_sha256=None,
            preview_url=None,
            created_at="2026-01-01T00:00:00+00:00",
            dry_run=False,
        )
        # bytes unavailable → skip quality, return ok
        return gen, None, []

    mock_http = MagicMock()
    monkeypatch.setattr("app.pipeline._run_live_once", fake_run)
    monkeypatch.setattr(
        "app.pipeline._nvidia_output_dir",
        lambda: __import__("pathlib").Path(__import__("tempfile").mkdtemp()),
    )
    monkeypatch.setattr(
        "app.nvidia_http.build_nvidia_genai_client",
        lambda *_a, **_k: mock_http,
    )

    raw = "A glowing cyan 4D tesseract on a table. Ok this not good."
    generate_image(settings, raw)
    assert len(seen) == 1
    assert "not good" not in seen[0].lower()
    assert "tesseract" in seen[0].lower()
    mock_http.close.assert_called_once()


def test_best_effort_delete_keys_calls_backend_delete(monkeypatch):
    from unittest.mock import MagicMock

    from app.pipeline import _best_effort_delete_keys

    settings = _offline_settings(
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
    )
    backend = MagicMock()
    monkeypatch.setattr("app.pipeline.build_backend", lambda _s: backend)
    _best_effort_delete_keys(settings, "a.jpg", None, "m.json")
    assert backend.delete.call_count == 2
    backend.delete.assert_any_call("a.jpg")
    backend.delete.assert_any_call("m.json")
    backend.close.assert_called_once()
