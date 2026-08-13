#!/usr/bin/env python3
"""Axiom Memory ABI v0.1 — Python Interface

Sovereign memory abstraction, independent of compute backend.
Manages RAM, VRAM, and Storage with full telemetry.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union
from dataclasses import dataclass
import uuid


# ============================================================================
# VERSIONING
# ============================================================================

AXIOM_MEMORY_ABI_VERSION = "0.1.0"
AXIOM_MEMORY_ABI_NAME = "Axiom Memory ABI"


# ============================================================================
# MEMORY FLAGS
# ============================================================================

MemoryFlags = (
    "read-write"
    | "read-only"
    | "write-only"
    | "host-visible"
    | "host-coherent"
    | "device-local"
    | "atomic"
)


# ============================================================================
// BUFFER DESCRIPTOR
# ============================================================================

@dataclass
class AxiomMemoryAllocationSpec:
  sizeBytes: int
  flags: List[str]
  usage: Optional[str] = None
  name: Optional[str] = None
  numaPreferred: Optional[int] = None


# ============================================================================
// ALLOCATION
// ============================================================================

@dataclass
class AxiomMemoryAllocation:
  allocationId: str
  buffer: AxiomMemoryAllocationSpec
  deviceAddress: Optional[int] = None  # GPU virtual address (if applicable)
  hostPointer: Optional[int] = None    # Mapped host pointer (if host-visible)
  offset: int = 0
  sizeBytes: int = 0
  backendHandle: Optional[Any] = None


# ============================================================================
// MAPPING
// ============================================================================

@dataclass
class AxiomMemoryMapping:
  mappedPtr: Any
  offset: int = 0
  size: int = 0
  flags: List[str] = None

  def __post_init__(self):
    if self.flags is None:
      self.flags = []