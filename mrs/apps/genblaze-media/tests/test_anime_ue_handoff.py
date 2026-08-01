"""Tests for POST /api/anime handoff (partial — no UE / no live Engine3D required)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.anime_ue_handoff import (
    ANIME_UE_ENDPOINT,
    anime_ue_availability,
    build_anime_ue_handoff,
    build_structure_plate_provenance,
    normalize_projection_method,
)
from app.anime_world_profile import default_example_path
from app.main import app


def test_normalize_projection_method():
    assert normalize_projection_method("projector4d-sot") == "projector4d-sot"
    assert normalize_projection_method("drop_w") == "drop_w"
    assert normalize_projection_method("literal-xyz") == "drop_w"


def test_build_provenance_print_sot_untouched():
    prov = build_structure_plate_provenance(
        projection_method="projector4d-sot",
        anime_world_profile_id="anime.mandala-cel.v1",
        asset_sha256="a" * 64,
    )
    assert prov["print_sot_touched"] is False
    assert prov["digital_printer_touched"] is False
    assert prov["lane"] == "anime-structure"
    assert prov["projection_method"] == "projector4d-sot"
    assert prov["anime_world_profile_id"] == "anime.mandala-cel.v1"
    assert prov["asset_sha256"] == "a" * 64


def test_build_handoff_dry_run():
    assert default_example_path().is_file()
    payload = build_anime_ue_handoff(dry_run=True, projection_method="drop_w")
    assert payload["status"] == "partial"
    assert payload["kind"] == "anime-ue-handoff"
    assert payload["dry_run"] is True
    assert payload["anime_world_profile_id"] == "anime.mandala-cel.v1"
    assert payload["projection_method"] == "drop_w"
    assert payload["structure"] is None
    assert payload["ue_consumer"]["plugin_status"] == "skeleton/partial"
    assert "genblaze:/api/anime" in payload["pipeline_story"]


def test_anime_ue_availability_keys():
    avail = anime_ue_availability()
    for key in (
        "endpoint",
        "kind",
        "status",
        "available",
        "ue_plugin",
        "ue_status",
        "note",
    ):
        assert key in avail
    assert avail["endpoint"] == ANIME_UE_ENDPOINT
    assert avail["available"] is True


def test_api_anime_dry_run():
    client = TestClient(app)
    r = client.post(
        "/api/anime",
        json={
            "dry_run": True,
            "projection_method": "projector4d-sot",
            "prompt": "governed mandala cel plate",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "partial"
    assert body["anime_world_profile_id"] == "anime.mandala-cel.v1"
    assert body["provenance"]["print_sot_touched"] is False
    assert body["provenance"]["projection_method"] == "projector4d-sot"
    assert Path(body["anime_world_profile_path"]).name.endswith(".json")


def test_health_includes_anime_ue():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    health = r.json()
    assert "anime_ue" in health
    assert health["anime_ue"]["endpoint"] == "/api/anime"
