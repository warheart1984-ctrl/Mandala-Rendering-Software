"""Route a validated RenderRequest to MRS paths.

Status:
  * validate + refuse / echo — **partial** (unit tests)
  * deep execute (Node CLIs) — **partial** when ``execute=True`` or
    ``MRS_RENDER_REQUEST_EXECUTE=1``
  * SF PromptComposer / IModelBackend — never run here (**declared** SF-owned)
"""

from __future__ import annotations

import os
from typing import Any

from validate_request import (
    RenderRequestValidationError,
    validate_render_request,
)


def _provenance_from(req: dict[str, Any]) -> dict[str, Any]:
    prov: dict[str, Any] = {
        "intentId": req["intentId"],
        "worldId": req["worldId"],
    }
    if "timelineId" in req:
        prov["timelineId"] = req["timelineId"]
    if "timeSeconds" in req:
        prov["timeSeconds"] = req["timeSeconds"]
    if "parameters" in req:
        prov["parameters"] = req["parameters"]
    return prov


def _refuse(req: dict[str, Any] | None, code: str, message: str) -> dict[str, Any]:
    base_id = (req or {}).get("requestId", "unknown")
    prov = (
        _provenance_from(req)
        if req and "intentId" in req and "worldId" in req
        else {"intentId": "unknown", "worldId": "unknown"}
    )
    return {
        "schemaVersion": "1.0",
        "requestId": base_id,
        "status": "refused",
        "provenance": prov,
        "routeUsed": "none",
        "error": {"code": code, "message": message},
        "mapping": {"note": "refused before MRS deep execution"},
    }


def _env_execute_default() -> bool:
    return os.environ.get("MRS_RENDER_REQUEST_EXECUTE", "0").strip() in {
        "1",
        "true",
        "True",
        "yes",
        "YES",
    }


def route_render_request(
    data: Any,
    *,
    execute: bool | None = None,
    out_dir: Any = None,
) -> dict[str, Any]:
    """Validate then route. Returns RenderResult-shaped dict.

    When ``execute`` is true (or env MRS_RENDER_REQUEST_EXECUTE=1), deep Node
    paths run via ``execute.py``. Otherwise echo / skeleton notes only.
    """
    try:
        req = validate_render_request(data)
    except RenderRequestValidationError as exc:
        return _refuse(
            data if isinstance(data, dict) else None,
            "validation_failed",
            str(exc),
        )

    do_execute = _env_execute_default() if execute is None else bool(execute)
    route = req["payload"]["route"]
    result: dict[str, Any] = {
        "schemaVersion": "1.0",
        "requestId": req["requestId"],
        "status": "ok",
        "provenance": _provenance_from(req),
        "routeUsed": route,
        "artifacts": [],
        "mapping": {
            "adapter": "mrs/adapters/storyforge-boundary",
            "sfOwnedStages": "declared-not-implemented-in-mrs",
            "execute": do_execute,
        },
    }

    if do_execute:
        try:
            from execute import ExecuteError, execute_route

            deep = execute_route(req, out_dir=out_dir)
        except Exception as exc:  # noqa: BLE001 — map to RenderResult error
            # ImportError / ExecuteError / OSError all become honest error
            err_code = (
                "execute_failed"
                if exc.__class__.__name__ != "ExecuteError"
                else "execute_failed"
            )
            try:
                from execute import ExecuteError as _EE

                if isinstance(exc, _EE):
                    err_code = "execute_failed"
            except ImportError:
                pass
            result["status"] = "error"
            result["error"] = {"code": err_code, "message": str(exc)}
            result["mapping"]["statusTag"] = "partial"
            result["mapping"]["mappedTo"] = "deep execute attempted"
            return result

        result["artifacts"] = deep.get("artifacts") or []
        result["mapping"]["mappedTo"] = deep.get("mappedTo")
        result["mapping"]["statusTag"] = deep.get("statusTag", "partial")
        if "hashes" in deep:
            result["mapping"]["hashes"] = deep["hashes"]
        if "sceneSpecification" in deep:
            result["sceneSpecification"] = deep["sceneSpecification"]
        elif route == "scene-spec" and isinstance(
            req["payload"].get("sceneSpecification"), dict
        ):
            result["sceneSpecification"] = req["payload"]["sceneSpecification"]
        if "engine3dWorldDocument" in deep:
            result["engine3dWorldDocument"] = deep["engine3dWorldDocument"]
        if "cliProvenance" in deep:
            result["mapping"]["cliProvenance"] = deep["cliProvenance"]
        if "evidence" in deep:
            result["mapping"]["protonEvidence"] = deep["evidence"]
        return result

    # --- non-execute: echo / skeleton (preserves prior trail behavior) ---
    if route == "scene-spec":
        spec = req["payload"].get("sceneSpecification")
        if not isinstance(spec, dict):
            return _refuse(
                req,
                "missing_scene_specification",
                "route scene-spec requires payload.sceneSpecification object",
            )
        result["sceneSpecification"] = spec
        result["mapping"]["mappedTo"] = (
            "SceneSpecification (embedded intake; set "
            "MRS_RENDER_REQUEST_EXECUTE=1 for render-scene)"
        )
        result["mapping"]["statusTag"] = "partial"
        return result

    if route == "engine3d-world":
        world = req["payload"].get("engine3dWorldDocument")
        if not isinstance(world, dict):
            return _refuse(
                req,
                "missing_engine3d_world",
                "route engine3d-world requires payload.engine3dWorldDocument",
            )
        result["engine3dWorldDocument"] = world
        result["mapping"]["mappedTo"] = (
            "Engine3DWorldDocument (echo; execute=1 for still attempt)"
        )
        result["mapping"]["statusTag"] = "skeleton"
        return result

    if route == "proton-raster":
        result["mapping"]["mappedTo"] = (
            "declared map toward mrs/adapters/proton-raster-bridge/ "
            "(set MRS_RENDER_REQUEST_EXECUTE=1 to run)"
        )
        result["mapping"]["statusTag"] = "skeleton"
        return result

    if route == "rt4d":
        result["mapping"]["mappedTo"] = (
            "declared RT4D path (set MRS_RENDER_REQUEST_EXECUTE=1 to run)"
        )
        result["mapping"]["statusTag"] = "skeleton"
        return result

    return _refuse(req, "unknown_route", f"unhandled route: {route}")
