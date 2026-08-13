"""
Axiom-X OpenCL Backend Package
"""

from .OpenCLBackend import (
    OpenCLBackend,
    OpenCLBackendFactory,
    OpenCLBackendError,
    CapabilityFeature,
    SubgroupCapability,
    MemoryCapability,
    NumericCapability,
    CapabilityTarget,
    CapabilityReport,
    AxiomBufferDescriptor,
    AxiomAllocation,
    AxiomIRModule,
    AxiomExecutable,
    AxiomDispatchArgs,
    AxiomFuture,
    AxiomResult,
    AxiomProfile,
    AxiomDeviceConfig,
    AxiomInitResult,
    AXIOM_ABI_VERSION,
)

__all__ = [
    "OpenCLBackend",
    "OpenCLBackendFactory",
    "OpenCLBackendError",
    "CapabilityFeature",
    "SubgroupCapability",
    "MemoryCapability",
    "NumericCapability",
    "CapabilityTarget",
    "CapabilityReport",
    "AxiomBufferDescriptor",
    "AxiomAllocation",
    "AxiomIRModule",
    "AxiomExecutable",
    "AxiomDispatchArgs",
    "AxiomFuture",
    "AxiomResult",
    "AxiomProfile",
    "AxiomDeviceConfig",
    "AxiomInitResult",
    "AXIOM_ABI_VERSION",
]

# Backend factory instance for registry
opencl_factory = OpenCLBackendFactory()