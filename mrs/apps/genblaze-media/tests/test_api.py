"""Health and dry-run smoke tests (no live NVIDIA / B2 required)."""

from __future__ import annotations

import os
from pathlib import Path

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
        video_model="nvidia/cosmos-1.0-7b-diffusion-text2world",
        video_enabled=True,
        embed_model="nvidia/nv-embedcode-7b-v1",
        embed_url="https://integrate.api.nvidia.com/v1/embeddings",
        embed_timeout_seconds=60.0,
        store_full_embeddings=True,
        presign_expires_seconds=3600,
        dry_run=True,
        b2_probe_on_health=False,
        abstract_retry_on_blank=True,
        dotenv_loaded=(),
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(autouse=True)
def _isolate_preview_cache(tmp_path, monkeypatch):
    """Keep preview-cache writes out of the repo working tree during tests.

    ``generate_image`` (dry-run and mocked-live) caches stills via
    ``preview_cache.cache_dir``, which defaults under the app's ``data/`` dir.
    Redirect it to a per-test temp dir so running the suite never leaves stray
    image files in the repository.
    """
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))


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
    assert body["video_model"] == "nvidia/cosmos-1.0-7b-diffusion-text2world"
    assert body["video_enabled"] is True
    assert body["video_available"] is True  # dry-run + enabled
    assert body["cmm_id"] == "CMM-NIM-Cosmos-v1.0"
    assert body["domain_id"] == "CH-GNMD-v1.0"
    assert "video_timeouts" in body
    assert body["video_timeouts"]["pipeline_seconds"] >= 600


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


def test_video_model_env_default_is_cosmos_1_0_7b(monkeypatch):
    from app import config

    monkeypatch.setattr(config, "_load_dotenv_files", lambda: [])
    monkeypatch.delenv("GENBLAZE_VIDEO_MODEL", raising=False)
    settings = config.get_settings()
    assert settings.video_model == "nvidia/cosmos-1.0-7b-diffusion-text2world"


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
    # Same-origin preview cache so UI does not need B2 GET.
    assert body.get("preview_url", "").startswith("/api/preview/")
    run_id = body["run_id"]
    prev = client.get(f"/api/preview/{run_id}")
    assert prev.status_code == 200
    assert prev.headers["content-type"].startswith("image/")
    assert len(prev.content) > 0


def test_assets_after_generate(client):
    client.post("/api/generate", json={"prompt": "listed asset"})
    r = client.get("/api/assets")
    assert r.status_code == 200
    assets = r.json()["assets"]
    assert len(assets) >= 1
    assert assets[0]["prompt"] == "listed asset"
    assert assets[0].get("preview_source") == "local-cache"
    assert assets[0]["preview_url"].startswith("/api/preview/")


