"""Boundary adapter tests — Architect acceptance + ownership guards.

Status: **enforced** for validate/refuse; routing depth **partial**/**skeleton**.
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path

import pytest

_DIR = Path(__file__).resolve().parent
import sys

if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

from route import route_render_request  # noqa: E402
from validate_request import (  # noqa: E402
    RenderRequestValidationError,
    load_and_validate,
    validate_render_request,
)

FIXTURE = _DIR / "fixtures" / "sample-render-request.json"
GENBLAZE_APP = (
    _DIR.parents[1] / "apps" / "genblaze-media" / "app"
)


def test_fixture_validates():
    req = load_and_validate(FIXTURE)
    assert req["schemaVersion"] == "1.0"
    assert req["intentId"] == "intent-fixture-001"
    assert req["payload"]["route"] == "scene-spec"


def test_missing_intent_refused():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    del data["intentId"]
    with pytest.raises(RenderRequestValidationError, match="intentId"):
        validate_render_request(data)


def test_missing_world_refused():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    del data["worldId"]
    with pytest.raises(RenderRequestValidationError, match="worldId"):
        validate_render_request(data)


def test_unknown_route_refused():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data["payload"]["route"] = "prompt-composer"
    with pytest.raises(RenderRequestValidationError, match="route"):
        validate_render_request(data)


@pytest.mark.parametrize(
    "smuggle_key",
    ["promptSpec", "renderIntent", "promptComposer", "modelBackend"],
)
def test_smuggled_sf_bodies_refused(smuggle_key):
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data[smuggle_key] = {"mutable": True}
    with pytest.raises(RenderRequestValidationError, match="ownership breach"):
        validate_render_request(data)


def test_route_scene_spec_echoes_specification():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = route_render_request(data)
    assert result["status"] == "ok"
    assert result["routeUsed"] == "scene-spec"
    assert result["sceneSpecification"]["entities"][0]["geometry"]["surfaceId"] == (
        "tesseract"
    )
    assert result["provenance"]["intentId"] == data["intentId"]
    assert result["provenance"]["worldId"] == data["worldId"]
    dumped = json.dumps(result)
    assert "from story_forge" not in dumped
    assert "import story_forge" not in dumped


def test_route_validation_failure_returns_refused_result():
    result = route_render_request({"schemaVersion": "1.0"})
    assert result["status"] == "refused"
    assert result["error"]["code"] == "validation_failed"


def test_proton_route_is_skeleton_ok():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data["payload"]["route"] = "proton-raster"
    # sceneSpecification may remain; route does not require it
    result = route_render_request(data)
    assert result["status"] == "ok"
    assert result["mapping"]["statusTag"] == "skeleton"


def test_adapter_modules_do_not_import_storyforge_packages():
    """Adapter runtime must not import StoryForge packages (ownership)."""
    for name in (
        "validate_request.py",
        "route.py",
        "execute.py",
        "paths.py",
        "run_pipeline.py",
        "smoke_pipeline.py",
    ):
        text = (_DIR / name).read_text(encoding="utf-8")
        assert "import story_forge" not in text
        assert "from story_forge" not in text
        assert "import storyforge" not in text
        assert "from storyforge" not in text


def test_genblaze_app_has_no_storyforge_tokens():
    """Ban: no story_forge/storyforge under Genblaze app/*.py."""
    if not GENBLAZE_APP.is_dir():
        pytest.skip("genblaze-media app tree not present")
    pat = re.compile(r"story_forge|storyforge", re.IGNORECASE)
    offenders = []
    for path in GENBLAZE_APP.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="replace")
        if pat.search(text):
            offenders.append(str(path.relative_to(GENBLAZE_APP)))
    assert offenders == [], f"banned tokens in app/: {offenders}"


def test_route_does_not_mutate_provenance_hashes():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    before = deepcopy(data["provenance"])
    route_render_request(data)
    assert data["provenance"] == before
