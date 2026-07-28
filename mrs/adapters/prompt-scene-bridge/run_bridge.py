#!/usr/bin/env python3
"""
Out-of-process prompt → MRS SceneSpecification / Engine3DWorldDocument bridge.

Invokes Project Infinity narrative text-to-3d lane when its source tree is on
PYTHONPATH (or --infinity-src). Never imported by Genblaze app/*.py.

Usage:
  set PYTHONPATH=<Infinity>/external/story_forge/src
  python run_bridge.py --prompt "a gothic altar under a blood moon" --json

Optional world expand (Node + engine3d-core dist):
  python run_bridge.py --prompt "…" --json --expand
  set PROMPT_SCENE_EXPAND_WORLD=1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

# Local mapper (no Infinity import)
_BRIDGE_DIR = Path(__file__).resolve().parent
if str(_BRIDGE_DIR) not in sys.path:
    sys.path.insert(0, str(_BRIDGE_DIR))

from mrs_map import (  # noqa: E402
    expand_world_request_if_enabled,
    map_infinity_scene_to_scene_specification,
    map_infinity_scene_to_world_document,
)


def _ensure_infinity_src(infinity_src: str | None) -> None:
    if not infinity_src:
        infinity_src = os.environ.get("INFINITY_STORY_SRC") or os.environ.get(
            "PROMPT_SCENE_INFINITY_SRC"
        )
    if not infinity_src:
        return
    root = Path(infinity_src).resolve()
    if root.is_dir() and str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _run_infinity_lane(prompt: str) -> dict[str, Any]:
    """Call TextTo3DWorldLane when available; else deterministic stub."""
    try:
        from story_forge.engine_adapter import (  # type: ignore
            DEFAULT_ENGINE_PROVIDER,
            create_engine_module,
        )
        from story_forge.text_to_3d_world_lane import (  # type: ignore
            LANE_ID,
            TextTo3DWorldLane,
        )
    except ImportError as exc:
        return _fallback_infinity_scene(prompt, note=f"import_failed:{exc}")

    engine = create_engine_module(DEFAULT_ENGINE_PROVIDER)
    lane = TextTo3DWorldLane(engine_module=engine)
    lane_input = {
        "lane": LANE_ID,
        "text": prompt,
        "sessionId": "mrs-prompt-bridge",
    }
    try:
        if hasattr(lane, "run_payload"):
            result = lane.run_payload(lane_input)
        else:
            raw = lane.run(lane_input)
            result = raw.to_payload() if hasattr(raw, "to_payload") else raw
    except Exception as exc:  # noqa: BLE001 — fall back offline
        return _fallback_infinity_scene(prompt, note=f"lane_failed:{exc}")

    scene = {}
    if isinstance(result, dict):
        scene = result.get("sceneSpec") or result.get("scene_spec") or {}
    if not isinstance(scene, dict) or not scene:
        return _fallback_infinity_scene(prompt, note="empty_lane_result")
    scene = dict(scene)
    scene["_lane"] = {
        "provider": getattr(engine, "provider_id", DEFAULT_ENGINE_PROVIDER),
        "keys": sorted(result.keys()) if isinstance(result, dict) else [],
        "lane": result.get("lane") if isinstance(result, dict) else LANE_ID,
    }
    return scene


def _fallback_infinity_scene(prompt: str, *, note: str) -> dict[str, Any]:
    """Offline stub when Infinity package is unavailable."""
    text = (prompt or "").strip().lower()
    keywords: list[str] = []
    for token in (
        "star",
        "4d",
        "mandala",
        "lattice",
        "altar",
        "moon",
        "garden",
        "archive",
        "tesseract",
    ):
        if token in text:
            keywords.append(token)
    theme = "mythic_threshold"
    mood = "steady"
    if "gothic" in text or "altar" in text or "blood" in text:
        theme = "gothic_ritual"
        mood = "ominous"
    elif "archive" in text or "ledger" in text:
        theme = "forbidden_archive"
        mood = "curious"
    elif "wild" in text or "garden" in text or "moor" in text:
        theme = "haunted_wilds"
        mood = "eerie"
    return {
        "sceneId": "fallback:scene",
        "worldId": "fallback-world",
        "summary": prompt[:200],
        "theme": theme,
        "mood": mood,
        "keywords": keywords,
        "focalObjects": [{"id": "anchor", "label": "Anchor"}],
        "seedSignature": (
            "fallback:"
            + hashlib.sha256((prompt or "").encode("utf-8")).hexdigest()[:8]
        ),
        "_lane": {"provider": "fallback", "note": note},
    }


def build_bridge_payload(
    prompt: str,
    *,
    width: int = 256,
    height: int = 192,
    samples: int = 4,
    max_depth: int = 4,
    expand_world: bool | None = None,
) -> dict[str, Any]:
    infinity_scene = _run_infinity_lane(prompt)
    scene_spec = map_infinity_scene_to_scene_specification(
        infinity_scene,
        width=width,
        height=height,
        samples=samples,
        max_depth=max_depth,
    )
    world_document = map_infinity_scene_to_world_document(infinity_scene)
    world_document = expand_world_request_if_enabled(
        world_document, enabled=expand_world
    )
    return {
        "ok": True,
        "prompt": prompt,
        "infinityScene": {
            k: v for k, v in infinity_scene.items() if not str(k).startswith("_")
        },
        "laneMeta": infinity_scene.get("_lane"),
        "sceneSpecification": scene_spec,
        "engine3dWorldDocument": world_document,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prompt → MRS scene bridge")
    parser.add_argument("--prompt", required=True, help="Natural language prompt")
    parser.add_argument("--json", action="store_true", help="Print JSON on stdout")
    parser.add_argument("--infinity-src", default=None, help="Path to story_forge/src")
    parser.add_argument("--width", type=int, default=256)
    parser.add_argument("--height", type=int, default=192)
    parser.add_argument("--samples", type=int, default=4)
    parser.add_argument("--max-depth", type=int, default=4)
    parser.add_argument(
        "--expand",
        action="store_true",
        help="Expand Engine3D generator stub via engine3d-core Node CLI",
    )
    args = parser.parse_args(argv)

    _ensure_infinity_src(args.infinity_src)

    expand = True if args.expand else None  # None → honor env PROMPT_SCENE_EXPAND_WORLD
    try:
        payload = build_bridge_payload(
            args.prompt,
            width=args.width,
            height=args.height,
            samples=args.samples,
            max_depth=args.max_depth,
            expand_world=expand,
        )
    except Exception as exc:
        err = {
            "ok": False,
            "error": str(exc),
            "trace": traceback.format_exc(limit=8),
        }
        print(json.dumps(err), flush=True)
        return 1

    if args.json or True:
        print(json.dumps(payload), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
