"""IRenderAdapter — the CROS backend contract.

Status: **skeleton**. This module defines a ``typing.Protocol`` and a
``NullRenderAdapter`` test double. No real adapter — DCC or generative —
exists in this package.

Method names retain the architecture's camelCase spelling so that the Python
Protocol, the schemas, and any future C++/C# mirror name the same contract.
They are not PEP 8 snake_case by design.

CI-006 (adapter isolation) bans sibling-adapter, host-application, and
narrative-layer imports. The import scan is in :mod:`cros.validation`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterator, Mapping, Protocol, runtime_checkable

from cros.artifacts import ProgressEvent, RenderPlan, canonical_hash

__all__ = [
    "AdapterCapabilities",
    "AdapterRef",
    "EnvironmentReport",
    "IRenderAdapter",
    "NullRenderAdapter",
    "VerifyReport",
]


@dataclass(frozen=True)
class AdapterRef:
    """Stable identity of an adapter (id + version)."""

    id: str
    version: str

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "version": self.version}


@dataclass(frozen=True)
class AdapterCapabilities:
    """What an adapter declares it can do.

    ``capability_names`` is the set CI-002 checks a plan's
    ``requiresCapabilities`` against. Declaring a capability does not mean it
    is implemented — it means the adapter claims it can satisfy it.
    """

    adapter: AdapterRef
    profiles: tuple[str, ...]
    modality: tuple[str, ...]
    capability_names: tuple[str, ...]
    features: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter": self.adapter.to_dict(),
            "profiles": list(self.profiles),
            "modality": list(self.modality),
            "capabilityNames": list(self.capability_names),
            "features": dict(self.features),
        }

    def content_hash(self) -> str:
        return canonical_hash(self.to_dict())


@dataclass(frozen=True)
class EnvironmentReport:
    """Result of ``validateEnvironment``. Status: skeleton."""

    ok: bool
    detail: str
    environment: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VerifyReport:
    """Result of ``verify``. Status: skeleton."""

    ok: bool
    detail: str
    checks: Mapping[str, bool] = field(default_factory=dict)


@runtime_checkable
class IRenderAdapter(Protocol):
    """Lifecycle contract every CROS backend must satisfy.

    Implementations MUST NOT import sibling adapters, the host application, or
    a narrative/authoring layer (CI-006).
    """

    def discoverCapabilities(self) -> AdapterCapabilities:
        """Declare what this adapter can do. Pure; no I/O required."""
        ...

    def validateEnvironment(self) -> EnvironmentReport:
        """Confirm the local environment can run this adapter.

        Offline profiles check renderer/driver/OCIO presence. Generative
        profiles check credential presence and endpoint reachability. Status of
        any real check: **not implemented**.
        """
        ...

    def compilePlan(self, render_intent: Mapping[str, Any]) -> RenderPlan:
        """Compile a sealed RenderIntent into a RenderPlan for this adapter.

        Must raise if the intent's profile is outside
        ``discoverCapabilities().profiles``, or if the intent asks for a
        capability this adapter did not declare (CI-002).
        """
        ...

    def execute(self, plan: Mapping[str, Any]) -> Mapping[str, Any]:
        """Run a sealed RenderPlan. Returns a sealed RenderExecution.

        Must not claim completion — that is CI-004 / stage 6.
        """
        ...

    def streamProgress(self, execution_id: str) -> Iterator[ProgressEvent]:
        """Yield progress observations for an in-flight execution (CI-003)."""
        ...

    def collectArtifacts(self, execution: Mapping[str, Any]) -> Mapping[str, Any]:
        """Collect outputs into a sealed RenderResult. Not a completion signal."""
        ...

    def verify(self, result: Mapping[str, Any]) -> VerifyReport:
        """Adapter-local sanity checks (hashes present, files readable, etc.)."""
        ...

    def shutdown(self) -> None:
        """Release resources. Idempotent."""
        ...


class NullRenderAdapter:
    """Test double that implements the Protocol and renders nothing.

    Exists so ``isinstance(adapter, IRenderAdapter)`` and lifecycle-shape tests
    have something concrete to call. It is not a backend.
    """

    ADAPTER_ID = "cros.null"
    ADAPTER_VERSION = "0.0.0"

    def __init__(self, *, profiles: tuple[str, ...] = ("cros.gen-ai-nim",)) -> None:
        self._profiles = profiles
        self._shut_down = False

    def discoverCapabilities(self) -> AdapterCapabilities:
        return AdapterCapabilities(
            adapter=AdapterRef(self.ADAPTER_ID, self.ADAPTER_VERSION),
            profiles=self._profiles,
            modality=("image",),
            capability_names=("null.render",),
            features={"renders": False, "status": "test-double"},
        )

    def validateEnvironment(self) -> EnvironmentReport:
        return EnvironmentReport(
            ok=True,
            detail="NullRenderAdapter: no environment required (test double).",
        )

    def compilePlan(self, render_intent: Mapping[str, Any]) -> RenderPlan:
        raise NotImplementedError(
            "NullRenderAdapter.compilePlan: use cros.planning.derive_plan for "
            "the gen-ai subset; this double does not plan."
        )

    def execute(self, plan: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError("NullRenderAdapter.execute: renders nothing.")

    def streamProgress(self, execution_id: str) -> Iterator[ProgressEvent]:
        yield ProgressEvent(phase="idle", fraction=0.0, message="null")
        return
        yield  # pragma: no cover — makes this a generator for type checkers

    def collectArtifacts(self, execution: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError("NullRenderAdapter.collectArtifacts: no artifacts.")

    def verify(self, result: Mapping[str, Any]) -> VerifyReport:
        return VerifyReport(ok=False, detail="NullRenderAdapter verifies nothing.")

    def shutdown(self) -> None:
        self._shut_down = True
