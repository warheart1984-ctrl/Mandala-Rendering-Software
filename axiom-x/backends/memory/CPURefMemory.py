#!/usr/bin/env python3
"""Axiom-X CPU Reference Memory Backend — Pure NumPy Implementation

Implements Axiom Memory ABI v0.1 using pure NumPy.
No GPU dependencies. Deterministic, portable, auditable.
"""

from __future__ import annotations

import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union
from dataclasses import dataclass, field
import numpy as np

# Import ABI types from standalone Memory ABI module (local file)
import sys
import os

# Ensure the local axiomMemory types are available
_AXIOM_MEM_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "axiom-x", "memory", "axiomMemory.py"
)
if os.path.exists(_AXIOM_MEM_PATH):
    _AXIOM_MEM_SPEC = importlib.util.spec_from_file_location(
        "axiomMemoryLocal", _AXIOM_MEM_PATH
    )
    _AXIOM_MEM_MOD = importlib.util.module_from_spec(_AXIOM_MEM_SPEC)
    _AXIOM_MEM_SPEC.loader.exec_module(_AXIOM_MEM_MOD)

    # Pull the types we need from the local module
    AxiomMemory = _AXIOM_MEM_MOD.AxiomMemory
    AxiomMemoryAllocation = _AXIOM_MEM_MOD.AxiomMemoryAllocation
    AxiomMemoryAllocationSpec = _AXIOM_MEM_MOD.AxiomMemoryAllocationSpec
    AxiomMemoryMapping = _AXIOM_MEM_MOD.AxiomMemoryMapping
    MemoryTelemetry = _AXIOM_MEM_MOD.MemoryTelemetry
    AXIOM_MEMORY_ABI_VERSION = _AXIOM_MEM_MOD.AXIOM_MEMORY_ABI_VERSION
else:
    # Fallback: define minimal types inline
    # (these will be overridden by imports from test script if needed)
    AxiomMemory = None
    AxiomMemoryAllocation = None
    AxiomMemoryAllocationSpec = None
    AxiomMemoryMapping = None
    MemoryTelemetry = None
    AXIOM_MEMORY_ABI_VERSION = "0.1.0"


class CPURefMemoryError(Exception):
    """CPU Reference Memory specific error."""
    def __init__(self, code: str, message: str, details: Any = None):
        self.code = code
        self.details = details
        super().__init__(f"[{code}] {message}")


@dataclass
class CPUCacheLine:
    """Simulates a CPU cache line."""
    size: int = 64  # Typical cache line size in bytes
    data: np.ndarray = field(default_factory=lambda: np.zeros(64, dtype=np.uint8))
    valid: bool = True
    dirty: bool = False


