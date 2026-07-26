"""Tests for RT4D still → NVIDIA NIM vision (mocked; no live network)."""

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
from app.image_to_scene import interpret_image_to_scene
from app.main import app
from app.preview_cache import put_preview
from app.rt4d_to_nvidia import (
    RT4D_TO_NVIDIA_KIND,
    NvidiaUnavailableError,
    build_nvidia_vision_provenance,
    build_rt4d_to_nvidia_request,
    classify_nim_failure,
    raise_if_nvidia_required_unavailable,
    rt4d_to_nvidia_availability,
)


VALID_NIM_SPEC = {
    "schemaVersion": "1.0",
    "kind": "SceneSpecification",
    "id": "nim-from-rt4d",
    "materials": [{"id": "mat0", "color": "#7fd4d4", "opacity": 1, "wireframe": False}],
    "entities": [
        {
            "id": "primary",
            "materialId": "mat0",
            "geometry": {"kind": "surface", "surfaceId": "tesseract"},
        }
    ],
    "output": {"width": 64, "height": 48, "samples": 4, "maxDepth": 3, "seed": 1},
}


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
        scene_spec_script_path=str(scene_spec_default_script_path()),
        rt4d_width=64,
        rt4d_height=48,
        rt4d_samples=4,
        rt4d_max_depth=3,
        rt4d_timeout_seconds=120.0,
        image_to_scene_model="meta/llama-3.2-11b-vision-instruct",
        image_to_scene_chat_url="https://integrate.api.nvidia.com/v1/chat/completions",
        image_to_scene_timeout_seconds=60.0,
    )
    base.update(overrides)
    return Settings(**base)


def _tiny_png() -> bytes:
    try:
        from PIL import Image
        import io

        im = Image.new("RGB", (32, 24), (40, 200, 200))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        return bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55"
            "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
        )


def _nonblank_png_bytes(width: int = 64, height: int = 48) -> bytes:
    try:
        from PIL import Image
        import io

        im = Image.new("RGB", (width, height), (40, 120, 200))
        for x in range(10, 40):
            for y in range(10, 30):
                im.putpixel((x, y), (220, 80, 40))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        return _tiny_png()


def test_build_request_requires_run_id():
    with pytest.raises(ValueError, match="run_id"):
        build_rt4d_to_nvidia_request(run_id="")
    req = build_rt4d_to_nvidia_request(run_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    assert req["require_nvidia"] is True
    assert req["kind"] == RT4D_TO_NVIDIA_KIND
    assert req["capability"] == "nim-vision-image-to-scene"


def test_provenance_links_source_run_id():
    settings = _settings(nvidia_api_key="nvapi-test")
    prov = build_nvidia_vision_provenance(
        settings,
        source_run_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        image_sha256="abc123",
        scene_source="nim-vision",
        resolve_meta={"source": "preview_cache"},
    )
    assert prov["source_run_id"] == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    assert prov["nvidia_model"] == "meta/llama-3.2-11b-vision-instruct"
    assert "img2img" in prov["note"].lower() or "not img2img" in prov["note"].lower()
    assert prov["image_sha256"] == "abc123"


def test_classify_504():
    assert (
        classify_nim_failure('NVIDIA failed (504): {"_raw": ""}') == "upstream_504"
    )


def test_missing_key_raises_clear_error():
    settings = _settings(nvidia_api_key=None)
    with pytest.raises(NvidiaUnavailableError) as ei:
        raise_if_nvidia_required_unavailable(settings)
    assert ei.value.reason == "missing_key"
    assert "NVIDIA unavailable" in str(ei.value)


def test_interpret_require_nvidia_missing_key():
    settings = _settings(nvidia_api_key=None)
    with pytest.raises(NvidiaUnavailableError) as ei:
        interpret_image_to_scene(settings, _tiny_png(), require_nvidia=True)
    assert ei.value.reason == "missing_key"


def test_interpret_require_nvidia_504_no_heuristic():
    settings = _settings(nvidia_api_key="nvapi-test")

    def fake_post(url, headers=None, json=None, timeout=None):  # noqa: A002
        raise RuntimeError('NIM vision failed (504): {"_raw": ""}')

    with pytest.raises(NvidiaUnavailableError) as ei:
        interpret_image_to_scene(
            settings,
            _tiny_png(),
            require_nvidia=True,
            http_post=fake_post,
            validate_fn=lambda s: {"ok": True, "value": s},
        )
    assert ei.value.reason == "upstream_504"
    assert "NVIDIA unavailable" in str(ei.value)


def test_interpret_require_nvidia_success_mocked():
    settings = _settings(nvidia_api_key="nvapi-test")
    content = json.dumps(VALID_NIM_SPEC)

    def fake_post(url, headers=None, json=None, timeout=None):  # noqa: A002
        class R:
            def json(self_inner):
                return {"choices": [{"message": {"content": content}}]}

        return R()

    out = interpret_image_to_scene(
        settings,
        _tiny_png(),
        require_nvidia=True,
        http_post=fake_post,
        validate_fn=lambda s: {"ok": True, "value": s},
    )
    assert out["source"] == "nim-vision"
    assert out["spec"]["id"] == "nim-from-rt4d"


def test_availability_discloses_no_img2img():
    avail = rt4d_to_nvidia_availability(_settings(nvidia_api_key="nvapi-test"))
    assert avail["available"] is True
    assert avail["img2img_wired"] is False
    avail2 = rt4d_to_nvidia_availability(_settings(nvidia_api_key=None))
    assert avail2["available"] is False


def test_health_exposes_rt4d_to_nvidia(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    body = client.get("/health").json()
    assert "rt4d_to_nvidia" in body
    assert body["rt4d_to_nvidia"]["img2img_wired"] is False
    assert body["rt4d_to_nvidia"]["available"] is False


def test_api_rt4d_to_nvidia_missing_key(tmp_path, monkeypatch):
    run_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    png = _tiny_png()
    put_preview(tmp_path, run_id, png)

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(nvidia_api_key=None),
    )
    monkeypatch.setattr("app.main.APP_DIR", tmp_path)
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    main_mod.APP_DIR = tmp_path
    client = TestClient(app)
    resp = client.post(
        "/api/rt4d-to-nvidia",
        json={"run_id": run_id, "render": False},
    )
    assert resp.status_code == 503, resp.text
    detail = resp.json()["detail"]
    assert detail["nvidia_unavailable"] is True
    assert detail["reason"] == "missing_key"
    assert detail["source_run_id"] == run_id


def test_api_rt4d_to_nvidia_504(tmp_path, monkeypatch):
    run_id = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee"
    put_preview(tmp_path, run_id, _tiny_png())

    def boom(*_a, **_k):
        raise RuntimeError('NIM vision failed (504): {"_raw": ""}')

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(nvidia_api_key="nvapi-test"),
    )
    monkeypatch.setattr("app.image_to_scene.call_nim_vision", boom)
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    main_mod.APP_DIR = tmp_path
    client = TestClient(app)
    resp = client.post(
        "/api/rt4d-to-nvidia",
        json={"run_id": run_id, "render": False},
    )
    assert resp.status_code == 502, resp.text
    detail = resp.json()["detail"]
    assert detail["nvidia_unavailable"] is True
    assert detail["reason"] == "upstream_504"


