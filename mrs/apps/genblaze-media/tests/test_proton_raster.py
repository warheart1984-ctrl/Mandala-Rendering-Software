"""Genblaze proton raster provider tests (judge-wow trail).

STATUS: **enforced** for default-off + availability + mocked subprocess.
Live Node-in-Docker remains **partial**.

Trail: docs/governance/cecp/trails/judge-wow-2026-07/
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.proton_raster_provider import (
    PROTON_RASTER_PROVIDER_ID,
    ProtonRasterError,
    generate_proton_raster,
    proton_raster_availability,
    proton_raster_default_script_path,
    run_proton_raster,
)


def test_proton_raster_enabled_default_off():
    """PROTON_RASTER_ENABLED / settings default: provider disabled."""
    settings = SimpleNamespace(
        proton_raster_enabled=False,
        proton_raster_script_path=None,
        proton_raster_timeout_seconds=60.0,
        rt4d_node_path=None,
        resolved_proton_raster_script=str(proton_raster_default_script_path()),
    )
    avail = proton_raster_availability(settings)
    assert avail["enabled"] is False
    assert avail["available"] is False


def test_proton_raster_availability_shape():
    """Cheap probe returns stable keys for health-shaped wiring."""
    settings = SimpleNamespace(
        proton_raster_enabled=False,
        proton_raster_script_path=None,
        proton_raster_timeout_seconds=60.0,
        rt4d_node_path=None,
        resolved_proton_raster_script=str(proton_raster_default_script_path()),
    )
    avail = proton_raster_availability(settings)
    for key in (
        "provider",
        "enabled",
        "available",
        "script_path",
        "script_exists",
        "setup_help",
        "status",
        "endpoint",
        "note",
    ):
        assert key in avail, f"missing availability key: {key}"
    assert avail["provider"] == PROTON_RASTER_PROVIDER_ID
    assert avail["endpoint"] is None


def test_proton_raster_default_script_is_render_proton_splat():
    path = proton_raster_default_script_path()
    assert path.name == "render-proton-splat.mjs"
    assert "softSplat" not in str(path)


def test_run_proton_raster_disabled_raises():
    settings = SimpleNamespace(proton_raster_enabled=False)
    with pytest.raises(RuntimeError, match="disabled"):
        run_proton_raster({"width": 64, "height": 64}, settings)


def test_run_proton_raster_mocked_subprocess(tmp_path, monkeypatch):
    """Mocked Node CLI → paths + evidence (enforced path)."""
    script = tmp_path / "render-proton-splat.mjs"
    script.write_text("// stub\n", encoding="utf-8")
    beauty = tmp_path / "beauty.png"
    beauty.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 40)
    evidence = tmp_path / "evidence.json"
    evidence.write_text(
        '{"intentId":"i1","frameSha256":"abc","pngSha256":"def"}\n',
        encoding="utf-8",
    )

    settings = SimpleNamespace(
        proton_raster_enabled=True,
        proton_raster_script_path=str(script),
        resolved_proton_raster_script=str(script),
        proton_raster_timeout_seconds=30.0,
        rt4d_node_path="node",
        storage_prefix="genblaze-media",
        b2_configured=False,
    )

    class FakeProc:
        returncode = 0
        stdout = (
            '{"ok":true,"beautyPath":%s,"protonCount":4,'
            '"evidence":{"intentId":"i1","frameSha256":"abc"}}\n'
            % (Path(beauty).as_posix().__repr__().replace("'", '"'))
        )
        stderr = ""

    def fake_run(argv, **kwargs):
        assert "render-proton-splat.mjs" in argv[1] or str(script) in argv
        assert "--demo" in argv or "--star-demo" in argv or "--scene-spec" in argv
        # Copy beauty into out-dir from argv
        out_idx = argv.index("--out-dir") + 1
        out_dir = Path(argv[out_idx])
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "beauty.png").write_bytes(beauty.read_bytes())
        (out_dir / "evidence.json").write_text(evidence.read_text(encoding="utf-8"))
        FakeProc.stdout = (
            '{"ok":true,"beautyPath":"%s","protonCount":4,'
            '"evidence":{"intentId":"i1","frameSha256":"abc"}}\n'
            % str(out_dir / "beauty.png").replace("\\", "/")
        )
        return FakeProc()

    monkeypatch.setattr("app.proton_raster_provider._find_node", lambda _p: "node")
    monkeypatch.setattr("app.proton_raster_provider.subprocess.run", fake_run)

    result = run_proton_raster(
        {"width": 64, "height": 64, "mode": "demo"},
        settings,
    )
    assert Path(result["beauty_path"]).is_file()
    assert result["evidence"].get("intentId") == "i1"
    assert result["proton_count"] == 4
    # cleanup work dir left for caller — generate cleans; here remove
    work = Path(result["work_dir"])
    if work.is_dir():
        import shutil

        shutil.rmtree(work, ignore_errors=True)


def test_generate_proton_raster_mocked(tmp_path, monkeypatch):
    png = b"\x89PNG\r\n\x1a\n" + b"\x01" * 64

    def fake_run(request, settings):
        work = tmp_path / "work"
        work.mkdir(exist_ok=True)
        beauty = work / "beauty.png"
        beauty.write_bytes(png)
        return {
            "beauty_path": str(beauty),
            "evidence": {"intentId": "x", "frameSha256": "f" * 64},
            "proton_count": 8,
            "work_dir": str(work),
        }

    monkeypatch.setattr("app.proton_raster_provider.run_proton_raster", fake_run)
    monkeypatch.setattr(
        "app.proton_raster_provider.put_preview",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "app.proton_raster_provider._attach_local_preview",
        lambda gen, _png: setattr(gen, "preview_url", f"/api/preview/{gen.run_id}"),
    )

    settings = SimpleNamespace(
        proton_raster_enabled=True,
        storage_prefix="genblaze-media",
        b2_configured=False,
    )
    gen = generate_proton_raster(settings, width=64, height=64, mode="demo")
    assert gen.status == "ok"
    assert gen.asset_sha256
    assert gen.provenance["kind"] == "proton-raster-still"


def test_health_exposes_proton_raster(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTON_RASTER_ENABLED", "0")
    from app.main import app

    client = TestClient(app)
    body = client.get("/health").json()
    assert "proton_raster" in body
    assert isinstance(body["proton_raster"], dict)
    assert body["proton_raster"]["enabled"] is False


def test_api_proton_raster_disabled_503(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTON_RASTER_ENABLED", "0")
    from app.main import app

    client = TestClient(app)
    res = client.post("/api/proton-raster", json={"width": 64, "height": 64})
    assert res.status_code == 503


def test_api_proton_raster_mocked(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTON_RASTER_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_PREVIEW_CACHE_DIR", str(tmp_path / "preview-cache"))

    class FakeGen:
        def to_dict(self):
            return {
                "run_id": "r1",
                "status": "ok",
                "asset_sha256": "a" * 64,
                "preview_url": "/api/preview/r1",
            }

    from app import main as main_mod
    from app.config import get_settings
    from app.index_store import AssetIndex
    from dataclasses import replace

    settings = replace(get_settings(), proton_raster_enabled=True)
    monkeypatch.setattr(main_mod, "get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.main.generate_proton_raster",
        lambda *a, **k: FakeGen(),
    )
    main_mod._index = AssetIndex(tmp_path / "recent.json")
    client = TestClient(main_mod.app)
    res = client.post(
        "/api/proton-raster",
        json={"width": 64, "height": 64, "mode": "demo"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["kind"] == "proton-raster-still"


def test_no_story_forge_in_proton_provider():
    text = Path(__file__).resolve().parents[1].joinpath(
        "app", "proton_raster_provider.py"
    ).read_text(encoding="utf-8").lower()
    assert "story_forge" not in text
    assert "storyforge" not in text
