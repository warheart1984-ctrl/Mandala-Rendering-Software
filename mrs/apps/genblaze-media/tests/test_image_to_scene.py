"""Tests for Image → SceneSpecification → MRS full-frame path."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GENBLAZE_DRY_RUN", "1")

from app.config import Settings, scene_spec_default_script_path
from app.image_to_scene import (
    ANALYSIS_MODE,
    DISCLAIMER,
    apply_source_scene_bias,
    build_heuristic_scene_spec,
    extract_source_scene,
    interpret_image_to_scene,
    seed_from_sha256,
    surface_id_for_source_scene,
    validate_spec_via_node,
)
from app.main import app
from app.scene_spec_provider import SCENE_SPEC_PROVIDER_ID


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


def _tiny_png() -> bytes:
    try:
        from PIL import Image
        import io

        im = Image.new("RGB", (32, 24), (200, 40, 40))
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
                im.putpixel((x, y), (220, 180, 40))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        return _tiny_png()


VALID_NIM_SPEC = {
    "schemaVersion": "1.0",
    "kind": "SceneSpecification",
    "id": "nim-tess",
    "materials": [{"id": "m0", "color": "#c82828", "opacity": 1, "wireframe": False}],
    "entities": [
        {
            "id": "primary",
            "materialId": "m0",
            "geometry": {"kind": "surface", "surfaceId": "tesseract"},
        }
    ],
    "output": {"width": 64, "height": 48, "samples": 2, "seed": 11},
}


@pytest.fixture(autouse=True)
def _isolate_preview_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))


def test_seed_from_sha256_deterministic():
    a = seed_from_sha256("abcdef0123456789")
    b = seed_from_sha256("abcdef0123456789")
    assert a == b
    assert 0 <= a <= 0xFFFFFFFF


def test_heuristic_builder_validate_clean(tmp_path, monkeypatch):
    png = _tiny_png()
    sha = hashlib.sha256(png).hexdigest()
    from app.image_ingest import analyze_image_bytes

    analysis = analyze_image_bytes(png)
    spec = build_heuristic_scene_spec(analysis, image_sha256=sha)
    assert spec["schemaVersion"] == "1.0"
    assert spec["entities"][0]["geometry"]["kind"] == "surface"
    assert "meshRef" not in str(spec)
    assert spec["output"]["seed"] == seed_from_sha256(sha)
    assert spec["output"]["samples"] == 4
    assert spec["output"]["maxDepth"] == 3
    assert spec["output"]["width"] <= 256
    assert spec["output"]["height"] <= 256

    settings = _settings()
    # Prefer real Node SoT when available; else soft structural path.
    result = validate_spec_via_node(settings, spec)
    assert result.get("ok") is True, result


def test_interpret_force_heuristic_disclaimer():
    png = _tiny_png()
    settings = _settings()
    out = interpret_image_to_scene(settings, png, force_heuristic=True)
    assert out["source"] == "heuristic-fallback"
    assert out["analysis_mode"] == ANALYSIS_MODE
    assert "not" in out["note"].lower() and "reconstruction" in out["note"].lower()
    assert DISCLAIMER[:20] in out["note"]
    assert out["spec"]["entities"][0]["geometry"]["kind"] == "surface"


def test_interpret_mock_nim_valid():
    png = _tiny_png()
    settings = _settings(nvidia_api_key="nvapi-test")

    def fake_post(url, headers=None, json=None, timeout=None):
        class R:
            def json(self_inner):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": json_module_dumps(VALID_NIM_SPEC),
                            }
                        }
                    ]
                }

        return R()

    # Avoid name shadowing with json module
    def json_module_dumps(obj):
        return json.dumps(obj)

    def always_ok(spec):
        return {"ok": True, "value": spec}

    out = interpret_image_to_scene(
        settings,
        png,
        http_post=fake_post,
        validate_fn=always_ok,
    )
    assert out["source"] == "nim-vision"
    assert out["analysis_mode"] == ANALYSIS_MODE
    assert "reconstruction" in out["note"].lower()
    assert out["spec"]["id"] == "nim-tess"


def test_interpret_mock_nim_garbage_then_fallback():
    png = _tiny_png()
    settings = _settings(nvidia_api_key="nvapi-test")
    calls = {"n": 0}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls["n"] += 1

        class R:
            def json(self_inner):
                return {"choices": [{"message": {"content": "NOT JSON at all"}}]}

        return R()

    out = interpret_image_to_scene(
        settings,
        png,
        http_post=fake_post,
        validate_fn=lambda s: {"ok": True, "value": s},
    )
    assert out["source"] == "heuristic-fallback"
    assert calls["n"] >= 1
    assert out["nim_error"]


def test_interpret_capability_violation_fallback():
    png = _tiny_png()
    settings = _settings(nvidia_api_key="nvapi-test")
    bad = {
        **VALID_NIM_SPEC,
        "entities": [
            {
                "id": "bad",
                "geometry": {"kind": "meshRef", "meshRef": "foo.obj"},
            }
        ],
    }
    attempts = {"n": 0}

    def fake_post(url, headers=None, json=None, timeout=None):  # noqa: A002
        attempts["n"] += 1
        payload = json  # request body from caller

        class R:
            def json(self_inner):
                # Always return capability-violating meshRef so repair also fails.
                return {"choices": [{"message": {"content": json_lib.dumps(bad)}}]}

        _ = payload
        return R()

    import json as json_lib

    def validate(spec):
        geom = (spec.get("entities") or [{}])[0].get("geometry") or {}
        if geom.get("kind") == "meshRef":
            return {
                "ok": False,
                "errors": [
                    {
                        "path": "entities[0].geometry.kind",
                        "message": "RT4D still path does not support meshRef",
                    }
                ],
            }
        return {"ok": True, "value": spec}

    out = interpret_image_to_scene(
        settings,
        png,
        http_post=fake_post,
        validate_fn=validate,
    )
    assert out["source"] == "heuristic-fallback"
    assert attempts["n"] == 2  # initial + repair
    assert out["spec"]["entities"][0]["geometry"]["kind"] == "surface"


def test_health_exposes_image_to_scene(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    body = client.get("/health").json()
    assert isinstance(body["image_to_scene"], dict)
    assert body["image_to_scene"]["fallback"] == "heuristic"
    assert "reconstruction" not in json.dumps(body["image_to_scene"]).lower() or (
        "not" in body["image_to_scene"].get("note", "").lower()
    )
    assert "reconstruction" in body["image_to_scene_note"].lower()
    assert "NOT reconstruction" in body["image_to_scene_note"] or "not" in body[
        "image_to_scene_note"
    ].lower()


def test_api_image_to_scene_render_mocked(tmp_path, monkeypatch):
    png = _nonblank_png_bytes()
    sha = hashlib.sha256(png).hexdigest()
    src = _tiny_png()

    def fake_run(argv, **kwargs):
        # scene_spec_provider patches subprocess.run on the shared module;
        # also handle validate-scene-spec.mjs (no --output).
        if "--output" not in argv:
            return MagicMock(
                returncode=0,
                stdout=json.dumps({"ok": True, "value": {}}) + "\n",
                stderr="",
            )
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
    monkeypatch.setattr("app.image_to_scene.subprocess.run", fake_run)
    monkeypatch.setattr("app.scene_spec_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.image_to_scene._find_node", lambda _p: "node")
    script = tmp_path / "render-scene.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    vscript = tmp_path / "validate-scene-spec.mjs"
    vscript.write_text("// stub\n", encoding="utf-8")

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(
            scene_spec_script_path=str(script),
            validate_scene_spec_script_path=str(vscript),
        ),
    )
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    b64 = base64.b64encode(src).decode("ascii")
    resp = client.post(
        "/api/image-to-scene",
        json={"image_base64": b64, "render": True, "force_heuristic": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "heuristic-fallback"
    assert body["analysis_mode"] == ANALYSIS_MODE
    assert "reconstruction" in body["note"].lower()
    assert "not" in body["note"].lower()
    assert body["render"]["provider"] == SCENE_SPEC_PROVIDER_ID
    assert body["render"]["asset_sha256"] == sha
    assert "/image-to-scene/" in body["render"]["asset_key"]
    assert body["render"]["provenance"]["kind"].startswith("deterministic-scene-spec")


def test_api_image_to_scene_spec_only(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    from app import main as main_mod
    from app.index_store import AssetIndex

    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(app)
    b64 = base64.b64encode(_tiny_png()).decode("ascii")
    resp = client.post(
        "/api/image-to-scene",
        json={"image_base64": b64, "render": False, "force_heuristic": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "spec" in body
    assert body["spec"]["kind"] == "SceneSpecification"
    assert "render" not in body or body.get("render") is None
    assert body["analysis_mode"] == ANALYSIS_MODE


def test_source_scene_maps_tesseract_lattice():
    assert surface_id_for_source_scene("tesseract-lattice") == "tesseract"
    assert surface_id_for_source_scene("neural-lattice") == "lattice-grid"
    assert surface_id_for_source_scene("unknown") is None


def test_extract_source_scene_from_provenance():
    assert (
        extract_source_scene({"provenance": {"scene": "tesseract-lattice"}})
        == "tesseract-lattice"
    )
    assert (
        extract_source_scene({"render": {"scene": "lattice-grid"}}) == "lattice-grid"
    )


def test_apply_source_scene_bias_remaps_orbital_cluster():
    spec = {
        "schemaVersion": "1.0",
        "kind": "SceneSpecification",
        "id": "x",
        "entities": [
            {
                "id": "primary",
                "geometry": {"kind": "surface", "surfaceId": "orbital-cluster"},
            }
        ],
        "metadata": {},
    }
    out = apply_source_scene_bias(
        spec, source_scene="tesseract-lattice", force=False
    )
    assert out["entities"][0]["geometry"]["surfaceId"] == "tesseract"
    assert out["metadata"]["surface_id_before_bias"] == "orbital-cluster"


def test_interpret_biases_nim_orbital_when_source_is_lattice():
    png = _tiny_png()
    settings = _settings(nvidia_api_key="nvapi-test")
    orbital_spec = {
        **VALID_NIM_SPEC,
        "entities": [
            {
                "id": "primary",
                "materialId": "mat0",
                "geometry": {"kind": "surface", "surfaceId": "orbital-cluster"},
            }
        ],
    }
    content = json.dumps(orbital_spec)

    def fake_post(url, headers=None, json=None, timeout=None):
        class R:
            def json(self_inner):
                return {"choices": [{"message": {"content": content}}]}

        return R()

    out = interpret_image_to_scene(
        settings,
        png,
        http_post=fake_post,
        validate_fn=lambda s: {"ok": True, "value": s},
        source_scene="tesseract-lattice",
    )
    assert out["source"] == "nim-vision"
    assert out["spec"]["entities"][0]["geometry"]["surfaceId"] == "tesseract"
    assert out["source_scene"] == "tesseract-lattice"