class CPURefMemory:
    """
    CPU Reference Memory Backend.

    Implements Axiom Memory ABI using pure NumPy.
    Provides realistic telemetry for bandwidth, latency, working set, etc.
    """

    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self.deviceId = f"cpu-mem-{uuid.uuid4().hex[:8]}"
        self.backendType = "cpu-memory"
        self.abiVersion = AXIOM_ABI_VERSION
        self._initialized = False

        # Memory pool
        self._memoryPool: Dict[str, np.ndarray] = {}
        self._mappings: Dict[str, CPURefMapping] = {}
        self._telemetryHistory: List[MemoryTelemetry] = []

        # Simulated NUMA topology
        self._numaTopology = {
            "nodeId": 0,
            "nearestNodeIds": [0],
            "remoteBandwidthGBps": 50.0,
            "localBandwidthGBps": 100.0
        }

        # Cache simulation
        self._cacheLines: Dict[int, CPUCacheLine] = {}
        self._cacheSizeGB = 8  # Simulated 8GB cache
        self._cacheUtilization = 0.0

        # Bandwidth tracking
        self._lastCopyTime = time.time()
        self._totalBytesCopied = 0
        self._totalAllocateBytes = 0

        # Initialize default telemetry
        self._telemetry = MemoryTelemetry(
            allocationLatencyNs=1000,  # 1μs
            copyBandwidthGBps=5.0,   # 5 GB/s simulated
            copyLatencyNs=10000,     # 10μs
            memoryCapacityBytes=16 * 1024**3,  # 16GB system RAM
            workingSetBytes=0,
            localityScore=1.0,  # Start fully sequential
            numaNode=0,
            cacheLineUtilization=0.0,
            deviceUtilizationPercent=0.0,
            queueDepth=0
        )

    def _initialize(self):
        if self._initialized:
            return
        self._initialized = True
        self._log("info", "CPU Reference Memory initialized")

    def _log(self, level: str, message: str):
        levels = {"none": 0, "error": 1, "warn": 2, "info": 3, "debug": 4}
        if levels.get(level, 3) <= levels.get(self.config.get("logLevel", "info"), 3):
            print(f"[CPU-Mem:{self.deviceId}] {level.upper()}: {message}")

    # =========================================================================
    # LIFECYCLE
    # =========================================================================

    async def initialize(self) -> dict:
        """Initialize the memory backend."""
        await self._initialize()
        return {
            "success": True,
            "deviceId": self.deviceId,
            "abiVersion": self.abiVersion,
            "message": "CPU Reference Memory initialized"
        }

    async def shutdown(self):
        """Shutdown the memory backend."""
        self._memoryPool.clear()
        self._mappings.clear()
        self._telemetryHistory.clear()
        self._initialized = False
        self._log("info", "Shutdown complete")

    # =========================================================================
    # ALLOCATION
    # =========================================================================

    async def allocate(self, spec: AxiomMemoryAllocationSpec) -> AxiomMemoryAllocation:
        """Allocate memory."""
        if not self._initialized:
            raise CPURefMemoryError("NOT_INITIALIZED", "Backend not initialized")

        if spec.sizeBytes <= 0:
            raise CPURefMemoryError("INVALID_SIZE", f"Size must be positive, got {spec.sizeBytes}")

        allocationId = f"mem-{uuid.uuid4().hex[:12]}"

        # Allocate NumPy array
        array = np.zeros(spec.sizeBytes, dtype=np.uint8)

        # Track NUMA node
        numaNode = spec.numaPreferred if spec.numaPreferred is not None else 0

        allocation = AxiomMemoryAllocation(
            allocationId=allocationId,
            buffer=spec,
            sizeBytes=spec.sizeBytes,
            numaNode=numaNode,
        )

        # Store the actual array separately
        self._memoryPool[allocationId] = array

        # Update telemetry
        self._totalAllocateBytes += spec.sizeBytes

        self._log("debug", f"Allocated {spec.sizeBytes} bytes ({allocationId})")
        return allocation

    async def free(self, allocation: AxiomMemoryAllocation):
        """Free memory."""
        allocId = allocation.allocationId
        if allocId in self._memoryPool:
            del self._memoryPool[allocId]

        # Clean up any mappings
        mappingsToRemove = [mid for mid, mp in self._mappings.items() if mp.allocationId == allocId]
        for mid in mappingsToRemove:
            del self._mappings[mid]

        self._log("debug", f"Freed allocation {allocId}")

    # =========================================================================
    # MAPPING
    # =========================================================================

    async def map(self, allocation: AxiomMemoryAllocation, flags: Optional[List[str]] = None) -> AxiomMemoryMapping:
        """Map memory for host access."""
        if not self._initialized:
            raise CPURefMemoryError("NOT_INITIALIZED", "Backend not initialized")

        allocId = allocation.allocationId
        if allocId not in self._memoryPool:
            raise CPURefMemoryError("ALLOCATION_NOT_FOUND", f"Allocation {allocId} not found")

        array = self._memoryPool[allocId]

        # Create mapping
        mappingId = f"map-{uuid.uuid4().hex[:8]}"

        # Simulate cache line tracking
        lineCount = (allocation.sizeBytes + 63) // 64
        for i in range(lineCount):
            self._cacheLines[f"{allocId}-{i}"] = CPUCacheLine()

        mapping = AxiomMemoryMapping(
            mappedPtr=array,
            offset=0,
            size=allocation.sizeBytes,
            flags=flags or ["read-write"]
        )

        self._mappings[mappingId] = {
            "allocationId": allocId,
            "mappedPtr": array,
        }

        # Update telemetry
        self._telemetry.workingSetBytes = max(self._telemetry.workingSetBytes, allocation.sizeBytes)

        return mapping

    async def unmap(self, allocation: AxiomMemoryAllocation, mapping: AxiomMemoryMapping):
        """Unmap memory."""
        allocId = allocation.allocationId
        if allocId not in self._memoryPool:
            raise CPURefMemoryError("ALLOCATION_NOT_FOUND", f"Allocation {allocId} not found")

        # Remove mapping
        mappingsToRemove = [mid for mid, mp in self._mappings.items() if mp["allocationId"] == allocId]
        for mid in mappingsToRemove:
            del self._mappings[mid]

        # Update cache utilization
        self._cacheUtilization = min(1.0, self._cacheUtilization + 0.01)

        self._log("debug", f"Unmapped allocation {allocId}")

    # =========================================================================
    # COPY
    # =========================================================================

    async def copy(self, src: AxiomMemoryAllocation, dst: AxiomMemoryAllocation, size: int, srcOffset: int = 0, dstOffset: int = 0):
        """Copy between allocations."""
        if not self._initialized:
            raise CPURefMemoryError("NOT_INITIALIZED", "Backend not initialized")

        srcId = src.allocationId
        dstId = dst.allocationId

        if srcId not in self._memoryPool or dstId not in self._memoryPool:
            raise CPURefMemoryError("ALLOCATION_NOT_FOUND", "Source or destination allocation not found")

        srcArray = self._memoryPool[srcId]
        dstArray = self._memoryPool[dstId]

        # Clip size to actual allocation sizes
        srcSize = min(size, len(srcArray) - srcOffset)
        dstSize = min(size, len(dstArray) - dstOffset)
        actualSize = min(srcSize, dstSize)

        # Perform copy
        if actualSize > 0:
            dstArray[dstOffset:dstOffset+actualSize] = srcArray[srcOffset:srcOffset+actualSize]

        # Track telemetry
        bytesCopied = actualSize
        self._totalBytesCopied += bytesCopied
        now = time.time()
        elapsed = now - self._lastCopyTime
        if elapsed > 0:
            # Update bandwidth estimate
            self._copyBandwidthGBps = (bytesCopied / elapsed) / (1024**3)
        self._lastCopyTime = now

        # Update cache utilization
        self._cacheUtilization = min(1.0, self._cacheUtilization + 0.01)

        self._log("debug", f"Copied {bytesCopied} bytes from {src.allocationId} to {dst.allocationId}")

    async def fill(self, allocation: AxiomMemoryAllocation, pattern: Union[np.ndarray, bytes], offset: int = 0, size: Optional[int] = None):
        """Fill memory with pattern."""
        if not self._initialized:
            raise CPURefMemoryError("NOT_INITIALIZED", "Backend not initialized")

        allocId = allocation.allocationId
        if allocId not in self._memoryPool:
            raise CPURefMemoryError("ALLOCATION_NOT_FOUND", f"Allocation {allocId} not found")

        array = self._memoryPool[allocId]

        fillSize = size or (len(array) - offset)
        if isinstance(pattern, bytes):
            pattern = np.frombuffer(pattern, dtype=np.uint8)

        if len(pattern) == 1:
            # Constant fill
            array[offset:offset+fillSize] = pattern[0]
        else:
            # Pattern fill
            patternArr = np.array(pattern, dtype=np.uint8)
            arrLen = min(len(patternArr), fillSize)
            array[offset:offset+arrLen] = patternArr[:arrLen]

        self._log("debug", f"Filled {fillSize} bytes at offset {offset}")

    # =========================================================================
    # SYNCHRONIZE / PROFILE
    # =========================================================================

    async def synchronize(self, future: Any, timeoutMs: Optional[int] = None) -> dict:
        """Synchronize operation."""
        return {"success": True}

    async def profile(self, future: Any) -> dict:
        """Get profiling info."""
        return {
            "durationNs": int(time.time() * 1e9),
        }

    # =========================================================================
    # TELEMETRY
    # =========================================================================

    async def queryTelemetry(self) -> MemoryTelemetry:
        """Get current telemetry."""
        # Update working set (simulated)
        self._telemetry.workingSetBytes = sum(arr.nbytes for arr in self._memoryPool.values())

        # Update cache line utilization
        totalLines = len(self._cacheLines)
        usedLines = sum(1 for l in self._cacheLines.values() if l.valid)
        self._telemetry.cacheLineUtilization = usedLines / totalLines if totalLines > 0 else 0.0

        # Update device utilization
        self._telemetry.deviceUtilizationPercent = min(100.0, len(self._memoryPool) * 10)

        # Update queue depth (simulated)
        self._telemetry.queueDepth = len(self._memoryPool)

        # Update locality score based on allocation patterns
        # Simple heuristic: larger allocations get lower locality
        totalBytes = sum(arr.nbytes for arr in self._memoryPool.values())
        if self._totalAllocateBytes > 0:
            self._telemetry.localityScore = max(0.0, 1.0 - np.log10(self._totalAllocateBytes / 1024) / 10.0)
        else:
            self._telemetry.localityScore = 1.0

        # Update telemetry history
        self._telemetryHistory.append(dict(self._telemetry))
        # Keep only last 100 entries
        if len(self._telemetryHistory) > 100:
            self._telemetryHistory = self._telemetryHistory[-100:]

        return dict(self._telemetry)

    async def setCachePolicy(self, allocation: AxiomMemoryAllocation, policy: CachePolicy):
        """Set cache policy for allocation."""
        self._log("debug", f"Set cache policy {policy.policy} for allocation {allocation.allocationId}")


