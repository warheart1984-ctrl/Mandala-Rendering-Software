"""Axiom-X Memory Hierarchy — memory configuration and optimization.

STATUS: **partial** — OpenCL backend; declared for CUDA/HIP/Vulkan/Metal.

Defines memory hierarchy configurations and integrates with autotuning cache.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class MemorySpace(Enum):
    """OpenCL memory spaces."""
    GLOBAL = "global"           # __global - device global memory
    LOCAL = "local"             # __local - workgroup shared memory
    CONSTANT = "constant"       # __constant - cached read-only
    PRIVATE = "private"         # __private - per-thread registers
    HOST_PINNED = "host_pinned" # CL_MEM_ALLOC_HOST_PTR | CL_MEM_USE_HOST_PTR
    HOST_CACHED = "host_cached" # SVM fine-grain / host-accessible
    PERSISTENT = "persistent"   # clSVMAlloc / persistent mapping


class AccessPattern(Enum):
    """Memory access pattern classification."""
    COALESCED = "coalesced"           # Adjacent threads access adjacent addresses
    STRIDED = "strided"               # Regular stride (e.g., column-major)
    RANDOM = "random"                 # Irregular/indirect access
    BROADCAST = "broadcast"           # All threads read same address
    REDUCTION = "reduction"           # Tree reduction pattern
    UNKNOWN = "unknown"


@dataclass
class BufferSpec:
    """Specification for a single buffer."""
    name: str
    size_bytes: int
    memory_space: MemorySpace = MemorySpace.GLOBAL
    access_pattern: AccessPattern = AccessPattern.UNKNOWN
    read_only: bool = False
    write_only: bool = False
    # For local memory: workgroup-local size
    local_size_bytes: int = 0
    # For pinned/persistent: host pointer info
    host_ptr: Optional[int] = None
    # Alignment requirement
    alignment: int = 128
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "size_bytes": self.size_bytes,
            "memory_space": self.memory_space.value,
            "access_pattern": self.access_pattern.value,
            "read_only": self.read_only,
            "write_only": self.write_only,
            "local_size_bytes": self.local_size_bytes,
            "alignment": self.alignment,
        }

    def fingerprint_hash(self) -> str:
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()[:16]}"


@dataclass
class MemoryConfig:
    """Complete memory hierarchy configuration for a kernel dispatch."""
    buffers: List[BufferSpec]
    # Global memory optimization
    enable_coalescing: bool = True
    prefer_constant_memory: bool = True
    # Local memory
    max_local_mem_per_wg: int = 0  # 0 = device limit
    # Host-device transfer
    use_pinned_host_memory: bool = False
    use_persistent_mapping: bool = False
    # SVM (Shared Virtual Memory)
    use_svm_fine_grain: bool = False
    use_svm_coarse_grain: bool = False
    # Async copy / DMA
    enable_async_copy: bool = False
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_hash_input(self) -> Dict[str, Any]:
        return {
            "buffers": [b.to_hash_input() for b in self.buffers],
            "enable_coalescing": self.enable_coalescing,
            "prefer_constant_memory": self.prefer_constant_memory,
            "max_local_mem_per_wg": self.max_local_mem_per_wg,
            "use_pinned_host_memory": self.use_pinned_host_memory,
            "use_persistent_mapping": self.use_persistent_mapping,
            "use_svm_fine_grain": self.use_svm_fine_grain,
            "use_svm_coarse_grain": self.use_svm_coarse_grain,
            "enable_async_copy": self.enable_async_copy,
        }

    def config_hash(self) -> str:
        data = json.dumps(self.to_hash_input(), sort_keys=True).encode("utf-8")
        return f"mc:{hashlib.sha256(data).hexdigest()[:24]}"

    def total_local_memory(self) -> int:
        """Total local memory per workgroup."""
        return sum(b.local_size_bytes for b in self.buffers if b.memory_space == MemorySpace.LOCAL)

    def total_global_memory(self) -> int:
        """Total global memory."""
        return sum(b.size_bytes for b in self.buffers if b.memory_space == MemorySpace.GLOBAL)


# Predefined memory configurations for common patterns
def create_global_only_config(buffers: List[Dict[str, Any]]) -> MemoryConfig:
    """All buffers in global memory (baseline)."""
    specs = [
        BufferSpec(
            name=b["name"],
            size_bytes=b["size_bytes"],
            memory_space=MemorySpace.GLOBAL,
            access_pattern=AccessPattern(b.get("access_pattern", "unknown")),
            read_only=b.get("read_only", False),
            write_only=b.get("write_only", False),
        )
        for b in buffers
    ]
    return MemoryConfig(buffers=specs)


def create_local_tiled_config(
    buffers: List[Dict[str, Any]],
    tile_size: List[int],
    element_size: int = 4,
) -> MemoryConfig:
    """Input buffers tiled into local memory for reuse."""
    specs = []
    for b in buffers:
        if b.get("read_only", False) and not b.get("write_only", False):
            # Tile read-only buffers into local memory
            local_bytes = 1
            for dim in tile_size:
                local_bytes *= dim
            local_bytes *= element_size
            specs.append(BufferSpec(
                name=b["name"],
                size_bytes=b["size_bytes"],
                memory_space=MemorySpace.LOCAL,
                local_size_bytes=local_bytes,
                access_pattern=AccessPattern.COALESCED,
                read_only=True,
            ))
        else:
            specs.append(BufferSpec(
                name=b["name"],
                size_bytes=b["size_bytes"],
                memory_space=MemorySpace.GLOBAL,
                access_pattern=AccessPattern(b.get("access_pattern", "unknown")),
                read_only=b.get("read_only", False),
                write_only=b.get("write_only", False),
            ))
    return MemoryConfig(buffers=specs, max_local_mem_per_wg=sum(s.local_size_bytes for s in specs))


def create_pinned_host_config(buffers: List[Dict[str, Any]]) -> MemoryConfig:
    """Buffers allocated as pinned host memory for faster transfers."""
    specs = [
        BufferSpec(
            name=b["name"],
            size_bytes=b["size_bytes"],
            memory_space=MemorySpace.HOST_PINNED,
            access_pattern=AccessPattern(b.get("access_pattern", "unknown")),
            read_only=b.get("read_only", False),
            write_only=b.get("write_only", False),
        )
        for b in buffers
    ]
    return MemoryConfig(buffers=specs, use_pinned_host_memory=True)


def create_persistent_mapping_config(buffers: List[Dict[str, Any]]) -> MemoryConfig:
    """Buffers with persistent host-device mapping (zero-copy)."""
    specs = [
        BufferSpec(
            name=b["name"],
            size_bytes=b["size_bytes"],
            memory_space=MemorySpace.PERSISTENT,
            access_pattern=AccessPattern(b.get("access_pattern", "unknown")),
            read_only=b.get("read_only", False),
            write_only=b.get("write_only", False),
        )
        for b in buffers
    ]
    return MemoryConfig(buffers=specs, use_persistent_mapping=True)


# JSON Schema for validation
MEMORY_CONFIG_JSON_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://axiom-x.mandala/memory-config/v1",
    "title": "Axiom-X MemoryConfig v1",
    "type": "object",
    "required": ["buffers"],
    "properties": {
        "buffers": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "size_bytes", "memory_space"],
                "properties": {
                    "name": {"type": "string"},
                    "size_bytes": {"type": "integer"},
                    "memory_space": {"type": "string", "enum": [m.value for m in MemorySpace]},
                    "access_pattern": {"type": "string", "enum": [a.value for a in AccessPattern]},
                    "read_only": {"type": "boolean"},
                    "write_only": {"type": "boolean"},
                    "local_size_bytes": {"type": "integer"},
                    "alignment": {"type": "integer"},
                },
            },
        },
        "enable_coalescing": {"type": "boolean"},
        "prefer_constant_memory": {"type": "boolean"},
        "max_local_mem_per_wg": {"type": "integer"},
        "use_pinned_host_memory": {"type": "boolean"},
        "use_persistent_mapping": {"type": "boolean"},
        "use_svm_fine_grain": {"type": "boolean"},
        "use_svm_coarse_grain": {"type": "boolean"},
        "enable_async_copy": {"type": "boolean"},
    },
}