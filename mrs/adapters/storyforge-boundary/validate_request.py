"""Validate StoryForge Runtime Spec v1.0 RenderRequest for MRS intake.

Status: **enforced** by unit tests in test_boundary.py.
Does not implement PromptComposer / IModelBackend.
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0"
ALLOWED_ROUTES = frozenset({"scene-spec", "engine3d-world", "proton-raster", "rt4d"})

# SF-owned bodies must not cross as mutable objects — hashes only.
_SMUGGLED_KEYS = frozenset(
    {
        "promptSpec",
        "renderIntent",
        "promptComposer",
        "modelBackend",
        "iModelBackend",
        "PromptSpec",
        "RenderIntent",
    }
)


class RenderRequestValidationError(ValueError):
    """Intake refused — invalid or ownership-breaching RenderRequest."""


def _require_str(obj: dict[str, Any], key: str) -> str:
    val = obj.get(key)
    if not isinstance(val, str) or not val.strip():
        raise RenderRequestValidationError(f"missing or empty string field: {key}")
    return val


def _scan_smuggled(obj: Any, path: str = "$") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in _SMUGGLED_KEYS:
                raise RenderRequestValidationError(
                    f"ownership breach: mutable SF body key forbidden at {path}.{k} "
                    "(opaque hashes under provenance only)"
                )
            _scan_smuggled(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _scan_smuggled(item, f"{path}[{i}]")


def validate_render_request(data: Any) -> dict[str, Any]:
    """Validate and return a deep-copied RenderRequest dict.

    Raises RenderRequestValidationError on refuse.
    """
    if not isinstance(data, dict):
        raise RenderRequestValidationError("RenderRequest must be a JSON object")

    _scan_smuggled(data)

    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise RenderRequestValidationError(
            f"schemaVersion must be {SCHEMA_VERSION!r}"
        )

    request_id = _require_str(data, "requestId")
    intent_id = _require_str(data, "intentId")
    world_id = _require_str(data, "worldId")

    payload = data.get("payload")
    if not isinstance(payload, dict):
        raise RenderRequestValidationError("payload must be an object")

    route = payload.get("route")
    if route not in ALLOWED_ROUTES:
        raise RenderRequestValidationError(
            f"payload.route must be one of {sorted(ALLOWED_ROUTES)}"
        )

    render = payload.get("render")
    if not isinstance(render, dict):
        raise RenderRequestValidationError("payload.render must be an object")
    for dim in ("width", "height"):
        v = render.get(dim)
        if not isinstance(v, int) or isinstance(v, bool) or v < 8 or v > 4096:
            raise RenderRequestValidationError(
                f"payload.render.{dim} must be int in [8, 4096]"
            )

    provenance = data.get("provenance")
    if provenance is not None:
        if not isinstance(provenance, dict):
            raise RenderRequestValidationError("provenance must be an object")
        for banned in _SMUGGLED_KEYS:
            if banned in provenance:
                raise RenderRequestValidationError(
                    f"provenance must not contain {banned}"
                )

    out = deepcopy(data)
    # Ensure required strings are stripped copies for determinism of echo.
    out["requestId"] = request_id.strip()
    out["intentId"] = intent_id.strip()
    out["worldId"] = world_id.strip()
    return out


def load_and_validate(path: str | Path) -> dict[str, Any]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return validate_render_request(raw)


def schema_path() -> Path:
    return Path(__file__).resolve().parent / "schemas" / "RenderRequest.schema.json"