def test_api_rt4d_to_nvidia_success_provenance(tmp_path, monkeypatch):
    run_id = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee"
    src = _tiny_png()
    put_preview(tmp_path, run_id, src)
    out_png = _nonblank_png_bytes()
    sha = hashlib.sha256(out_png).hexdigest()

    def fake_post(url, headers=None, json=None, timeout=None):  # noqa: A002
        class R:
            def json(self_inner):
                return {
                    "choices": [{"message": {"content": json.dumps(VALID_NIM_SPEC)}}]
                }

        # Ensure Authorization is present but never log the key.
        assert headers and "Authorization" in headers
        assert headers["Authorization"].startswith("Bearer ")
        return R()

    def fake_run(argv, **kwargs):
        if "--output" not in argv:
            return MagicMock(
                returncode=0,
                stdout=json.dumps({"ok": True, "value": {}}) + "\n",
                stderr="",
            )
        out_path = Path(argv[argv.index("--output") + 1])
        out_path.write_bytes(out_png)
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

    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    vscript = tmp_path / "validate-scene-spec.mjs"
    vscript.write_text("// stub\n", encoding="utf-8")

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(
            nvidia_api_key="nvapi-test",
            scene_spec_script_path=str(script),
            validate_scene_spec_script_path=str(vscript),
        ),
    )
    monkeypatch.setattr("app.image_to_scene.call_nim_vision", lambda *a, **k: json.dumps(VALID_NIM_SPEC))
    monkeypatch.setattr(
        "app.image_to_scene.validate_spec_via_node",
        lambda *_a, **_k: {"ok": True, "value": VALID_NIM_SPEC},
    )
    monkeypatch.setattr("app.scene_spec_provider.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    main_mod.APP_DIR = tmp_path
    client = TestClient(app)
    resp = client.post(
        "/api/rt4d-to-nvidia",
        json={"run_id": run_id, "render": True, "quality": "draft"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "nim-vision"
    assert body["source_run_id"] == run_id
    assert body["nvidia_provenance"]["source_run_id"] == run_id
    assert body["nvidia_provenance"]["kind"] == RT4D_TO_NVIDIA_KIND
    assert body["render"]["asset_sha256"] == sha
    assert body["render"]["source_run_id"] == run_id
    assert body["render"]["kind"] == "rt4d-to-nvidia-mrs-full-frame"
    assert body["render"]["provenance"]["nvidia_vision"]["nvidia_model"]
