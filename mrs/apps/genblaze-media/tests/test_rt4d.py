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
    RT4D_SETUP_HELP,
    RT4DRenderError,
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
        "scene": "tesseract-lattice",
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
    assert result.provenance["scene"] == "tesseract-lattice"
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
    detail = r.json()["detail"]
    assert detail == RT4D_SETUP_HELP
    assert "Node" in detail or "render-still" in detail


def test_rt4d_cli_nonzero_exit_returns_502_not_setup(tmp_path, monkeypatch):
    """Present CLI that crashes must be generation failure (502), not setup (503)."""
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script))

    def fake_run(argv, **kwargs):
        assert "--" in argv  # end-of-options separator before flags
        return MagicMock(returncode=1, stdout="", stderr="trace: boom\n")

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "anything", "embed": False})
    assert r.status_code == 502, r.text
    detail = r.json()["detail"]
    assert RT4D_SETUP_HELP not in detail
    assert "redeploy" not in detail.lower()
    assert "CLI failed" in detail or "exit 1" in detail
    # Operator needs the renderer's own stderr, not setup boilerplate.
    assert "trace: boom" in detail


def test_rt4d_cli_timeout_returns_502_not_setup(tmp_path, monkeypatch):
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script), rt4d_timeout_seconds=12.0)

    def fake_run(*_a, **_k):
        raise subprocess.TimeoutExpired(cmd="node", timeout=12.0)

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "anything", "embed": False})
    assert r.status_code == 502, r.text
    detail = r.json()["detail"]
    assert RT4D_SETUP_HELP not in detail
    assert "timed out" in detail.lower()


def test_rt4d_render_error_is_not_runtime_error():
    """Regression: render failures must not subclass RuntimeError (would become 503)."""
    err = RT4DRenderError("CLI failed")
    assert isinstance(err, Exception)
    assert not isinstance(err, RuntimeError)


def test_rt4d_missing_script_returns_503(tmp_path, monkeypatch):
    """Node present but render-still.mjs absent is a real setup gap → 503."""
    settings = _settings(rt4d_script_path=str(tmp_path / "absent" / "render-still.mjs"))
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "anything", "embed": False})
    assert r.status_code == 503, r.text
    assert r.json()["detail"] == RT4D_SETUP_HELP


def test_rt4d_node_vanishes_at_exec_returns_503(tmp_path, monkeypatch):
    """FileNotFoundError on exec means the node binary is gone → setup, not render."""
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script))

    def fake_run(*_a, **_k):
        raise FileNotFoundError(2, "No such file or directory: 'node'")

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "anything", "embed": False})
    assert r.status_code == 503, r.text
    assert r.json()["detail"] == RT4D_SETUP_HELP


def test_rt4d_exit_zero_without_png_returns_502_not_setup(tmp_path, monkeypatch):
    """Exit 0 but no PNG means the render failed, not that the CLI is missing."""
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script))

    def fake_run(_argv, **_kwargs):
        # Successful-looking invocation that never writes --output.
        return MagicMock(
            returncode=0,
            stdout=json.dumps({"kind": "deterministic-procedural-4d-render"}) + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    r = client.post("/api/generate", json={"prompt": "anything", "embed": False})
    assert r.status_code == 502, r.text
    detail = r.json()["detail"]
    assert RT4D_SETUP_HELP not in detail
    assert "redeploy" not in detail.lower()
    assert "no output file" in detail


def test_rt4d_render_failures_raise_render_error_directly(tmp_path, monkeypatch):
    """Provider-level: nonzero exit raises RT4DRenderError, never RuntimeError."""
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script))

    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run",
        lambda _argv, **_k: MagicMock(returncode=3, stdout="", stderr="segfault\n"),
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    with pytest.raises(RT4DRenderError) as excinfo:
        generate_image_rt4d(settings, "anything")
    message = str(excinfo.value)
    assert "exit 3" in message
    assert "segfault" in message
    assert RT4D_SETUP_HELP not in message


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
    assert result.provenance["scene"] == "tesseract-lattice"
    assert result.provenance["palette"] == "neon"
    assert (result.quality.get("mean_luminance") or 0) > 8