def test_generate_stores_cloud_url_not_local_path(client):
    """Index must retain cloud/None preview_url; local swap is response-only."""
    from app import main as main_mod

    r = client.post("/api/generate", json={"prompt": "index keeps cloud url"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("preview_url", "").startswith("/api/preview/")
    assert body.get("preview_source") == "local-cache"

    stored = main_mod._index.list_recent(1)[0]
    stored_url = stored.get("preview_url")
    assert stored_url is None or not str(stored_url).startswith("/api/preview/")


def test_assets_falls_back_to_stored_b2_when_cache_missing(client, tmp_path):
    """After prune/restart, stored B2 URL must still drive preview_source."""
    from app import main as main_mod
    from app.preview_cache import get_preview_path, put_preview

    run_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    b2_url = "https://s3.us-east-005.backblazeb2.com/bucket/key.png?X-Amz-Signature=test"
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
        "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )
    assert put_preview(main_mod.APP_DIR, run_id, png) is not None
    main_mod._index.prepend(
        {
            "run_id": run_id,
            "prompt": "fallback still",
            "preview_url": b2_url,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
    )

    with_cache = client.get("/api/assets").json()["assets"][0]
    assert with_cache["preview_source"] == "local-cache"
    assert with_cache["preview_url"] == f"/api/preview/{run_id}"

    cached = get_preview_path(main_mod.APP_DIR, run_id)
    assert cached is not None
    cached.unlink()

    without = client.get("/api/assets").json()["assets"][0]
    assert without["preview_source"] == "b2-presign"
    assert without["preview_url"] == b2_url
    # Index entry must still hold the cloud URL (never replaced by local path).
    assert main_mod._index.list_recent(1)[0]["preview_url"] == b2_url


def test_preview_cache_helpers(tmp_path):
    from app.preview_cache import get_preview_path, local_preview_url, put_preview

    run_id = "11111111-1111-1111-1111-111111111111"
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
        "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )
    assert put_preview(tmp_path, run_id, png) is not None
    assert get_preview_path(tmp_path, run_id) is not None
    assert local_preview_url(run_id) == f"/api/preview/{run_id}"


def test_preview_cache_guesses_webm_and_mov(tmp_path):
    """Non-MP4 clips must cache with playable extensions + Content-Type."""
    from app.preview_cache import _guess_ext, get_preview_path, media_type_for_path, put_preview

    webm_id = "22222222-2222-2222-2222-222222222222"
    # EBML header (WebM/Matroska)
    webm = b"\x1aE\xdf\xa3" + b"\x00" * 32
    assert _guess_ext(webm) == ".webm"
    path = put_preview(tmp_path, webm_id, webm)
    assert path is not None
    assert path.suffix == ".webm"
    assert get_preview_path(tmp_path, webm_id) == path
    assert media_type_for_path(path) == "video/webm"

    mov_id = "33333333-3333-3333-3333-333333333333"
    # ISO BMFF with QuickTime major brand
    mov = (
        (28).to_bytes(4, "big")
        + b"ftyp"
        + b"qt  "
        + (0).to_bytes(4, "big")
        + b"qt  "
        + b"\x00" * 16
    )
    assert _guess_ext(mov) == ".mov"
    path_mov = put_preview(tmp_path, mov_id, mov)
    assert path_mov is not None
    assert path_mov.suffix == ".mov"
    assert media_type_for_path(path_mov) == "video/quicktime"

    mp4_id = "44444444-4444-4444-4444-444444444444"
    mp4 = (
        (24).to_bytes(4, "big")
        + b"ftyp"
        + b"isom"
        + (0).to_bytes(4, "big")
        + b"isom"
        + b"\x00" * 8
    )
    assert _guess_ext(mp4) == ".mp4"
    assert put_preview(tmp_path, mp4_id, mp4).suffix == ".mp4"


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
        abstract_retry_on_blank=False,
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


def test_abstract_rewrite_helpers():
    from app.prompt_rewrite import looks_like_people_prompt, rewrite_as_abstract_geometry

    assert looks_like_people_prompt("a woman holding a glowing tesseract")
    assert not looks_like_people_prompt("neon mandala tesseract wireframe")
    rewritten = rewrite_as_abstract_geometry("photoreal person with a cyan tesseract")
    assert "person" not in rewritten.lower()
    assert "tesseract" in rewritten.lower()
    assert "no faces" in rewritten.lower() or "no people" in rewritten.lower()


def test_blank_people_prompt_retries_abstract(monkeypatch):
    """Near-black people still → one abstract rewrite attempt that can succeed."""
    import io
    from unittest.mock import MagicMock

    from PIL import Image

    from app.pipeline import GenerateResult, generate_image

    blank_buf = io.BytesIO()
    Image.new("RGB", (1024, 1024), (0, 0, 0)).save(blank_buf, format="JPEG", quality=90)
    blank_jpeg = blank_buf.getvalue()

    ok_buf = io.BytesIO()
    Image.new("RGB", (256, 256), (40, 180, 220)).save(ok_buf, format="PNG")
    ok_png = ok_buf.getvalue()

    settings = _offline_settings(
        nvidia_api_key="nvapi-test",
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
        abstract_retry_on_blank=True,
    )

    seen_prompts: list[str] = []
    call_n = {"n": 0}

    def fake_run_live_once(**kwargs):
        call_n["n"] += 1
        seen_prompts.append(kwargs["prompt"])
        if call_n["n"] == 1:
            gen = GenerateResult(
                run_id="run-1",
                prompt=kwargs["prompt"],
                model=settings.image_model,
                provider="nvidia-image",
                status="ok",
                asset_key="genblaze-media/x/blank.jpg",
                manifest_key="genblaze-media/x/blank-manifest.json",
                asset_sha256="abc",
                preview_url=None,
                created_at="2026-01-01T00:00:00+00:00",
                dry_run=False,
            )
            return gen, blank_jpeg, []
        gen = GenerateResult(
            run_id="run-2",
            prompt=kwargs["prompt"],
            model=settings.image_model,
            provider="nvidia-image",
            status="ok",
            asset_key="genblaze-media/x/ok.png",
            manifest_key="genblaze-media/x/ok-manifest.json",
            asset_sha256="def",
            preview_url=None,
            created_at="2026-01-01T00:00:00+00:00",
            dry_run=False,
        )
        return gen, ok_png, []

    mock_http = MagicMock()
    mock_http.close = MagicMock()
    monkeypatch.setattr("app.pipeline._run_live_once", fake_run_live_once)
    monkeypatch.setattr("app.pipeline._best_effort_delete_keys", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "app.pipeline._nvidia_output_dir",
        lambda: __import__("pathlib").Path(__import__("tempfile").mkdtemp()),
    )
    monkeypatch.setattr(
        "app.nvidia_http.build_nvidia_genai_client",
        lambda *_a, **_k: mock_http,
    )

    result = generate_image(settings, "photoreal woman holding a cyan tesseract")
    assert call_n["n"] == 2
    assert "woman" in seen_prompts[0].lower()
    assert "person" not in seen_prompts[1].lower()
    assert "woman" not in seen_prompts[1].lower()
    assert "abstract geometry retry" in (result.detail or "")
    # The raw prompt had no trailing commentary, so the abstract rewrite must not
    # be mislabeled as "meta-commentary stripped" (note or flag).
    assert result.prompt_sanitized is False
    assert "meta-commentary stripped" not in (result.detail or "")
    assert result.asset_key == "genblaze-media/x/ok.png"
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

def test_generate_video_dry_run(client):
    r = client.post("/api/generate-video", json={"prompt": "unit test cosmos world"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["modality"] == "video"
    assert body["dry_run"] is True
    assert body["run_id"]
    assert body["asset_key"]
    assert body["manifest_key"]
    assert body["asset_sha256"]
    assert body.get("preview_url")
    # Dry-run does not invent duration/resolution.
    assert "duration_seconds" not in body
    assert "resolution" not in body
    run_id = body["run_id"]
    prev = client.get(f"/api/preview/{run_id}")
    assert prev.status_code == 200
    assert "video" in prev.headers.get("content-type", "")
    assert len(prev.content) > 0


def test_generate_video_stores_cloud_url_not_local_path(client):
    """Index must retain synthetic/cloud preview_url; local swap is response-only."""
    from app import main as main_mod

    r = client.post("/api/generate-video", json={"prompt": "index keeps cloud video url"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("preview_url", "").startswith("/api/preview/")
    assert body.get("preview_source") == "local-cache"

    stored = main_mod._index.list_recent(1)[0]
    stored_url = stored.get("preview_url")
    assert stored_url is not None
    assert not str(stored_url).startswith("/api/preview/")
    assert stored.get("modality") == "video"


def test_generate_video_requires_nvidia_when_not_dry(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(
            nvidia_api_key=None,
            b2_key_id="id",
            b2_app_key="key",
            b2_bucket="bucket",
            dry_run=False,
            video_enabled=True,
        ),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent-video.json")
    c = TestClient(app)
    r = c.post("/api/generate-video", json={"prompt": "should fail"})
    assert r.status_code == 503
    assert "NVIDIA_API_KEY" in r.json()["detail"]


def test_generate_video_disabled(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _offline_settings(video_enabled=False, dry_run=True),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent-video-off.json")
    c = TestClient(app)
    r = c.post("/api/generate-video", json={"prompt": "disabled"})
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert "VIDEO_ENABLED" in detail or "disabled" in detail.lower()


def test_video_model_validation_refreshes_upstream_probe():
    from types import SimpleNamespace

    from app.pipeline_video import _validate_video_model

    calls = []

    class Provider:
        def validate_model(self, model, *, refresh=False):
            calls.append((model, refresh))
            return SimpleNamespace(is_terminal_failure=False, detail=None)

    model = "nvidia/cosmos-1.0-7b-diffusion-text2world"
    _validate_video_model(Provider(), model)
    assert calls == [(model, True)]


def test_rejected_video_deletes_b2_keys(monkeypatch):
    """Unusable video clips must best-effort delete asset + manifest from B2."""
    from unittest.mock import MagicMock

    from app.pipeline import GenerationQualityError
    from app.pipeline_video import VideoGenerateResult, generate_video

    settings = _offline_settings(
        nvidia_api_key="nvapi-test",
        b2_key_id="id",
        b2_app_key="key",
        b2_bucket="bucket",
        dry_run=False,
        video_enabled=True,
    )

    gen = VideoGenerateResult(
        run_id="run-bad-video",
        prompt="neon grid world",
        model=settings.video_model,
        provider="nvidia-video",
        status="ok",
        asset_key="genblaze-media/x/bad.mp4",
        manifest_key="genblaze-media/x/bad-manifest.json",
        asset_sha256="abc",
        preview_url=None,
        created_at="2026-01-01T00:00:00+00:00",
        dry_run=False,
        modality="video",
    )
    # Too small / no ftyp → assess_video_bytes fails.
    junk = b"not-a-video"

    deleted: list[str] = []

    def fake_run_live_video(**_kwargs):
        return gen, junk

    def fake_delete_keys(_settings, *keys):
        deleted.extend([k for k in keys if k])

    mock_http = MagicMock()
    mock_http.close = MagicMock()

    monkeypatch.setattr("app.pipeline_video._run_live_video", fake_run_live_video)
    monkeypatch.setattr("app.pipeline_video._best_effort_delete_keys", fake_delete_keys)
    monkeypatch.setattr(
        "app.pipeline_video._nvidia_output_dir",
        lambda: __import__("pathlib").Path(__import__("tempfile").mkdtemp()),
    )
    monkeypatch.setattr(
        "app.nvidia_http.build_nvidia_genai_client",
        lambda *_a, **_k: mock_http,
    )

    with pytest.raises(GenerationQualityError):
        generate_video(settings, "neon grid world")

    assert "genblaze-media/x/bad.mp4" in deleted
    assert "genblaze-media/x/bad-manifest.json" in deleted
    mock_http.close.assert_called_once()


def test_assets_modality_filter(client):
    client.post("/api/generate", json={"prompt": "still asset"})
    client.post("/api/generate-video", json={"prompt": "video asset"})
    all_assets = client.get("/api/assets").json()["assets"]
    assert all(a.get("modality") in {"image", "video"} for a in all_assets)
    videos = client.get("/api/assets?modality=video").json()["assets"]
    assert videos
    assert all(a["modality"] == "video" for a in videos)
    images = client.get("/api/assets?modality=image").json()["assets"]
    assert images
    assert all(a["modality"] == "image" for a in images)


def test_media_anchor_redirects(client):
    for path, dest in (
        ("/media/stills", "/#stills"),
        ("/media/nvidia", "/#stills"),
        ("/media/nim-cosmos", "/#nim-cosmos"),
    ):
        r = client.get(path, follow_redirects=False)
        assert r.status_code == 302
        assert r.headers["location"] == dest


def test_no_story_forge_imports():
    app_dir = Path(__file__).resolve().parents[1] / "app"
    offenders = []
    for path in app_dir.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "story_forge" in text:
            offenders.append(path.name)
    assert offenders == [], f"story_forge referenced in: {offenders}"


def test_video_dry_run_reports_modality_in_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["video_model"]
    assert body["video_enabled"] is True
    assert "video_timeouts" in body


def test_extract_optional_video_meta_never_invents():
    from types import SimpleNamespace

    from app.pipeline_video import _extract_optional_video_meta

    assert _extract_optional_video_meta(SimpleNamespace()) == (None, None)
    assert _extract_optional_video_meta(SimpleNamespace(provider_payload=None)) == (
        None,
        None,
    )
    assert _extract_optional_video_meta(
        SimpleNamespace(provider_payload={"unrelated": 1})
    ) == (None, None)
    d, res = _extract_optional_video_meta(
        SimpleNamespace(
            provider_payload={"duration_seconds": 4.0, "width": 1280, "height": 720}
        )
    )
    assert d == 4.0
    assert res == "1280x720"
