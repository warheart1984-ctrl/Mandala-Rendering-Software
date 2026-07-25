"""JSON Schema validation for every lineage artifact, plus lineage completeness."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from cros.artifacts import LINEAGE_ORDER, STAGES, validate_artifact
from cros.evidence import build_unverified_replay_record
from cros.resources import load_schema, schema_for_kind
from cros.validation import validate_lineage
from conftest import build_gen_ai_lineage


SCHEMA_STEMS = (
    "creative_intent",
    "render_intent",
    "render_plan",
    "render_execution",
    "render_result",
    "render_evidence",
    "replay_record",
)


def test_all_seven_schema_files_exist(package_root: Path):
    schemas = package_root / "schemas"
    for stem in SCHEMA_STEMS:
        path = schemas / f"{stem}.schema.json"
        assert path.is_file(), f"missing schema: {path}"
        data = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(data)


def test_lineage_md_exists(package_root: Path):
    assert (package_root / "schemas" / "lineage.md").is_file()


def test_stage_table_covers_all_kinds():
    assert tuple(STAGES) == LINEAGE_ORDER
    # Every non-origin stage has both a predecessor and a hash field.
    for kind, spec in STAGES.items():
        if kind == "CreativeIntent":
            assert spec.predecessor is None
            assert spec.predecessor_hash_field is None
        else:
            assert spec.predecessor in STAGES
            assert spec.predecessor_hash_field


def test_sample_lineage_validates_against_schemas():
    lineage = build_gen_ai_lineage()
    record = build_unverified_replay_record(lineage["RenderEvidence"])
    lineage["ReplayRecord"] = record
    for kind in LINEAGE_ORDER:
        artifact = lineage[kind]
        validate_artifact(artifact)
        # Also validate via the raw schema loader to prove the resource path works.
        validator = Draft202012Validator(
            schema_for_kind(kind),
            format_checker=Draft202012Validator.FORMAT_CHECKER,
        )
        errors = list(validator.iter_errors(artifact))
        assert not errors, f"{kind}: {errors[0].message if errors else ''}"


def test_schema_rejects_missing_required_field():
    lineage = build_gen_ai_lineage()
    bad = dict(lineage["CreativeIntent"])
    del bad["author"]
    with pytest.raises(Exception):
        validate_artifact(bad)


def test_schema_rejects_unknown_profile():
    lineage = build_gen_ai_lineage()
    bad = dict(lineage["CreativeIntent"])
    bad["profile"] = "cros.does-not-exist"
    # Drop contentHash so we re-seal isn't needed — schema fails on enum first.
    with pytest.raises(Exception):
        validate_artifact(bad)


def test_full_chain_including_replay_is_intact():
    lineage = build_gen_ai_lineage()
    lineage["ReplayRecord"] = build_unverified_replay_record(lineage["RenderEvidence"])
    result = validate_lineage(lineage)
    assert result.ok, result.findings


def test_load_schema_by_stem():
    for stem in SCHEMA_STEMS:
        schema = load_schema(stem)
        assert schema.get("$schema")
        assert schema.get("title")