class CPURefMapping:
    """Wrapper for CPU memory mapping."""
    def __init__(self, allocationId: str, array: np.ndarray):
        self.allocationId = allocationId
        self.mappedPtr = array
        self.offset = 0
        self.size = 0
        self.flags = []


# Backend factory
cpuRefMemoryFactory = CPURefMemory()


# ============================================================================
# STANDALONE TEST
# =============================================================================

async def main():
    """Test the CPU Reference Memory backend."""
    print("=== Axiom-X CPU Reference Memory Test ===")

    factory = cpuRefMemoryFactory

    # Initialize
    result = await factory.initialize()
    print(f"Initialize: {result['success']}")

    # Allocate
    from axiom.x.memory.axiomMemory import AxiomMemoryAllocationSpec
    desc = AxiomMemoryAllocationSpec(sizeBytes=1024, flags=["read-write"])
    alloc = await factory.allocate(desc)
    print(f"Allocated: {alloc.allocationId} ({alloc.sizeBytes} bytes)")

    # Map
    mapping = await factory.map(alloc)
    print(f"Mapped: size={mapping.size} bytes")

    # Write data
    import numpy as np
    mapping.mappedPtr[:10] = [0xde, 0xad, 0xbe, 0xef] + [0]*90

    # Unmap
    await factory.unmap(alloc, mapping)
    print("Unmapped")

    # Copy
    desc2 = AxiomMemoryAllocationSpec(sizeBytes=1024, flags=["read-write"])
    alloc2 = await factory.allocate(desc2)
    await factory.copy(alloc, alloc2, 1024)
    print("Copied 1024 bytes")

    # Query telemetry
    telemetry = await factory.queryTelemetry()
    print(f"Telemetry: bandwidth={telemetry.copyBandwidthGBps:.2f} GB/s, "
          f"latency={telemetry.allocationLatencyNs}ns, "
          f"locality={telemetry.localityScore:.2f}")

    # Free
    await factory.free(alloc)
    await factory.free(alloc2)

    # Shutdown
    await factory.shutdown()
    print("Done")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())