def _capture_argv_run(png: bytes, sha: str, seen: dict):
    def fake_run(argv, **_kwargs):
        seen["argv"] = list(argv)
        Path(argv[argv.index("--output") + 1]).write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-procedural-4d-render",
                    "scene": "torus-ring",
                    "seed": 1,
                    "sha256": sha,
                    "mean_luminance": 60.0,
                }
            )
            + "\n",
            stderr="",
        )

    return fake_run


def _argv_value(argv: list[str], flag: str) -> str:
    return argv[argv.index(flag) + 1]


def test_generate_defaults_to_draft_and_caps_final_profile(tmp_path, monkeypatch):
    """Regression: the RT4D still must not run the full RT4D_* profile by default.

    The deployed free-tier service returned 502 "RT4D render timed out after
    180s" because /api/generate always rendered 448x448/20 samples. Draft is the
    default and caps the profile, so the CLI receives the draft geometry.
    """
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(
        rt4d_script_path=str(script),
        rt4d_width=448,
        rt4d_height=448,
        rt4d_samples=20,
        rt4d_max_depth=5,
        b2_key_id=None,
        b2_app_key=None,
    )
    seen: dict = {}
    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run", _capture_argv_run(png, sha, seen)
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    result = generate_image_rt4d(settings, "mandala neural lattice")
    argv = seen["argv"]
    assert _argv_value(argv, "--width") == "256"
    assert _argv_value(argv, "--height") == "256"
    assert _argv_value(argv, "--samples") == "4"
    assert _argv_value(argv, "--max-depth") == "3"
    assert result.provenance["quality"] == "draft"
    assert result.provenance["requested_output"]["samples"] == 4


def test_generate_final_quality_uses_full_rt4d_profile(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(
        rt4d_script_path=str(script),
        rt4d_width=448,
        rt4d_height=448,
        rt4d_samples=20,
        rt4d_max_depth=5,
        # Explicit opt-in: without this, deploy-safe clamp would cap to 256/8.
        rt4d_allow_heavy=True,
        b2_key_id=None,
        b2_app_key=None,
    )
    seen: dict = {}
    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run", _capture_argv_run(png, sha, seen)
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    result = generate_image_rt4d(settings, "mandala", quality="final")
    argv = seen["argv"]
    assert _argv_value(argv, "--width") == "448"
    assert _argv_value(argv, "--samples") == "20"
    assert result.provenance["quality"] == "final"
    assert "budget_clamp" not in result.provenance


def test_draft_preserves_a_profile_smaller_than_the_cap(tmp_path, monkeypatch):
    """Draft caps; it must not enlarge an already-small RT4D_* profile."""
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script), b2_key_id=None, b2_app_key=None)
    seen: dict = {}
    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run", _capture_argv_run(png, sha, seen)
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    generate_image_rt4d(settings, "mandala")
    argv = seen["argv"]
    # _settings() defaults are 64x48 / 4 samples — below the 256/4 draft cap.
    assert _argv_value(argv, "--width") == "64"
    assert _argv_value(argv, "--height") == "48"


def test_generate_final_clamps_misconfigured_env_without_allow_heavy(
    tmp_path, monkeypatch
):
    """Unsynced RT4D_*=448/20 must not reach the CLI on the Generate path."""
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(
        rt4d_script_path=str(script),
        rt4d_width=448,
        rt4d_height=448,
        rt4d_samples=20,
        rt4d_max_depth=5,
        rt4d_allow_heavy=False,
        b2_key_id=None,
        b2_app_key=None,
    )
    seen: dict = {}
    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run", _capture_argv_run(png, sha, seen)
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    result = generate_image_rt4d(settings, "plain neural lattice", quality="final")
    argv = seen["argv"]
    assert _argv_value(argv, "--width") == "256"
    assert _argv_value(argv, "--height") == "256"
    assert _argv_value(argv, "--samples") == "8"
    assert result.provenance["budget_clamp"]["applied"] is True
    assert result.provenance["budget_clamp"]["before"]["samples"] == 20


