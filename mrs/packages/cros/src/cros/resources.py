"""Locate and load CROS specification resources (constitution, schemas, profiles).

Resources live *outside* ``src/`` — they are specifications, not code, and are read
by non-Python consumers too. They are therefore resolved relative to the package
root rather than via ``importlib.resources``.

Consequence, stated plainly: an installed wheel does not carry them. Shipping the
spec directories as package data is a tracked follow-up. Until then, ``cros`` is
usable from a source checkout, or with ``CROS_ROOT`` pointing at a directory that
contains ``constitution/``, ``schemas/`` and ``profiles/``.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

__all__ = [
    "PROFILE_IDS",
    "cros_root",
    "load_invariants",
    "load_profile",
    "load_schema",
    "schema_for_kind",
]

PROFILE_IDS: tuple[str, ...] = ("cros.dcc-offline", "cros.gen-ai-nim")

_KIND_TO_SCHEMA: dict[str, str] = {
    "CreativeIntent": "creative_intent",
    "RenderIntent": "render_intent",
    "RenderPlan": "render_plan",
    "RenderExecution": "render_execution",
    "RenderResult": "render_result",
    "RenderEvidence": "render_evidence",
    "ReplayRecord": "replay_record",
}


class ResourceNotFoundError(FileNotFoundError):
    """A requested specification resource is not present on disk."""


def cros_root() -> Path:
    """Return the CROS package root (the directory holding ``schemas/``).

    Override with the ``CROS_ROOT`` environment variable.
    """
    override = os.environ.get("CROS_ROOT")
    if override:
        return Path(override).resolve()
    # src/cros/resources.py -> src/cros -> src -> <package root>
    return Path(__file__).resolve().parents[2]


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ResourceNotFoundError(
            f"CROS resource missing: {path}. "
            "Run from a source checkout or set CROS_ROOT."
        )
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def load_invariants() -> dict[str, Any]:
    """Load ``constitution/invariants.json`` — the machine source of truth."""
    return _read_json(cros_root() / "constitution" / "invariants.json")


@lru_cache(maxsize=None)
def load_schema(name: str) -> dict[str, Any]:
    """Load a JSON Schema by stem (``"render_plan"``) or filename."""
    stem = name.removesuffix(".json").removesuffix(".schema")
    return _read_json(cros_root() / "schemas" / f"{stem}.schema.json")


@lru_cache(maxsize=None)
def load_profile(profile_id: str) -> dict[str, Any]:
    """Load a conformance profile by id (e.g. ``"cros.gen-ai-nim"``)."""
    if profile_id not in PROFILE_IDS:
        raise ValueError(
            f"unknown CROS profile {profile_id!r}; expected one of {PROFILE_IDS}"
        )
    return _read_json(cros_root() / "profiles" / f"{profile_id}.json")


def schema_for_kind(kind: str) -> dict[str, Any]:
    """Load the schema governing a lineage artifact ``kind``."""
    try:
        stem = _KIND_TO_SCHEMA[kind]
    except KeyError:
        raise ValueError(
            f"unknown CROS artifact kind {kind!r}; expected one of "
            f"{sorted(_KIND_TO_SCHEMA)}"
        ) from None
    return load_schema(stem)


def invariant(invariant_id: str) -> dict[str, Any]:
    """Return a single invariant record from the constitution."""
    for entry in load_invariants().get("invariants", []):
        if entry.get("id") == invariant_id:
            return entry
    raise ValueError(f"unknown invariant id {invariant_id!r}")
