"""Unit tests for mrs_map (Architect acceptance).

Status: **enforced** — surface mapping, RT4D allowlist, schema fields,
world stub emptiness, expand star/mandala, deterministic seeds.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

_BRIDGE_DIR = Path(__file__).resolve().parent
if str(_BRIDGE_DIR) not in sys.path:
    sys.path.insert(0, str(_BRIDGE_DIR))

from mrs_map import (  # noqa: E402
    WorldExpandError,
    _sibling_expand_script_path,
    default_expand_script_path,
    expand_world_request,
    expand_world_request_if_enabled,
    map_infinity_scene_to_scene_specification,
    map_infinity_scene_to_world_document,
)
from run_bridge import _fallback_infinity_scene  # noqa: E402

# renderer-core RT4D_SURFACE_IDS (validate.js) — keep in sync for allowlist AC.
RT4D_SURFACE_IDS = frozenset(
    {
        "tesseract",
        "clifford-torus",
        "clifford_torus",
        "central-orb",
        "lattice-grid",
        "torus-ring",
        "orbital-cluster",
        "hopf-surface",
        "hopf_surface",
        "trefoil-4d",
        "trefoil_4d",
        "torus-3d",
        "torus_3d",
    }
)

assert callable(map_infinity_scene_to_scene_specification)
assert callable(map_infinity_scene_to_world_document)
assert callable(expand_world_request)

_EXPAND_SCRIPT = default_expand_script_path()
_DIST_GENERATOR = (
    _EXPAND_SCRIPT.parents[1] / "dist" / "src" / "world" / "WorldGenerator.js"
)
_NODE = shutil.which("node")
_EXPAND_READY = bool(
    _NODE and _EXPAND_SCRIPT.is_file() and _DIST_GENERATOR.is_file()
)
_EXPAND_SKIP = (
    "requires node + engine3d-core dist (npm run build in engine3d-core)"
)


def _primary_surface(spec: dict) -> str:
    primary = next(e for e in spec["entities"] if e["id"] == "primary")
    return primary["geometry"]["surfaceId"]


@pytest.mark.parametrize(
    "theme,keywords,expected",
    [
        ("gothic_ritual", ["altar", "moon"], "tesseract"),
        ("forbidden_archive", ["archive", "ledger"], "lattice-grid"),
        ("haunted_wilds", ["garden", "moor"], "torus-ring"),
        ("mythic_threshold", ["star", "4d"], "tesseract"),
        ("neural_lattice", ["lattice"], "lattice-grid"),
        ("mythic_threshold", ["torus", "ring"], "clifford-torus"),
        ("mythic_threshold", [], "central-orb"),
    ],
)
def test_surface_mapping_theme_and_keywords(theme, keywords, expected):
    """AC: infinity theme/keywords map to a SceneSpecification entity surfaceId."""
    scene = {
        "theme": theme,
        "keywords": keywords,
        "mood": "steady",
        "worldId": "w1",
        "sceneId": "w1:s1",
        "summary": theme,
    }
    spec = map_infinity_scene_to_scene_specification(scene)
    assert _primary_surface(spec) == expected


def test_rt4d_surface_allowlist():
    """AC: every mapped surfaceId is in renderer-core RT4D_SURFACE_IDS (or alias)."""
    cases = [
        {"theme": "gothic_ritual", "keywords": ["altar"]},
        {"theme": "forbidden_archive", "keywords": ["cathedral"]},
        {"theme": "haunted_wilds", "keywords": ["bridge"]},
        {"theme": "x", "keywords": ["star"]},
        {"theme": "x", "keywords": ["hopf"]},
        {"theme": "plain", "keywords": []},
    ]
    for case in cases:
        spec = map_infinity_scene_to_scene_specification(
            {
                **case,
                "mood": "steady",
                "worldId": "w",
                "sceneId": "w:s",
                "summary": "t",
            }
        )
        sid = _primary_surface(spec)
        assert sid in RT4D_SURFACE_IDS, f"{sid!r} not in RT4D allowlist"


def test_scene_specification_schema_fields():
    """AC: map output has schemaVersion, kind, materials, entities, camera, output."""
    spec = map_infinity_scene_to_scene_specification(
        {
            "theme": "gothic_ritual",
            "keywords": ["altar"],
            "mood": "ominous",
            "worldId": "world-a",
            "sceneId": "world-a:scene",
            "summary": "gothic altar",
            "seedSignature": "fixed-seed-1",
        }
    )
    for key in (
        "schemaVersion",
        "kind",
        "materials",
        "entities",
        "camera",
        "output",
    ):
        assert key in spec, f"missing {key}"
    assert spec["schemaVersion"] == "1.0"
    assert spec["kind"] == "SceneSpecification"
    assert isinstance(spec["materials"], list) and len(spec["materials"]) >= 1
    assert isinstance(spec["entities"], list) and len(spec["entities"]) >= 1
    assert isinstance(spec["camera"], dict)
    assert isinstance(spec["output"], dict)
    assert "seed" in spec["output"]


def test_world_stub_empty_object_arrays():
    """AC: engine3dWorldDocument stub keeps empty objects/materials/lights/cameras."""
    for scene in (
        {
            "theme": "gothic_ritual",
            "keywords": ["star"],
            "worldId": "w-star",
            "summary": "star",
            "seedSignature": "s1",
        },
        {
            "theme": "mythic_threshold",
            "keywords": [],
            "worldId": "w-mandala",
            "summary": "plain",
            "seedSignature": "s2",
        },
    ):
        world = map_infinity_scene_to_world_document(scene)
        assert world["objects"] == []
        assert world["materials"] == []
        assert world["lights"] == []
        assert world["cameras"] == []
        assert isinstance(world.get("generator"), dict)
        assert world["generator"].get("type") in ("star", "mandala")


@pytest.mark.skipif(not _EXPAND_READY, reason=_EXPAND_SKIP)
@pytest.mark.parametrize(
    "theme,keywords,gen_type",
    [
        ("gothic_ritual", ["star"], "star"),
        ("mythic_threshold", [], "mandala"),
    ],
)
def test_expand_world_request_star_and_mandala(theme, keywords, gen_type):
    """AC: expand produces objects.length > 0 for star and mandala stubs."""
    world = map_infinity_scene_to_world_document(
        {
            "theme": theme,
            "keywords": keywords,
            "worldId": f"w-{gen_type}",
            "summary": gen_type,
            "seedSignature": f"expand-{gen_type}-seed",
            "focalObjects": [{"id": "a", "label": "A"}],
        }
    )
    assert world["generator"]["type"] == gen_type
    assert world["objects"] == []
    expanded = expand_world_request(world)
    assert len(expanded["objects"]) > 0
    assert len(expanded.get("materials") or []) > 0
    assert len(expanded.get("lights") or []) > 0
    assert len(expanded.get("cameras") or []) > 0
    assert expanded.get("generator", {}).get("type") == gen_type
    assert expanded.get("promptBridge", {}).get("theme") == theme


@pytest.mark.skipif(not _EXPAND_READY, reason=_EXPAND_SKIP)
def test_expand_world_request_deterministic_same_seed():
    """AC: same stub seed → identical object ids / counts (deterministic)."""
    scene = {
        "theme": "mythic_threshold",
        "keywords": ["star", "4d"],
        "worldId": "det-world",
        "summary": "det",
        "seedSignature": "deterministic-expand-seed",
        "focalObjects": [{"id": "a"}],
    }
    stub = map_infinity_scene_to_world_document(scene)
    a = expand_world_request(stub)
    b = expand_world_request(stub)
    assert [o["id"] for o in a["objects"]] == [o["id"] for o in b["objects"]]
    assert len(a["objects"]) == len(b["objects"])
    assert json.dumps(a["objects"], sort_keys=True) == json.dumps(
        b["objects"], sort_keys=True
    )


def test_expand_world_request_passthrough_when_populated():
    """AC: already-populated worlds are returned unchanged (no Node required)."""
    world = {
        "schemaVersion": "engine3d-world/1.0",
        "id": "filled",
        "objects": [{"id": "o1"}],
        "materials": [],
        "lights": [],
        "cameras": [],
        "activeCameraId": "c",
        "generator": {"id": "g", "type": "star", "seed": 1, "params": {}},
    }
    out = expand_world_request(world)
    assert out is world


def test_expand_world_request_if_enabled_default_off(monkeypatch):
    """AC: opt-in expand defaults off (stub preserved)."""
    monkeypatch.delenv("PROMPT_SCENE_EXPAND_WORLD", raising=False)
    stub = map_infinity_scene_to_world_document(
        {
            "theme": "mythic_threshold",
            "keywords": [],
            "worldId": "w",
            "seedSignature": "opt-off",
        }
    )
    out = expand_world_request_if_enabled(stub)
    assert out["objects"] == []


def test_expand_missing_script_raises(tmp_path):
    """AC: missing expand script raises WorldExpandError when expand needed."""
    stub = map_infinity_scene_to_world_document(
        {
            "theme": "mythic_threshold",
            "keywords": [],
            "worldId": "w",
            "seedSignature": "missing-script",
        }
    )
    missing = tmp_path / "nope.mjs"
    with pytest.raises(WorldExpandError, match="expand script missing"):
        expand_world_request(stub, script_path=missing)


def test_default_expand_script_env_override(tmp_path, monkeypatch):
    """AC: ENGINE3D_EXPAND_SCRIPT wins over monorepo / sibling defaults."""
    override = tmp_path / "custom-expand.mjs"
    override.write_text("// override\n", encoding="utf-8")
    monkeypatch.setenv("ENGINE3D_EXPAND_SCRIPT", str(override))
    assert default_expand_script_path() == override


def test_default_expand_script_sibling_docker_layout(tmp_path, monkeypatch):
    """AC: when monorepo expand missing, resolve sibling ../engine3d-core/scripts/."""
    import mrs_map as mm

    monkeypatch.delenv("ENGINE3D_EXPAND_SCRIPT", raising=False)
    monkeypatch.setattr(mm, "_DEFAULT_EXPAND_SCRIPT", tmp_path / "missing-monorepo.mjs")

    docker_root = tmp_path / "app"
    bridge = docker_root / "prompt-scene-bridge"
    scripts = docker_root / "engine3d-core" / "scripts"
    scripts.mkdir(parents=True)
    bridge.mkdir(parents=True)
    expand = scripts / "expand-world-document.mjs"
    expand.write_text("// docker sibling\n", encoding="utf-8")

    monkeypatch.setattr(mm, "_BRIDGE_DIR", bridge)
    assert mm.default_expand_script_path() == expand
    assert _sibling_expand_script_path(bridge) == expand


def test_deterministic_seeds_same_infinity_payload():
    """AC: same infinity payload → same output.seed; fallback seedSignature is hashlib."""
    payload = {
        "theme": "gothic_ritual",
        "keywords": ["altar", "moon"],
        "mood": "ominous",
        "worldId": "fallback-world",
        "sceneId": "fallback:scene",
        "summary": "a gothic altar",
        "seedSignature": "fallback:deadbeef",
    }
    a = map_infinity_scene_to_scene_specification(payload)
    b = map_infinity_scene_to_scene_specification(payload)
    assert a["output"]["seed"] == b["output"]["seed"]

    fb1 = _fallback_infinity_scene("a gothic altar under a blood moon", note="t")
    fb2 = _fallback_infinity_scene("a gothic altar under a blood moon", note="t")
    assert fb1["seedSignature"] == fb2["seedSignature"]
    assert fb1["seedSignature"].startswith("fallback:")
    # Not Python's randomized hash(); fixed hex digest prefix.
    assert len(fb1["seedSignature"].split(":", 1)[1]) == 8
    spec1 = map_infinity_scene_to_scene_specification(fb1)
    spec2 = map_infinity_scene_to_scene_specification(fb2)
    assert spec1["output"]["seed"] == spec2["output"]["seed"]
