"""Backward-compatible execute_plan wrapper."""

from __future__ import annotations

import httpx

from app.config import Settings
from app.idac.core.contracts import EvidenceContract, ExecutionPlan, IntentContract
from app.idac.domains.rendering.runtime import RenderExecutor


def execute_plan(
    plan: ExecutionPlan,
    *,
    intent: IntentContract,
    settings: Settings,
    http_client: httpx.Client | None = None,
) -> EvidenceContract:
    return RenderExecutor(settings).execute(plan, intent=intent, http_client=http_client)


__all__ = ["RenderExecutor", "execute_plan"]
