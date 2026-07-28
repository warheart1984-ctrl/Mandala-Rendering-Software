"""Surface sovereignty checks before digital print.

STATUS: **enforced** — fail loudly with PrintErrorState codes.
Does not run SF Story→PromptSpec.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from printer.errors import PrintError, PrintErrorState

_CONTRACT_PATH = (
    Path(__file__).resolve().parent.parent / "governance" / "surface_contract.json"
)


def load_surface_contract() -> dict[str, Any]:
    if not _CONTRACT_PATH.is_file():
        raise PrintError(
            PrintErrorState.SURFACE_MISSING,
            f"surface_contract.json missing at {_CONTRACT_PATH}",
        )
    try:
        return json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PrintError(
            PrintErrorState.SURFACE_INVALID,
            f"surface_contract.json invalid JSON: {exc}",
        ) from exc


def check_render_request_surfaces(req: dict[str, Any]) -> PrintErrorState:
    """Validate declared surfaces for print. Raises PrintError on failure."""
    if not isinstance(req, dict):
        raise PrintError(PrintErrorState.SURFACE_INVALID, "RenderRequest must be object")

    for key in ("requestId", "intentId", "worldId", "payload"):
        if key not in req:
            raise PrintError(
                PrintErrorState.SURFACE_MISSING,
                f"RenderRequest missing required surface field: {key}",
            )

    payload = req["payload"]
    if not isinstance(payload, dict):
        raise PrintError(PrintErrorState.SURFACE_INVALID, "payload must be object")

    route = payload.get("route")
    render = payload.get("render")
    if not isinstance(render, dict):
        raise PrintError(
            PrintErrorState.SURFACE_MISSING,
            "payload.render required for print",
        )
    for dim in ("width", "height"):
        if dim not in render:
            raise PrintError(
                PrintErrorState.SURFACE_MISSING,
                f"payload.render.{dim} required",
            )

    # Ownership: no smuggled SF bodies (hash-only provenance)
    banned = {
        "promptSpec",
        "renderIntent",
        "promptComposer",
        "modelBackend",
        "iModelBackend",
    }
    stack = [req]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k in banned:
                    raise PrintError(
                        PrintErrorState.SURFACE_INVALID,
                        f"SF-owned body key forbidden at print intake: {k}",
                    )
                stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)

    if route == "scene-spec":
        spec = payload.get("sceneSpecification")
        if not isinstance(spec, dict):
            raise PrintError(
                PrintErrorState.SCENESPEC_GAP,
                "scene-spec route requires payload.sceneSpecification",
            )
        if spec.get("kind") not in (None, "SceneSpecification"):
            # allow missing kind (normalize later) but reject wrong kinds
            if spec.get("kind") != "SceneSpecification":
                raise PrintError(
                    PrintErrorState.SCENESPEC_GAP,
                    f"unexpected sceneSpecification.kind: {spec.get('kind')!r}",
                )
        entities = spec.get("entities")
        if not isinstance(entities, list) or len(entities) < 1:
            raise PrintError(
                PrintErrorState.SCENESPEC_GAP,
                "sceneSpecification.entities must be a non-empty list",
            )

    elif route == "engine3d-world":
        world = payload.get("engine3dWorldDocument")
        if not isinstance(world, dict):
            raise PrintError(
                PrintErrorState.ENGINE3D_BOUNDARY_FAIL,
                "engine3d-world requires payload.engine3dWorldDocument",
            )

    elif route not in {"proton-raster", "rt4d", "scene-spec", "engine3d-world"}:
        raise PrintError(
            PrintErrorState.SURFACE_INVALID,
            f"unsupported print route: {route!r}",
        )

    # AOV declaration check (beauty always required in print request aovs)
    contract = load_surface_contract()
    route_key = route if route in contract.get("requiredSurfaces", {}) else None
    if route_key:
        required = contract["requiredSurfaces"][route_key].get("aovs") or ["beauty"]
        declared = render.get("aovs") or ["beauty"]
        if isinstance(declared, list) and "beauty" not in declared and "beauty" in required:
            raise PrintError(
                PrintErrorState.AOV_MISMATCH,
                "print requires beauty AOV in declared aovs",
            )

    return PrintErrorState.OK
