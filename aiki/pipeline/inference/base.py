"""Abstract inference provider. Status: skeleton."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class InferenceRequest:
    task: str  # reasoning | image | vision | local | ...
    prompt: str
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceResponse:
    provider_id: str
    text: str
    stub: bool = True
    details: Mapping[str, Any] = field(default_factory=dict)


class InferenceProvider(ABC):
    """Common interface used by AIKI engines. Backends swap via config."""

    provider_id: str

    @abstractmethod
    def complete(self, request: InferenceRequest) -> InferenceResponse:
        """Return a completion. Stub adapters never leave process boundary."""
        raise NotImplementedError