def test_generate_dense_lattice_clamps_final_samples_further(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(
        rt4d_script_path=str(script),
        rt4d_width=448,
        rt4d_height=448,
        rt4d_samples=20,
        rt4d_max_depth=5,
        rt4d_allow_heavy=False,
        b2_key_id=None,
        b2_app_key=None,
    )
    seen: dict = {}
    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run", _capture_argv_run(png, sha, seen)
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    result = generate_image_rt4d(
        settings, "neon mandala tesseract lattice", quality="final"
    )
    argv = seen["argv"]
    assert _argv_value(argv, "--width") == "256"
    assert _argv_value(argv, "--samples") == "6"
    clamp = result.provenance["budget_clamp"]
    assert clamp["dense_scene"] is True
    assert clamp["after"]["samples"] == 6
    assert any("dense-scene" in r for r in clamp["reasons"])


def test_api_generate_forwards_quality_to_rt4d(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(
        rt4d_script_path=str(script),
        rt4d_width=448,
        rt4d_height=448,
        rt4d_samples=20,
        rt4d_max_depth=5,
        # Allow heavy so quality=final can prove it forwards the full profile.
        rt4d_allow_heavy=True,
    )
    seen: dict = {}
    monkeypatch.setattr(
        "app.rt4d_provider.subprocess.run", _capture_argv_run(png, sha, seen)
    )
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)

    r = client.post("/api/generate", json={"prompt": "mandala", "embed": False})
    assert r.status_code == 200, r.text
    assert _argv_value(seen["argv"], "--samples") == "4"

    r = client.post(
        "/api/generate",
        json={"prompt": "mandala", "embed": False, "quality": "final"},
    )
    assert r.status_code == 200, r.text
    assert _argv_value(seen["argv"], "--samples") == "20"


def test_health_discloses_effective_generate_render_size(tmp_path, monkeypatch):
    """Operators must be able to see what /api/generate will actually render."""
    settings = _settings(
        rt4d_width=448, rt4d_height=448, rt4d_samples=20, rt4d_max_depth=5
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    rt4d = client.get("/health").json()["rt4d"]
    assert rt4d["quality_default"] == "draft"
    assert rt4d["effective_default"] == {
        "width": 256,
        "height": 256,
        "samples": 4,
        "maxDepth": 3,
    }
    assert rt4d["quality_presets"]["final"]["samples"] == 20
    assert rt4d["allow_heavy"] is False


def test_rt4d_prompt_starting_with_dashes_passed_to_cli(tmp_path, monkeypatch):
    """Prompt values that look like flags must still reach the CLI as --prompt's value."""
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    script = tmp_path / "render-still.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    settings = _settings(rt4d_script_path=str(script), b2_key_id=None, b2_app_key=None)
    weird = "--weird-keyword-tesseract"
    seen = {}

    def fake_run(argv, **kwargs):
        seen["argv"] = list(argv)
        out_path = Path(argv[argv.index("--output") + 1])
        out_path.write_bytes(png)
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "kind": "deterministic-procedural-4d-render",
                    "scene": "tesseract-lattice",
                    "seed": 1,
                    "sha256": sha,
                    "mean_luminance": 60.0,
                }
            )
            + "\n",
            stderr="",
        )

    monkeypatch.setattr("app.rt4d_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.rt4d_provider._find_node", lambda _p: "node")

    result = generate_image_rt4d(settings, weird)
    assert result.status == "ok"
    argv = seen["argv"]
    prompt_idx = argv.index("--prompt")
    assert argv[prompt_idx + 1] == weird
    assert "--" in argv
    assert argv.index("--") < prompt_idx