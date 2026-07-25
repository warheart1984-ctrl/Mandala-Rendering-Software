"""Seedance cloud video adapter skeleton (CROS).

Status: **skeleton**. Implements ``IRenderAdapter`` shape for a future
``cros.gen-ai-seedance`` (or reuse ``cros.gen-ai-nim`` provider-contract)
profile. Does **not** call fal/ByteDance from this package by default —
genblaze-media owns the live HTTP path. CI-006: no Story Forge / host imports.
"""

from __future__ import annotations

from typing import Any, Iterator, Mapping

from cros.adapter import (
    AdapterCapabilities,
    AdapterRef,
    EnvironmentReport,
    VerifyReport,
)
from cros.artifacts import ProgressEvent, RenderPlan, sha256_bytes

__all__ = ["SeedanceRenderAdapter"]


class SeedanceRenderAdapter:
    """Skeleton adapter declaring Seedance cloud video capability."""

    ADAPTER_ID = "cros.seedance"
    ADAPTER_VERSION = "0.1.0-skeleton"

    def __init__(
        self,
        *,
        profiles: tuple[str, ...] = ("cros.gen-ai-nim",),
        fal_key_present: bool = False,
    ) -> None:
        self._profiles = profiles
        self._fal_key_present = fal_key_present
        self._shut_down = False

    def discoverCapabilities(self) -> AdapterCapabilities:
        return AdapterCapabilities(
            adapter=AdapterRef(self.ADAPTER_ID, self.ADAPTER_VERSION),
            profiles=self._profiles,
            modality=("video",),
            capability_names=("seedance.text2video",),
            features={
                "status": "skeleton",
                "gateway": "fal.ai",
                "modelDefault": "bytedance/seedance-2.0/text-to-video",
                "replayClass": "provider-contract",
                "temporalLayers": "declared-not-implemented",
                "livePath": "mrs/apps/genblaze-media (GENBLAZE_VIDEO_BACKEND=seedance)",
            },
        )

    def validateEnvironment(self) -> EnvironmentReport:
        if self._fal_key_present:
            return EnvironmentReport(
                ok=True,
                detail="FAL_KEY/SEEDANCE_API_KEY present (credential check only).",
                environment={"falKey": True},
            )
        return EnvironmentReport(
            ok=False,
            detail=(
                "No fal key in this skeleton check. Live generate is owned by "
                "genblaze-media SeedanceVideoProvider."
            ),
            environment={"falKey": False},
        )

    def compilePlan(self, render_intent: Mapping[str, Any]) -> RenderPlan:
        profile = str(render_intent.get("profile") or "")
        if profile and profile not in self._profiles:
            raise ValueError(f"profile {profile!r} not in {self._profiles}")
        intent_hash = sha256_bytes(
            str(render_intent.get("id") or render_intent).encode("utf-8")
        )
        caps = self.discoverCapabilities()
        return RenderPlan(
            id=f"plan-seedance-{intent_hash[:12]}",
            profile=profile or self._profiles[0],
            derived_from=str(render_intent.get("id") or "intent-unknown"),
            render_intent_hash=intent_hash,
            adapter=caps.adapter.to_dict(),
            capabilities_hash=caps.content_hash(),
            steps=(
                {
                    "id": "seedance.text2video",
                    "capability": "seedance.text2video",
                    "model": "bytedance/seedance-2.0/text-to-video",
                    "status": "skeleton",
                },
            ),
        )

    def execute(self, plan: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError(
            "SeedanceRenderAdapter.execute is skeleton — use genblaze-media "
            "SeedanceVideoProvider for live fal calls."
        )

    def streamProgress(self, execution_id: str) -> Iterator[ProgressEvent]:
        yield ProgressEvent(
            phase="idle",
            fraction=0.0,
            message=f"skeleton; no execution ({execution_id})",
        )
        return
        yield  # pragma: no cover

    def collectArtifacts(self, execution: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError("SeedanceRenderAdapter.collectArtifacts: skeleton.")

    def verify(self, result: Mapping[str, Any]) -> VerifyReport:
        return VerifyReport(
            ok=False,
            detail="SeedanceRenderAdapter verifies nothing until execute is implemented.",
            checks={"skeleton": True},
        )

    def shutdown(self) -> None:
        self._shut_down = True
