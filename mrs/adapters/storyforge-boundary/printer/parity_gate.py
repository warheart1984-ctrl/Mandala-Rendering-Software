"""Parity gate for optional WebGPU print backend.

STATUS: **partial** — allow-list expands only when MRS_PRINT_WEBGPU=1 and a
passing replay receipt is present. Live WebGPU execute remains CPU-fallback
(partial) until Node has navigator.gpu + parity budgets in CI.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _truthy(raw: str | None) -> bool:
    return (raw or "").strip().lower() in {"1", "true", "yes", "on"}


def load_parity_receipt(path: Path | str | None) -> dict[str, Any] | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def parity_receipt_passes(receipt: dict[str, Any] | None) -> bool:
    if not receipt:
        return False
    status = (receipt.get("comparison") or {}).get("status")
    if status != "pass":
        return False
    backends = receipt.get("backends") or {}
    if not backends.get("cpu") or not backends.get("gpu"):
        return False
    return True


def webgpu_print_allowed(
    *,
    env: dict[str, str] | None = None,
    receipt_path: str | Path | None = None,
) -> tuple[bool, str]:
    """Return (allowed, reason)."""
    e = env if env is not None else os.environ
    if not _truthy(e.get("MRS_PRINT_WEBGPU")):
        return False, "MRS_PRINT_WEBGPU not enabled"
    path = receipt_path or e.get("MRS_PRINT_PARITY_RECEIPT")
    receipt = load_parity_receipt(path)
    if not parity_receipt_passes(receipt):
        return False, "parity receipt missing or comparison.status != pass"
    return True, "MRS_PRINT_WEBGPU=1 and parity receipt pass"


def allowed_backends(
    *,
    env: dict[str, str] | None = None,
    receipt_path: str | Path | None = None,
) -> frozenset[str]:
    base = {"cpu"}
    ok, _ = webgpu_print_allowed(env=env, receipt_path=receipt_path)
    if ok:
        base.add("webgpu")
    return frozenset(base)
