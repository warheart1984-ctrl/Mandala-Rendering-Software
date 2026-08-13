"""Axiom-X Kernel Dependency Analyzer — builds dependency graph from kernel sequence.

STATUS: **partial** — OpenCL C analyzer; declared for SPIR-V/LLVM IR.

Analyzes a sequence of kernels to find fusion opportunities.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from .kernel_fusion import (
    KernelSpec,
    KernelArg,
    KernelDependency,
    DependencyType,
    FusionCandidate,
    FusionStrategy,
    FusionConstraints,
)
from .memory_analyzer import analyze_kernel_memory_access, BufferAccessSummary


@dataclass
class KernelSequence:
    """A sequence of kernels to analyze for fusion."""
    kernels: List[KernelSpec]
    # Shared buffers across kernels (name -> size_bytes, initial_content)
    shared_buffers: Dict[str, Dict[str, Any]] = field(default_factory=dict)


class DependencyGraph:
    """Dependency graph for a kernel sequence."""

    def __init__(self, sequence: KernelSequence):
        self.sequence = sequence
        self.kernels_by_name = {k.name: k for k in sequence.kernels}
        self.dependencies: List[KernelDependency] = []
        self.buffer_writers: Dict[str, List[str]] = defaultdict(list)  # buffer -> kernel names
        self.buffer_readers: Dict[str, List[str]] = defaultdict(list)
        self._build_graph()

    def _build_graph(self) -> None:
        """Build dependency graph by analyzing buffer access."""
        # Track last writer for each buffer
        last_writer: Dict[str, str] = {}

        for kernel in self.sequence.kernels:
            # Analyze this kernel's memory access
            summaries = analyze_kernel_memory_access(kernel.source)

            for buf_name, summary in summaries.items():
                # Determine if kernel reads/writes this buffer
                writes = any(a.access_type.value in ("write", "read_write") for a in summary.accesses)
                reads = any(a.access_type.value in ("read", "read_write") for a in summary.accesses)

                if writes:
                    # RAW dependency: this kernel writes after last writer
                    if buf_name in last_writer:
                        self.dependencies.append(KernelDependency(
                            producer=last_writer[buf_name],
                            consumer=kernel.name,
                            buffer_name=buf_name,
                            dependency_type=DependencyType.RAW,
                            access_pattern=summary.inferred_pattern,
                            size_bytes=summary.accesses[0].buffer_name and 0,  # Would need actual size
                            producer_access="write",
                            consumer_access="read" if reads else "none",
                        ))
                    # WAW dependency: multiple writers
                    for prev_writer in self.buffer_writers[buf_name]:
                        if prev_writer != kernel.name:
                            self.dependencies.append(KernelDependency(
                                producer=prev_writer,
                                consumer=kernel.name,
                                buffer_name=buf_name,
                                dependency_type=DependencyType.WAW,
                                access_pattern=summary.inferred_pattern,
                            ))
                    last_writer[buf_name] = kernel.name
                    self.buffer_writers[buf_name].append(kernel.name)

                if reads:
                    # WAR dependency: this kernel reads before future writer
                    for future_writer in self.buffer_writers[buf_name]:
                        if future_writer != kernel.name:
                            self.dependencies.append(KernelDependency(
                                producer=kernel.name,
                                consumer=future_writer,
                                buffer_name=buf_name,
                                dependency_type=DependencyType.WAR,
                                access_pattern=summary.inferred_pattern,
                            ))
                    self.buffer_readers[buf_name].append(kernel.name)

    def get_raw_dependencies(self) -> List[KernelDependency]:
        """Get all RAW (true) dependencies."""
        return [d for d in self.dependencies if d.dependency_type == DependencyType.RAW]

    def get_producer_consumer_pairs(self) -> List[Tuple[str, str, KernelDependency]]:
        """Get all producer-consumer pairs with their dependency."""
        pairs = []
        for dep in self.get_raw_dependencies():
            pairs.append((dep.producer, dep.consumer, dep))
        return pairs

    def get_independent_kernels(self) -> List[str]:
        """Get kernels with no dependencies (can run in parallel)."""
        all_kernels = set(self.kernels_by_name.keys())
        dependent = set()
        for dep in self.dependencies:
            dependent.add(dep.producer)
            dependent.add(dep.consumer)
        return list(all_kernels - dependent)


class FusionOpportunityAnalyzer:
    """Analyzes a kernel sequence for fusion opportunities."""

    def __init__(self, sequence: KernelSequence, device=None):
        self.sequence = sequence
        self.device = device
        self.graph = DependencyGraph(sequence)
        self.candidates: List[FusionCandidate] = []

    def analyze(self) -> List[FusionCandidate]:
        """Find all valid fusion candidates."""
        self.candidates = []

        # 1. Horizontal fusion: adjacent kernels with same work size
        self._find_horizontal_fusion()

        # 2. Vertical fusion: producer-consumer chains
        self._find_vertical_fusion()

        # 3. Multi-kernel fusion: longer chains
        self._find_chain_fusion()

        # Filter by constraints if device provided
        if self.device:
            self.candidates = [c for c in self.candidates if self._check_constraints(c)]

        return self.candidates

    def _find_horizontal_fusion(self) -> None:
        """Find horizontally fusable adjacent kernels."""
        kernels = self.sequence.kernels
        for i in range(len(kernels) - 1):
            k1, k2 = kernels[i], kernels[i + 1]

            can_fuse, reason = FusionConstraints.can_fuse_horizontal(k1, k2)
            if not can_fuse:
                continue

            # Check if they have no conflicting dependencies
            deps_between = [
                d for d in self.graph.dependencies
                if (d.producer == k1.name and d.consumer == k2.name) or
                   (d.producer == k2.name and d.consumer == k1.name)
            ]
            # Only fuse if no RAW/WAR/WAW between them (independent)
            conflicting = [d for d in deps_between if d.dependency_type in (DependencyType.RAW, DependencyType.WAR, DependencyType.WAW)]
            if conflicting:
                continue

            # Create horizontal fusion candidate
            fused_name = f"{k1.name}_fused_{k2.name}"
            candidate = FusionCandidate(
                kernels=[k1, k2],
                dependencies=deps_between,
                strategy=FusionStrategy.HORIZONTAL,
                fused_name=fused_name,
                fused_global_size=k1.global_size,
                fused_local_size=k1.local_size or k2.local_size or [64],
                estimated_local_mem=k1.local_mem_bytes + k2.local_mem_bytes,
                estimated_private_mem=max(k1.private_mem_bytes, k2.private_mem_bytes),
                reduces_launches=1,
                confidence=0.9,
                notes=f"Horizontal fusion: {reason}",
            )
            self.candidates.append(candidate)

    def _find_vertical_fusion(self) -> None:
        """Find vertically fusable producer-consumer pairs."""
        for producer_name, consumer_name, dep in self.graph.get_producer_consumer_pairs():
            producer = self.kernels_by_name[producer_name]
            consumer = self.kernels_by_name[consumer_name]

            can_fuse, reason = FusionConstraints.can_fuse_vertical(producer, consumer, dep)
            if not can_fuse:
                continue

            # Create vertical fusion candidate
            fused_name = f"{producer_name}_to_{consumer_name}"
            candidate = FusionCandidate(
                kernels=[producer, consumer],
                dependencies=[dep],
                strategy=FusionStrategy.VERTICAL,
                fused_name=fused_name,
                fused_global_size=producer.global_size,
                fused_local_size=producer.local_size or consumer.local_size or [64],
                estimated_local_mem=producer.local_mem_bytes + consumer.local_mem_bytes,
                estimated_private_mem=producer.private_mem_bytes + consumer.private_mem_bytes,
                eliminates_global_memory=[dep.buffer_name],  # Intermediate buffer eliminated
                reduces_launches=1,
                confidence=0.85,
                notes=f"Vertical fusion: {reason} (eliminates {dep.buffer_name})",
            )
            self.candidates.append(candidate)

    def _find_chain_fusion(self) -> None:
        """Find longer fusion chains (3+ kernels)."""
        # Build adjacency for vertical chains
        adj: Dict[str, List[Tuple[str, KernelDependency]]] = defaultdict(list)
        for dep in self.graph.get_raw_dependencies():
            adj[dep.producer].append((dep.consumer, dep))

        # Find chains of length >= 3
        def dfs_chain(current: str, path: List[str], deps: List[KernelDependency]):
            if len(path) >= 3:
                # Create chain fusion candidate
                chain_kernels = [self.kernels_by_name[n] for n in path]
                fused_name = "_".join(path) + "_chain"
                candidate = FusionCandidate(
                    kernels=chain_kernels,
                    dependencies=deps,
                    strategy=FusionStrategy.VERTICAL,
                    fused_name=fused_name,
                    fused_global_size=chain_kernels[0].global_size,
                    fused_local_size=chain_kernels[0].local_size or [64],
                    estimated_local_mem=sum(k.local_mem_bytes for k in chain_kernels),
                    estimated_private_mem=sum(k.private_mem_bytes for k in chain_kernels),
                    eliminates_global_memory=[d.buffer_name for d in deps],
                    reduces_launches=len(path) - 1,
                    confidence=0.7,
                    notes=f"Chain fusion of {len(path)} kernels",
                )
                self.candidates.append(candidate)

            for next_kernel, dep in adj.get(current, []):
                if next_kernel not in path:  # Avoid cycles
                    dfs_chain(next_kernel, path + [next_kernel], deps + [dep])

        for kernel in self.sequence.kernels:
            if kernel.name in adj:
                dfs_chain(kernel.name, [kernel.name], [])

    def _check_constraints(self, candidate: FusionCandidate) -> bool:
        """Check if candidate satisfies device constraints."""
        if not self.device:
            return True

        # Estimate fused kernel spec for checking
        from .kernel_fusion import FusedKernelSpec
        fused_spec = FusedKernelSpec(
            candidate=candidate,
            fused_source="",  # Not generated yet
            fused_args=[],
            arg_mapping={},
            global_size=candidate.fused_global_size,
            local_size=candidate.fused_local_size,
            local_mem_bytes=candidate.estimated_local_mem,
            private_mem_bytes=candidate.estimated_private_mem,
        )
        ok, errors = FusionConstraints.check_resource_limits(fused_spec, self.device)
        if not ok:
            candidate.confidence *= 0.5
            candidate.notes += f"; CONSTRAINT WARNING: {'; '.join(errors)}"
        return ok  # Still include but with lower confidence


def analyze_fusion_opportunities(
    kernels: List[KernelSpec],
    shared_buffers: Optional[Dict[str, Dict[str, Any]]] = None,
    device=None,
) -> List[FusionCandidate]:
    """Convenience function to analyze fusion opportunities."""
    sequence = KernelSequence(kernels=kernels, shared_buffers=shared_buffers or {})
    analyzer = FusionOpportunityAnalyzer(sequence, device)
    return analyzer.analyze()