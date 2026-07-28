"""Digital Printer HTTP surface tests (Genblaze).

STATUS: **enforced** for health / validate / dry-run paths when adapter present.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.printer_provider import _discover_print_script, printer_availability
from app.config import get_settings

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "adapters"
    / "storyforge-boundary"
    / "fixtures"
    / "sample-render-request-cinematic-scene.json"
)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("PRINTER_API_ENABLED", raising=False)
    return TestClient(app)


def test_discover_print_script():
    script = _discover_print_script()
    assert script is not None
    assert script.name == "run_print.py"
    assert (script.parent / "printer" / "pipeline.py").is_file()


def test_printer_health(client: TestClient):
    r = client.get("/printer/health")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "mrs-digital-printer"
    assert body["deterministic"] is True
    assert body["pipeline_found"] is True
    assert "print_hq" in body["quality_profiles"]
    assert body["timeout_env"] == "MRS_PRINT_TIMEOUT_SECONDS"
    assert "printer.print_surface" in body["mcp_capabilities"]


def test_printer_on_main_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "printer" in body
    assert body["printer"]["pipeline_found"] is True


def test_printer_print_requires_enable(client: TestClient):
    assert FIXTURE.is_file()
    rr = json.loads(FIXTURE.read_text(encoding="utf-8"))
    r = client.post("/printer/print", json=rr)
    assert r.status_code == 503


def test_printer_print_dry_run(client: TestClient):
    rr = json.loads(FIXTURE.read_text(encoding="utf-8"))
    r = client.post("/printer/print?dry_run=true", json={**rr, "quality": "print_fast"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("printState") == "OK" or body.get("status") == "ok"
    assert body.get("evidence")


def test_printer_validate_ok(client: TestClient):
    rr = json.loads(FIXTURE.read_text(encoding="utf-8"))
    r = client.post("/printer/validate", json=rr)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["violations"] == []


def test_printer_validate_gap(client: TestClient):
    rr = json.loads(FIXTURE.read_text(encoding="utf-8"))
    del rr["payload"]["sceneSpecification"]
    r = client.post("/printer/validate", json=rr)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["violations"]


def test_printer_provenance_dry(client: TestClient):
    rr = json.loads(FIXTURE.read_text(encoding="utf-8"))
    r = client.post("/printer/provenance", json=rr)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["provenanceFrames"]
    assert body["provenanceFrames"][0]["intentId"]


def test_printer_availability_timeout_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MRS_PRINT_TIMEOUT_SECONDS", "123")
    avail = printer_availability(get_settings())
    assert avail["timeout_seconds"] == 123.0
