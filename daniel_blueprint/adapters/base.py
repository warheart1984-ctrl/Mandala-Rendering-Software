"""IRendererAdapter — Universal renderer interface (Section 2).

All concrete adapters must implement all six methods without exception.
No optional methods permitted at the interface level.
Renderer-specific extensions are added in the concrete class.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema


# --- Exceptions ---

class RendererInitError(Exception):
    """Renderer initialization failed."""
    pass


class SceneLoadError(Exception):
    """Scene loading failed."""
    pass


class SettingsValidationError(Exception):
    """Settings validation failed."""
    pass


class RenderPassError(Exception):
    """Render pass execution failed."""
    pass


class AOVNotFoundError(Exception):
    """Requested AOV not found."""
    pass


class TeardownError(Exception):
    """Teardown failed (logged, not propagated)."""
    pass


# --- Data Classes ---

@dataclass
class RenderSettings:
    """Universal render settings — populated from pipeline config, not renderer UI."""
    primary_samples: int = 512
    max_ray_depth: int = 8
    clamp_value: float = 10.0
    resolution: tuple = (1920, 1080)
    colorspace: str = "ACES_AP1_Linear"
    aov_manifest: List[str] = field(default_factory=list)
    frame_range: tuple = (1, 1)
    output_dir: str = ""
    random_seed: int = 0xDEADBEEF
    # Camera invariants (Section 7)
    focal_length_mm: float = 35.0
    aperture_fstop: float = 2.8
    shutter_open: float = -0.25
    shutter_close: float = 0.25
    motion_blur_samples: int = 5
    # Subdivision invariants (Section 7)
    subdivision_levels: Dict[str, int] = field(default_factory=dict)
    displacement_amplitudes: Dict[str, float] = field(default_factory=dict)


@dataclass
class PassResult:
    """Result of a render pass execution."""
    pass_id: str
    frame: int
    status: str  # "success" | "failed" | "aborted"
    output_paths: Dict[str, str]  # {"aov_name": "/path/to/file.exr"}
    render_time_seconds: float
    sample_count: int
    error: Optional[str] = None


@dataclass
class AOVBuffer:
    """Normalized AOV buffer retrieved from renderer."""
    aov_name: str
    frame: int
    width: int
    height: int
    channels: List[str]  # ["R", "G", "B"] or ["X", "Y", "Z"] etc.
    bit_depth: str  # "half" | "full"
    data_ref: Any  # Opaque reference to buffer data (numpy array, file path, etc.)


@dataclass
class SceneHandle:
    """Opaque handle to loaded scene in renderer context."""
    renderer_type: str
    scene_path: str
    internal_handle: Any
    metadata: Dict[str, Any] = field(default_factory=dict)


# --- Interface ---

class IRendererAdapter(ABC):
    """Universal renderer interface.

    All concrete adapters must implement all six methods without exception.
    No optional methods permitted at the interface level.
    Renderer-specific extensions are added in the concrete class.
    """

    @property
    @abstractmethod
    def renderer_name(self) -> str:
        """Human-readable renderer name (e.g., 'Cycles', 'Arnold', 'Redshift')."""
        pass

    @property
    @abstractmethod
    def renderer_version(self) -> str:
        """Renderer version string for invariant locking (Section 7)."""
        pass

    @property
    @abstractmethod
    def supported_aovs(self) -> List[str]:
        """List of AOV names this renderer can produce."""
        pass

    @abstractmethod
    def initialize(self, config: Dict[str, Any]) -> bool:
        """Connect to renderer runtime. Validate license. Load OCIO config. Set working directory.

        Args:
            config: Initialization config with keys:
                - working_dir: str
                - ocio_config_path: str
                - device: str (e.g., "GPU", "CPU", "CUDA:0")
                - license_server: str (optional)
                - log_level: str

        Returns:
            True on success.

        Raises:
            RendererInitError: On any failure.
        """
        pass

    @abstractmethod
    def loadScene(self, scene_path: str, manifest: Dict[str, Any]) -> SceneHandle:
        """Load scene into renderer. Validate all asset references. Apply LOD policy from manifest.

        Args:
            scene_path: Path to USD/Alembic/FBX scene file.
            manifest: Asset manifest with LOD policy, texture paths, etc.

        Returns:
            SceneHandle: Opaque handle for subsequent operations.

        Raises:
            SceneLoadError: If any required asset is missing.
        """
        pass

    @abstractmethod
    def setRenderSettings(self, settings: RenderSettings) -> None:
        """Apply normalized RenderSettings to renderer internals.

        Translate universal params to renderer-specific equivalents.
        Validate all values against renderer limits before applying.

        Args:
            settings: Universal render settings.

        Raises:
            SettingsValidationError: On out-of-range or unsupported values.
        """
        pass

    @abstractmethod
    def executePass(self, pass_id: str, frame: int) -> PassResult:
        """Execute named render pass for given frame. Block until complete.

        Args:
            pass_id: Pass identifier (e.g., "primary_ray", "gi", "volume", "denoise").
            frame: Frame number (1-indexed).

        Returns:
            PassResult with status, output paths, render time.

        Raises:
            RenderPassError: On render failure; include renderer log path.
        """
        pass

    @abstractmethod
    def fetchAOV(self, aov_name: str, frame: int) -> AOVBuffer:
        """Retrieve AOV buffer by name and frame. Normalize channel layout.

        Args:
            aov_name: AOV name from manifest.
            frame: Frame number.

        Returns:
            AOVBuffer with normalized data.

        Raises:
            AOVNotFoundError: If AOV was not rendered or cannot be found.
        """
        pass

    @abstractmethod
    def teardown(self) -> None:
        """Release all renderer resources. Flush logs. Write session summary.

        Catch and log TeardownError — do not re-raise.
        """
        pass

    # --- Optional helper methods for invariant validation (Section 7) ---

    def get_seed(self) -> int:
        """Return current random seed for invariant validation (Section 7.1)."""
        return 0

    def get_shutter_open(self) -> float:
        """Return shutter open time for invariant validation (Section 7.3)."""
        return -0.25

    def get_shutter_close(self) -> float:
        """Return shutter close time for invariant validation (Section 7.3)."""
        return 0.25

    def get_mb_samples(self) -> int:
        """Return motion blur sample count for invariant validation (Section 7.3)."""
        return 5

    def get_version(self) -> str:
        """Return renderer version string for invariant validation (Section 7.3)."""
        return self.renderer_version


# --- Registry ---

_ADAPTER_REGISTRY: Dict[str, type] = {}


def register_adapter(name: str, adapter_class: type) -> None:
    """Register a concrete adapter class."""
    _ADAPTER_REGISTRY[name.lower()] = adapter_class


def get_adapter(name: str) -> type:
    """Get registered adapter class by name."""
    adapter = _ADAPTER_REGISTRY.get(name.lower())
    if not adapter:
        raise ValueError(f"No adapter registered for: {name}. Available: {list(_ADAPTER_REGISTRY.keys())}")
    return adapter


def list_adapters() -> List[str]:
    """List all registered adapter names."""
    return list(_ADAPTER_REGISTRY.keys())