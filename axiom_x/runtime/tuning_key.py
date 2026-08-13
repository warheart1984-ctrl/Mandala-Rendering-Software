"""Axiom-X TuningKey — fingerprint for workgroup autotuning cache.

STATUS: **partial** — core fields implemented; backend-specific extensions declared.

The TuningKey uniquely identifies a computational workload + execution environment
so that cached tuning decisions are only reused when the full context matches.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class DeviceFingerprint:
    """Hardware + driver identity for cache isolation."""
    vendor: str
    name: str
    architecture: Optional[str] = None
    compute_units: int = 0
    global_memory_bytes: int = 0
    driver_version: Optional[str] = None
    # OpenCL-specific limits (queried at runtime)
    max_work_group_size: int = 0
    max_work_item_sizes: List[int] = field(default_factory=list)
    max_local_mem_size: int = 0
    # Extensible for CUDA/HIP/Metal/Vulkan
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        """Return fields that contribute to the fingerprint hash."""
        return {
            "vendor": self.vendor,
            "name": self.name,
            "architecture": self.architecture,
            "compute_units": self.compute_units,
            "global_memory_bytes": self.global_memory_bytes,
            "driver_version": self.driver_version,
            "max_work_group_size": self.max_work_group_size,
            "max_work_item_sizes": self.max_work_item_sizes,
            "max_local_mem_size": self.max_local_mem_size,
            "extra": self.extra,
        }

    def fingerprint_hash(self) -> str:
        """SHA-256 hash of the device fingerprint."""
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"


@dataclass
class KernelFingerprint:
    """Kernel identity + build configuration."""
    name: str
    version: str
    source_hash: str  # sha256:... of kernel source
    build_options_hash: str  # sha256:... of build options string
    precision: str  # fp32 | fp16 | bf16 | mixed | fp64
    algorithm_variant: str = "default"  # e.g., "legacy_still", "cl_gen_still", "fused_abc"
    # OpenCL-specific
    local_mem_usage_bytes: int = 0
    required_work_group_size: Optional[List[int]] = None  # from __attribute__((reqd_work_group_size))
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "source_hash": self.source_hash,
            "build_options_hash": self.build_options_hash,
            "precision": self.precision,
            "algorithm_variant": self.algorithm_variant,
            "local_mem_usage_bytes": self.local_mem_usage_bytes,
            "required_work_group_size": self.required_work_group_size,
            "extra": self.extra,
        }

    def fingerprint_hash(self) -> str:
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"


@dataclass
class ProblemShape:
    """Problem dimensions that affect optimal workgroup selection."""
    global_size: List[int]  # e.g., [width, height] or [width, height, depth]
    work_dimensions: int = 1
    # Extensible for 1D/2D/3D, image vs buffer, etc.
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "global_size": self.global_size,
            "work_dimensions": self.work_dimensions,
            "extra": self.extra,
        }

    def fingerprint_hash(self) -> str:
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"


@dataclass
class TuningKey:
    """Complete cache key for workgroup autotuning decisions.

    Composition:
      TuningKey = hash(device_fingerprint || kernel_fingerprint || problem_shape || backend)

    This ensures cache hits only occur when the full computational context matches.
    """
    backend: str  # opencl | cuda | hip | vulkan | metal | dx12 | cpu
    device_fingerprint: DeviceFingerprint
    kernel_fingerprint: KernelFingerprint
    problem_shape: ProblemShape
    # Optional: user-defined tags for manual cache partitioning
    tags: Dict[str, str] = field(default_factory=dict)
    # Metadata (not part of cache key hash)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).replace(microsecond=0).isoformat())
    schema_version: str = "1.0.0"

    def cache_key(self) -> str:
        """Compute the cache lookup key (SHA-256 of all identifying fields)."""
        components = {
            "backend": self.backend,
            "device": self.device_fingerprint.to_hash_input(),
            "kernel": self.kernel_fingerprint.to_hash_input(),
            "problem": self.problem_shape.to_hash_input(),
            "tags": self.tags,
        }
        data = json.dumps(components, sort_keys=True).encode("utf-8")
        return hashlib.sha256(data).hexdigest()[:32]  # filesystem-safe, no prefix

    def full_hash(self) -> str:
        """Full SHA-256 for evidence records."""
        components = {
            "backend": self.backend,
            "device": self.device_fingerprint.to_hash_input(),
            "kernel": self.kernel_fingerprint.to_hash_input(),
            "problem": self.problem_shape.to_hash_input(),
            "tags": self.tags,
        }
        data = json.dumps(components, sort_keys=True).encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)

    @classmethod
    def from_json(cls, data: str) -> "TuningKey":
        d = json.loads(data)
        return cls(
            backend=d["backend"],
            device_fingerprint=DeviceFingerprint(**d["device_fingerprint"]),
            kernel_fingerprint=KernelFingerprint(**d["kernel_fingerprint"]),
            problem_shape=ProblemShape(**d["problem_shape"]),
            tags=d.get("tags", {}),
            created_at=d.get("created_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat()),
            schema_version=d.get("schema_version", "1.0.0"),
        )

    def save(self, path: Path) -> None:
        path.write_text(self.to_json())

    @classmethod
    def load(cls, path: Path) -> "TuningKey":
        return cls.from_json(path.read_text())


# JSON Schema for validation / interop
TUNING_KEY_JSON_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://axiom-x.mandala/tuning-key/v1",
    "title": "Axiom-X TuningKey v1",
    "type": "object",
    "required": ["backend", "device_fingerprint", "kernel_fingerprint", "problem_shape"],
    "properties": {
        "backend": {"type": "string", "enum": ["opencl", "cuda", "hip", "vulkan", "metal", "dx12", "cpu"]},
        "device_fingerprint": {
            "type": "object",
            "required": ["vendor", "name"],
            "properties": {
                "vendor": {"type": "string"},
                "name": {"type": "string"},
                "architecture": {"type": "string"},
                "compute_units": {"type": "integer"},
                "global_memory_bytes": {"type": "integer"},
                "driver_version": {"type": "string"},
                "max_work_group_size": {"type": "integer"},
                "max_work_item_sizes": {"type": "array", "items": {"type": "integer"}},
                "max_local_mem_size": {"type": "integer"},
                "extra": {"type": "object"},
            },
        },
        "kernel_fingerprint": {
            "type": "object",
            "required": ["name", "version", "source_hash", "build_options_hash", "precision"],
            "properties": {
                "name": {"type": "string"},
                "version": {"type": "string"},
                "source_hash": {"type": "string", "pattern": "^sha256:[a-f0-9]{64}$"},
                "build_options_hash": {"type": "string", "pattern": "^sha256:[a-f0-9]{64}$"},
                "precision": {"type": "string", "enum": ["fp32", "fp16", "bf16", "mixed", "fp64"]},
                "algorithm_variant": {"type": "string"},
                "local_mem_usage_bytes": {"type": "integer"},
                "required_work_group_size": {"type": "array", "items": {"type": "integer"}},
                "extra": {"type": "object"},
            },
        },
        "problem_shape": {
            "type": "object",
            "required": ["global_size", "work_dimensions"],
            "properties": {
                "global_size": {"type": "array", "items": {"type": "integer"}},
                "work_dimensions": {"type": "integer", "minimum": 1, "maximum": 3},
                "extra": {"type": "object"},
            },
        },
        "tags": {"type": "object", "additionalProperties": {"type": "string"}},
        "created_at": {"type": "string", "format": "date-time"},
        "schema_version": {"type": "string"},
    },
}