"""Pipeline execute tests — mocked subprocess + optional live smoke skip.

Status: **enforced** for mocked path; live Node smoke is optional.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

_DIR = Path(__file__).resolve().parent
import sys

if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

from execute import (  # noqa: E402
    ExecuteError,
    execute_proton_raster,
    execute_scene_spec,
    sha256_bytes,
)
from route import route_render_request  # noqa: E402

FIXTURE_EXEC = _DIR / "fixtures" / "sample-render-request-executable.json"
FIXTURE = _DIR / "fixtures" / "sample-render-request.json"


def test_non_execute_proton_remains_skeleton():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data["payload"]["route"] = "proton-raster"
    result = route_render_request(data, execute=False)
    assert result["status"] == "ok"
    assert result["mapping"]["statusTag"] == "skeleton"
    assert result["mapping"]["execute"] is False


def test_execute_scene_spec_mocked(tmp_path, monkeypatch):
    data = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    png = tmp_path / "out.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
    prov = tmp_path / "out.provenance.json"

    def fake_run(argv, **kwargs):
        # Last --output / --provenance from argv
        out = None
        provenance = None
        for i, a in enumerate(argv):
            if a == "--output" and i + 1 < len(argv):
                out = Path(argv[i + 1])
            if a == "--provenance" and i + 1 < len(argv):
                provenance = Path(argv[i + 1])
        assert out is not None
        out.write_bytes(png.read_bytes())
        if provenance:
            provenance.write_text(
                json.dumps({"sha256": sha256_bytes(png.read_bytes())}),
                encoding="utf-8",
            )
        return subprocess.CompletedProcess(argv, 0, stdout="{}", stderr="")

    monkeypatch.setenv("SCENE_SPEC_SCRIPT_PATH", str(tmp_path / "render-scene.mjs"))
    (tmp_path / "render-scene.mjs").write_text("// stub\n", encoding="utf-8")
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")

    deep = execute_scene_spec(data, out_dir=tmp_path, run_fn=fake_run)
    assert deep["statusTag"] == "enforced"
    assert deep["artifacts"][0]["role"] == "beauty-png"
    assert len(deep["hashes"]["pngSha256"]) == 64

    result = route_render_request(data, execute=True, out_dir=tmp_path)
    # Re-run with same fake via monkeypatch of execute._run
    import execute as ex

    monkeypatch.setattr(ex, "_run", fake_run)
    result = route_render_request(data, execute=True, out_dir=tmp_path)
    assert result["status"] == "ok"
    assert result["artifacts"]
    assert result["mapping"]["hashes"]["pngSha256"]


def test_execute_proton_mocked(tmp_path, monkeypatch):
    data = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    data["payload"]["route"] = "proton-raster"

    def fake_run(argv, **kwargs):
        out = None
        for i, a in enumerate(argv):
            if a == "--output" and i + 1 < len(argv):
                out = Path(argv[i + 1])
        assert out is not None
        out.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x11" * 16)
        return subprocess.CompletedProcess(argv, 0, stdout="{}", stderr="")

    monkeypatch.setenv(
        "PROTON_PIPELINE_SCRIPT", str(tmp_path / "run_proton_pipeline.mjs")
    )
    (tmp_path / "run_proton_pipeline.mjs").write_text("// stub\n", encoding="utf-8")
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")

    deep = execute_proton_raster(data, out_dir=tmp_path, run_fn=fake_run)
    assert deep["artifacts"][0]["sha256"]
    assert deep["mappedTo"].endswith("run_proton_pipeline.mjs")
    assert deep["statusTag"] == "enforced"


def test_execute_proton_hq_mocked(tmp_path, monkeypatch):
    data = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    data["payload"]["route"] = "proton-raster"
    data["payload"]["render"]["quality"] = "high"
    data["payload"]["render"]["width"] = 512
    data["payload"]["render"]["height"] = 512

    def fake_run(argv, **kwargs):
        assert "--star-demo" in argv
        assert "--quality" in argv
        out_dir = None
        for i, a in enumerate(argv):
            if a == "--out-dir" and i + 1 < len(argv):
                out_dir = Path(argv[i + 1])
        assert out_dir is not None
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "beauty.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x22" * 16)
        (out_dir / "depth.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x33" * 8)
        (out_dir / "normal.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x44" * 8)
        (out_dir / "evidence.json").write_text("{}", encoding="utf-8")
        return subprocess.CompletedProcess(argv, 0, stdout="{}", stderr="")

    monkeypatch.setenv("PROTON_SPLAT_SCRIPT", str(tmp_path / "render-proton-splat.mjs"))
    (tmp_path / "render-proton-splat.mjs").write_text("// stub\n", encoding="utf-8")
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")

    deep = execute_proton_raster(data, out_dir=tmp_path, run_fn=fake_run)
    roles = {a["role"] for a in deep["artifacts"]}
    assert "beauty-png" in roles
    assert "depth-png" in roles
    assert "normal-png" in roles
    assert "star-demo" in deep["mappedTo"]
    assert deep["statusTag"] == "enforced"


def test_execute_scene_cinematic_floors_mocked(tmp_path, monkeypatch):
    """Cinematic quality must floor samples≥24 and dims≥512; draft stays untouched."""
    data = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    data["payload"]["render"]["quality"] = "cinematic"
    data["payload"]["render"]["width"] = 256
    data["payload"]["render"]["height"] = 256
    data["payload"]["render"]["samples"] = 4
    data["payload"]["render"]["maxDepth"] = 4

    captured: dict[str, Any] = {}

    def fake_run(argv, **kwargs):
        for i, a in enumerate(argv):
            if a == "--width" and i + 1 < len(argv):
                captured["width"] = int(argv[i + 1])
            if a == "--height" and i + 1 < len(argv):
                captured["height"] = int(argv[i + 1])
            if a == "--samples" and i + 1 < len(argv):
                captured["samples"] = int(argv[i + 1])
            if a == "--output" and i + 1 < len(argv):
                out = Path(argv[i + 1])
                out.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x55" * 16)
            if a == "--provenance" and i + 1 < len(argv):
                Path(argv[i + 1]).write_text("{}", encoding="utf-8")
        return subprocess.CompletedProcess(argv, 0, stdout="{}", stderr="")

    monkeypatch.setenv("SCENE_SPEC_SCRIPT_PATH", str(tmp_path / "render-scene.mjs"))
    (tmp_path / "render-scene.mjs").write_text("// stub\n", encoding="utf-8")
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")

    deep = execute_scene_spec(data, out_dir=tmp_path, run_fn=fake_run)
    assert deep["statusTag"] == "enforced"
    assert captured["width"] >= 512
    assert captured["height"] >= 512
    assert captured["samples"] >= 24
    assert deep["sceneSpecification"]["output"]["maxDepth"] >= 6
    assert deep["sceneSpecification"]["output"]["qualityOpts"]["adaptiveSampling"] is True

    # Draft must still clamp (CI safety)
    draft = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    draft["payload"]["render"]["quality"] = "draft"
    draft["payload"]["render"]["width"] = 512
    draft["payload"]["render"]["height"] = 512
    draft["payload"]["render"]["samples"] = 64
    captured.clear()

    def fake_draft(argv, **kwargs):
        for i, a in enumerate(argv):
            if a == "--width" and i + 1 < len(argv):
                captured["width"] = int(argv[i + 1])
            if a == "--samples" and i + 1 < len(argv):
                captured["samples"] = int(argv[i + 1])
            if a == "--output" and i + 1 < len(argv):
                Path(argv[i + 1]).write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x66" * 8)
            if a == "--provenance" and i + 1 < len(argv):
                Path(argv[i + 1]).write_text("{}", encoding="utf-8")
        return subprocess.CompletedProcess(argv, 0, stdout="{}", stderr="")

    execute_scene_spec(draft, out_dir=tmp_path, run_fn=fake_draft)
    assert captured["width"] <= 128
    assert captured["samples"] <= 2


def test_execute_missing_script_errors(tmp_path, monkeypatch):
    data = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    monkeypatch.delenv("SCENE_SPEC_SCRIPT_PATH", raising=False)
    monkeypatch.setenv("SCENE_SPEC_SCRIPT_PATH", str(tmp_path / "missing.mjs"))
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")
    with pytest.raises(ExecuteError, match="not found"):
        execute_scene_spec(data, out_dir=tmp_path)


def test_route_execute_maps_errors(tmp_path, monkeypatch):
    data = json.loads(FIXTURE_EXEC.read_text(encoding="utf-8"))
    monkeypatch.setenv("SCENE_SPEC_SCRIPT_PATH", str(tmp_path / "missing.mjs"))
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")
    result = route_render_request(data, execute=True, out_dir=tmp_path)
    assert result["status"] == "error"
    assert result["error"]["code"] == "execute_failed"


def test_new_modules_have_no_storyforge_imports():
    for name in (
        "execute.py",
        "paths.py",
        "run_pipeline.py",
        "smoke_pipeline.py",
        "route.py",
        "validate_request.py",
    ):
        text = (_DIR / name).read_text(encoding="utf-8")
        assert "import story_forge" not in text
        assert "from story_forge" not in text
        assert "import storyforge" not in text
        assert "from storyforge" not in text
