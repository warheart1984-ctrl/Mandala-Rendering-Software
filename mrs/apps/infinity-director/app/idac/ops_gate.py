"""IDAC operational helpers — route gate (no new Core concepts)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def _post_json(url: str, body: dict, timeout: float = 30.0) -> int:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code


def route_gate(director_base: str = "http://127.0.0.1:8791") -> dict[str, Any]:
    """Return route probe results; gate passes when no path returns 404."""
    base = director_base.rstrip("/")
    intent = {
        "mission_ref": "cecp/idac-stack-2026-07",
        "policy_ref": "RenderAccelContract/0.1.0",
        "domain": "render",
        "goal": {"statement": "route gate", "justification": "ops"},
        "constraints": {"prompt": "flat wall", "speed_profile": "fast"},
    }
    probes = {
        "/api/warmup": _post_json(f"{base}/api/warmup", {}),
        "/api/atcm/plan": _post_json(
            f"{base}/api/atcm/plan",
            {"width": 256, "height": 256, "prompt": "flat wall", "include_tiles": False},
        ),
        "/api/idac/intent": _post_json(f"{base}/api/idac/intent", intent),
    }
    failed = {path: code for path, code in probes.items() if code == 404}
    return {
        "director_base": base,
        "probes": probes,
        "pass": len(failed) == 0,
        "failed_404": failed,
    }


def service_health(url: str) -> tuple[bool, str | None]:
    try:
        with urllib.request.urlopen(f"{url.rstrip('/')}/health", timeout=5) as resp:
            body = json.loads(resp.read().decode())
            return True, str(body.get("service") or body.get("status"))
    except OSError:
        return False, None
