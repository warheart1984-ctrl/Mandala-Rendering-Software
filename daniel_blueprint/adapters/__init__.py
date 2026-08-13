"""Adapters package — IRendererAdapter and concrete implementations."""

from .base import (
    IRendererAdapter,
    RenderSettings,
    PassResult,
    AOVBuffer,
    SceneHandle,
    RendererInitError,
    SceneLoadError,
    SettingsValidationError,
    RenderPassError,
    AOVNotFoundError,
    TeardownError,
    register_adapter,
    get_adapter,
    list_adapters,
)

from .concrete import (
    CyclesAdapter,
    ArnoldAdapter,
    RedshiftAdapter,
    KarmaAdapter,
)

from .axiom_x_adapter import (
    AxiomXAdapter,
)

__all__ = [
    # Base interface
    "IRendererAdapter",
    "RenderSettings",
    "PassResult",
    "AOVBuffer",
    "SceneHandle",
    "RendererInitError",
    "SceneLoadError",
    "SettingsValidationError",
    "RenderPassError",
    "AOVNotFoundError",
    "TeardownError",
    "register_adapter",
    "get_adapter",
    "list_adapters",
    # Concrete adapters
    "CyclesAdapter",
    "ArnoldAdapter",
    "RedshiftAdapter",
    "KarmaAdapter",
    "AxiomXAdapter",
]