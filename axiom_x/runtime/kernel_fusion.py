"""Axiom-X Kernel Fusion — types and dependency analysis for kernel fusion.

STATUS: **partial** — OpenCL C backend; declared for SPIR-V/LLVM IR.

Defines kernel fusion candidates, dependency graphs, and fusion strategies.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


class FusionStrategy(Enum):
    """Kernel fusion strategy."""
    HORIZONTAL = "horizontal"      # Same work items, different computations (element-wise fusion)
    VERTICAL = "vertical"          # Producer-consumer chain (pipeline fusion)
    TILE_BASED = "tile_based"      # Tiled computation with local memory
    PERSISTENT_THREAD = "persistent_thread"  # Persistent threads processing multiple elements


class DependencyType(Enum):
    """Types of dependencies between kernels."""
    RAW = "raw"                    # Read-After-Write (true dependency)
    WAR = "war"                    # Write-After-Read (anti-dependency)
    WAW = "waw"                    # Write-After-Write (output dependency)
    CONTROL = "control"            # Control flow dependency


@dataclass
class KernelArg:
    """Kernel argument specification."""
    name: str
    type: str                      # e.g., "__global float*", "__local int", "float"
    memory_space: str              # global, local, constant, private, host_pinned
    access: str                    # read_only, write_only, read_write
    size_bytes: int = 0            # For arrays
    is_scalar: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "memory_space": self.memory_space,
            "access": self.access,
            "size_bytes": self.size_bytes,
            "is_scalar": self.is_scalar,
        }


@dataclass
class KernelSpec:
    """Complete kernel specification for fusion analysis."""
    name: str
    source: str
    args: List[KernelArg]
    work_dimensions: int = 1
    global_size: List[int] = field(default_factory=list)
    local_size: List[int] = field(default_factory=list)
    required_work_group_size: Optional[List[int]] = None
    local_mem_bytes: int = 0
    private_mem_bytes: int = 0
    uses_barrier: bool = False
    uses_atomics: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "source_hash": f"sha256:{hashlib.sha256(self.source.encode()).hexdigest()[:16]}",
            "args": [a.to_hash_input() for a in self.args],
            "work_dimensions": self.work_dimensions,
            "global_size": self.global_size,
            "local_size": self.local_size,
            "required_work_group_size": self.required_work_group_size,
            "local_mem_bytes": self.local_mem_bytes,
            "private_mem_bytes": self.private_mem_bytes,
            "uses_barrier": self.uses_barrier,
            "uses_atomics": self.uses_atomics,
        }

    def spec_hash(self) -> str:
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"ks:{hashlib.sha256(data).hexdigest()[:24]}"


@dataclass
class KernelDependency:
    """Dependency between two kernels."""
    producer: str                  # Kernel name that produces data
    consumer: str                  # Kernel name that consumes data
    buffer_name: str               # Shared buffer name
    dependency_type: DependencyType
    access_pattern: str = "unknown"  # coalesced, strided, broadcast, etc.
    size_bytes: int = 0
    producer_access: str = "write"  # How producer accesses buffer
    consumer_access: str = "read"   # How consumer accesses buffer

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "producer": self.producer,
            "consumer": self.consumer,
            "buffer_name": self.buffer_name,
            "dependency_type": self.dependency_type.value,
            "access_pattern": self.access_pattern,
            "size_bytes": self.size_bytes,
        }


@dataclass
class FusionCandidate:
    """A candidate kernel fusion group."""
    kernels: List[KernelSpec]           # Kernels to fuse (in execution order)
    dependencies: List[KernelDependency] # Internal dependencies
    strategy: FusionStrategy
    # Fusion properties
    fused_name: str
    fused_global_size: List[int]
    fused_local_size: List[int]
    estimated_local_mem: int
    estimated_private_mem: int
    # Analysis
    eliminates_global_memory: List[str] = field(default_factory=list)  # Buffers no longer needed in global
    reduces_launches: int = 0
    # Metadata
    confidence: float = 1.0            # 0-1, how safe is this fusion
    notes: str = ""

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "kernels": [k.spec_hash() for k in self.kernels],
            "dependencies": [d.to_hash_input() for d in self.dependencies],
            "strategy": self.strategy.value,
            "fused_name": self.fused_name,
            "fused_global_size": self.fused_global_size,
            "fused_local_size": self.fused_local_size,
            "estimated_local_mem": self.estimated_local_mem,
            "estimated_private_mem": self.estimated_private_mem,
            "eliminates_global_memory": self.eliminates_global_memory,
            "reduces_launches": self.reduces_launches,
        }

    def candidate_hash(self) -> str:
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"fc:{hashlib.sha256(data).hexdigest()[:24]}"


@dataclass
class FusedKernelSpec:
    """Specification for a fused kernel."""
    candidate: FusionCandidate
    fused_source: str
    fused_args: List[KernelArg]
    global_size: List[int]
    local_size: List[int]
    local_mem_bytes: int
    private_mem_bytes: int
    # Mapping from original kernel args to fused kernel args
    arg_mapping: Dict[str, Dict[str, str]] = field(default_factory=dict)  # {kernel_name: {old_arg: new_arg}}
    # Resource usage
    registers_estimate: int = 0
    # Metadata
    fusion_timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).replace(microsecond=0).isoformat())
    source_hash: str = ""

    def __post_init__(self):
        if not self.source_hash:
            self.source_hash = f"sha256:{hashlib.sha256(self.fused_source.encode()).hexdigest()}"


# Fusion rules and constraints
class FusionConstraints:
    """Hard constraints for valid kernel fusion."""

    @staticmethod
    def max_local_mem_per_wg(device) -> int:
        return device.local_mem_size

    @staticmethod
    def max_registers_per_thread(device) -> int:
        # Approximate; varies by architecture
        return 255  # Conservative for GCN/RDNA

    @staticmethod
    def max_workgroup_size(device) -> int:
        return device.max_work_group_size

    @staticmethod
    def can_fuse_horizontal(k1: KernelSpec, k2: KernelSpec) -> Tuple[bool, str]:
        """Check if two kernels can be horizontally fused."""
        # Same global size and work dimensions
        if k1.global_size != k2.global_size:
            return False, "global_size mismatch"
        if k1.work_dimensions != k2.work_dimensions:
            return False, "work_dimensions mismatch"
        # Compatible local sizes (or both None)
        if k1.local_size and k2.local_size and k1.local_size != k2.local_size:
            return False, "local_size mismatch"
        # No conflicting barriers
        if k1.uses_barrier and k2.uses_barrier:
            return False, "both use barriers"
        # Combined local memory within limits (checked later with device)
        return True, "ok"

    @staticmethod
    def can_fuse_vertical(producer: KernelSpec, consumer: KernelSpec, dep: KernelDependency) -> Tuple[bool, str]:
        """Check if producer-consumer can be vertically fused."""
        # Same global size (consumer reads what producer writes)
        if producer.global_size != consumer.global_size:
            return False, "global_size mismatch"
        # Consumer must read exactly what producer writes (element-wise)
        if dep.access_pattern not in ("coalesced", "broadcast"):
            return False, f"access_pattern {dep.access_pattern} not suitable for vertical fusion"
        # No barriers in either (or only in producer at end)
        if consumer.uses_barrier:
            return False, "consumer uses barrier"
        return True, "ok"

    @staticmethod
    def check_resource_limits(fused: FusedKernelSpec, device) -> Tuple[bool, List[str]]:
        """Check if fused kernel fits device limits."""
        errors = []
        if fused.local_mem_bytes > device.local_mem_size:
            errors.append(f"local_mem {fused.local_mem_bytes} > device limit {device.local_mem_size}")
        if fused.local_size and fused.local_mem_bytes > 0:
            # Per-workgroup local mem check
            pass
        max_wg = fused.local_size[0] if fused.local_size else 1
        for dim in fused.local_size[1:]:
            max_wg *= dim
        if max_wg > device.max_work_group_size:
            errors.append(f"workgroup_size {max_wg} > device limit {device.max_work_group_size}")
        return len(errors) == 0, errors


# JSON Schema for fusion candidate
FUSION_CANDIDATE_JSON_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://axiom-x.mandala/fusion-candidate/v1",
    "title": "Axiom-X FusionCandidate v1",
    "type": "object",
    "required": ["kernels", "dependencies", "strategy", "fused_name"],
    "properties": {
        "kernels": {"type": "array", "items": {"type": "object"}},
        "dependencies": {"type": "array", "items": {"type": "object"}},
        "strategy": {"type": "string", "enum": [s.value for s in FusionStrategy]},
        "fused_name": {"type": "string"},
        "fused_global_size": {"type": "array", "items": {"type": "integer"}},
        "fused_local_size": {"type": "array", "items": {"type": "integer"}},
        "estimated_local_mem": {"type": "integer"},
        "estimated_private_mem": {"type": "integer"},
        "eliminates_global_memory": {"type": "array", "items": {"type": "string"}},
        "reduces_launches": {"type": "integer"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
}