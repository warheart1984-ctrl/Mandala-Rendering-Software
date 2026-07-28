"""Digital printer mode tests — sovereignty, errors, evidence, determinism.

STATUS: **enforced** for mocked paths; live Node print is opt-in demo.
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

from printer.errors import PrintError, PrintErrorState  # noqa: E402
from printer.evidence import write_evidence_bundle, sha256_json  # noqa: E402
from printer.print_request import (  # noqa: E402
    apply_print_request_to_render_request,
    normalize_print_request,
)
from printer.sovereignty import (  # noqa: E402
    check_render_request_surfaces,
    load_surface_contract,
)
from printer.pipeline import run_digital_print  # noqa: E402

FIXTURE = _DIR / "fixtures" / "sample-render-request-cinematic-scene.json"


def _base_rr() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_surface_contract_loads():
    c = load_surface_contract()
    assert c["kind"] == "PrintSurfaceContract"
    assert "OK" in c["errorStates"]
    assert "SCENESPEC_GAP" in c["errorStates"]


def test_normalize_print_request_defaults():
    p = normalize_print_request(None)
    assert p["width"] == 512
    assert p["tone_mapper"] == "aces-lite"
    assert p["denoise"] is False
    assert "beauty" in p["aovs"]


def test_sovereignty_ok_on_fixture():
    state = check_render_request_surfaces(_base_rr())
    assert state == PrintErrorState.OK


def test_sovereignty_scenespec_gap():
    rr = _base_rr()
    del rr["payload"]["sceneSpecification"]
    with pytest.raises(PrintError) as ei:
        check_render_request_surfaces(rr)
    assert ei.value.state == PrintErrorState.SCENESPEC_GAP


def test_sovereignty_surface_missing():
    rr = _base_rr()
    del rr["intentId"]
    with pytest.raises(PrintError) as ei:
        check_render_request_surfaces(rr)
    assert ei.value.state == PrintErrorState.SURFACE_MISSING


def test_sovereignty_sf_smuggle_refused():
    rr = _base_rr()
    rr["payload"]["promptSpec"] = {"text": "nope"}
    with pytest.raises(PrintError) as ei:
        check_render_request_surfaces(rr)
    assert ei.value.state == PrintErrorState.SURFACE_INVALID


def test_sovereignty_engine3d_boundary():
    rr = _base_rr()
    rr["payload"]["route"] = "engine3d-world"
    rr["payload"].pop("sceneSpecification", None)
    with pytest.raises(PrintError) as ei:
        check_render_request_surfaces(rr)
    assert ei.value.state == PrintErrorState.ENGINE3D_BOUNDARY_FAIL


def test_evidence_completeness(tmp_path):
    beauty = tmp_path / "beauty.png"
    beauty.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x11" * 32)
    rr = _base_rr()
    pr = normalize_print_request({"seed": 7})
    ev = write_evidence_bundle(
        out_dir=tmp_path,
        print_request=pr,
        render_request=rr,
        route_result={
            "status": "ok",
            "routeUsed": "scene-spec",
            "artifacts": [
                {
                    "role": "beauty-png",
                    "uri": str(beauty),
                    "sha256": None,
                    "mediaType": "image/png",
                }
            ],
            "mapping": {"statusTag": "enforced"},
        },
    )
    assert ev["printState"] == "OK"
    assert ev["beautySha256"]
    assert (tmp_path / "evidence.json").is_file()
    assert (tmp_path / "lineage.json").is_file()
    assert ev["printRequestSha256"] == sha256_json(pr)


def test_print_request_patch_sets_cinematic_quality_opts():
    rr = _base_rr()
    pr = normalize_print_request({"samples": 16, "tone_mapper": "aces-lite"})
    patched = apply_print_request_to_render_request(rr, pr)
    assert patched["payload"]["render"]["quality"] == "cinematic"
    opts = patched["payload"]["sceneSpecification"]["output"]["qualityOpts"]
    assert opts["adaptiveSampling"] is True
    assert opts["tonemap"] == "aces-lite"


def test_dry_run_print_determinism(tmp_path):
    rr = _base_rr()
    pr = normalize_print_request({"seed": 42, "samples": 16})
    a = run_digital_print(rr, out_dir=tmp_path / "a", print_request=pr, execute=False)
    b = run_digital_print(rr, out_dir=tmp_path / "b", print_request=pr, execute=False)
    assert a["printState"] == "OK"
    assert a["evidence"]["printRequestSha256"] == b["evidence"]["printRequestSha256"]
    assert a["evidence"]["renderRequestSha256"] == b["evidence"]["renderRequestSha256"]


def test_execute_print_mocked(tmp_path, monkeypatch):
    """Same PrintRequest → same beauty hash under mocked execute."""
    rr = _base_rr()
    pr = normalize_print_request({"width": 64, "height": 48, "samples": 4, "seed": 99})

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\xab" * 64

    def fake_run(argv, **kwargs):
        out = None
        provenance = None
        for i, a in enumerate(argv):
            if a == "--output" and i + 1 < len(argv):
                out = Path(argv[i + 1])
            if a == "--provenance" and i + 1 < len(argv):
                provenance = Path(argv[i + 1])
        assert out is not None
        out.write_bytes(png_bytes)
        if provenance:
            provenance.write_text(
                json.dumps({"sha256": "x" * 64, "samples": 4}),
                encoding="utf-8",
            )
        return subprocess.CompletedProcess(argv, 0, stdout="{}", stderr="")

    monkeypatch.setenv("SCENE_SPEC_SCRIPT_PATH", str(tmp_path / "render-scene.mjs"))
    (tmp_path / "render-scene.mjs").write_text("// stub\n", encoding="utf-8")
    monkeypatch.setenv("RT4D_NODE_PATH", str(tmp_path / "node.exe"))
    (tmp_path / "node.exe").write_text("stub", encoding="utf-8")

    import execute as ex

    monkeypatch.setattr(ex, "_run", fake_run)

    r1 = run_digital_print(rr, out_dir=tmp_path / "p1", print_request=pr, execute=True)
    r2 = run_digital_print(rr, out_dir=tmp_path / "p2", print_request=pr, execute=True)
    assert r1["printState"] == "OK"
    assert r1["evidence"]["beautySha256"] == r2["evidence"]["beautySha256"]
    assert (tmp_path / "p1" / "beauty.png").is_file()
    assert (tmp_path / "p1" / "evidence.json").is_file()
    assert (tmp_path / "p1" / "lineage.json").is_file()
