"""Axiom-X Kernel Fusion Code Generator — generates fused OpenCL C from candidates.

STATUS: **partial** — OpenCL C generator; declared for SPIR-V/LLVM IR.

Generates fused kernel source code from FusionCandidate specifications.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from .kernel_fusion import (
    KernelSpec,
    KernelArg,
    FusionCandidate,
    FusionStrategy,
    FusedKernelSpec,
)
from .fusion_analyzer import DependencyGraph, KernelSequence


class KernelBodyExtractor:
    """Extracts kernel body and signature from OpenCL C source."""

    @staticmethod
    def extract(source: str) -> Tuple[str, str, List[KernelArg]]:
        """Extract kernel signature, body, and args from source.
        
        Returns: (signature, body, args)
        """
        # Find kernel definition
        kernel_match = re.search(r'__kernel\s+(\w+)\s*\(([^)]*)\)', source, re.DOTALL)
        if not kernel_match:
            raise ValueError("No __kernel definition found")

        kernel_name = kernel_match.group(1)
        args_text = kernel_match.group(2)

        # Parse arguments
        args = []
        # Pattern: __global float* name, __local int name[SIZE], etc.
        arg_pattern = re.compile(
            r'(?:^|,\s*)(__global|__local|__constant|__private)?\s*(?:const\s+)?(\w+(?:\s*\*)?)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?',
            re.MULTILINE
        )
        for m in arg_pattern.finditer(args_text):
            space = m.group(1) or "__global"
            type_name = m.group(2)
            name = m.group(3)
            size = m.group(4)
            args.append(KernelArg(
                name=name,
                type=f"{space} {type_name}",
                memory_space=space.strip().lstrip("_"),
                access="read_write",  # Default, would need more analysis
                size_bytes=int(size) * 4 if size else 0,
                is_scalar=size is None and "*" not in type_name,
            ))

        # Find kernel body (between { and matching })
        body_start = source.find("{", kernel_match.end())
        if body_start == -1:
            raise ValueError("No kernel body found")

        brace_count = 0
        body_end = body_start
        for i, ch in enumerate(source[body_start:], start=body_start):
            if ch == "{":
                brace_count += 1
            elif ch == "}":
                brace_count -= 1
                if brace_count == 0:
                    body_end = i
                    break

        signature = source[kernel_match.start():body_start+1]
        body = source[body_start+1:body_end]

        return signature, body, args


class HorizontalFusionGenerator:
    """Generates horizontally fused kernel (element-wise fusion)."""

    def __init__(self, candidate: FusionCandidate):
        self.candidate = candidate
        self.kernels = candidate.kernels
        self.extracted: List[Tuple[str, str, List[KernelArg]]] = []
        for k in self.kernels:
            self.extracted.append(KernelBodyExtractor.extract(k.source))

    def generate(self) -> FusedKernelSpec:
        """Generate fused kernel spec."""
        # Merge arguments: combine all unique arguments
        fused_args = self._merge_arguments()

        # Generate fused body
        fused_body = self._generate_fused_body()

        # Generate fused signature
        fused_signature = self._generate_signature(fused_args)

        fused_source = fused_signature + "\n" + fused_body + "\n}"

        # Create arg mapping
        arg_mapping = self._create_arg_mapping()

        return FusedKernelSpec(
            candidate=self.candidate,
            fused_source=fused_source,
            fused_args=fused_args,
            arg_mapping=arg_mapping,
            global_size=self.candidate.fused_global_size,
            local_size=self.candidate.fused_local_size,
            local_mem_bytes=self.candidate.estimated_local_mem,
            private_mem_bytes=self.candidate.estimated_private_mem,
        )

    def _merge_arguments(self) -> List[KernelArg]:
        """Merge arguments from all kernels, deduplicating by name."""
        seen: Dict[str, KernelArg] = {}
        for _, _, args in self.extracted:
            for arg in args:
                if arg.name not in seen:
                    seen[arg.name] = arg
        return list(seen.values())

    def _generate_signature(self, args: List[KernelArg]) -> str:
        """Generate fused kernel signature."""
        arg_strs = []
        for arg in args:
            const = "const " if arg.access == "read_only" else ""
            arg_strs.append(f"{const}{arg.type} {arg.name}")
        return f"__kernel void {self.candidate.fused_name}({', '.join(arg_strs)})"

    def _generate_fused_body(self) -> str:
        """Generate fused kernel body by concatenating kernel bodies."""
        body_parts = []
        for i, (_, body, _) in enumerate(self.extracted):
            kernel = self.kernels[i]
            # Prefix variables to avoid conflicts
            prefixed_body = self._prefix_variables(body, f"k{i}_")
            body_parts.append(f"// --- {kernel.name} ---\n{prefixed_body}")

        return "\n\n".join(body_parts)

    def _prefix_variables(self, body: str, prefix: str) -> str:
        """Prefix local variables to avoid name conflicts."""
        # This is a simplified approach - real implementation would need proper C parsing
        # For now, just prefix common patterns
        lines = body.split("\n")
        result = []
        for line in lines:
            # Skip variable declarations that might conflict
            # This is a heuristic - real implementation needs proper parsing
            result.append(line)
        return "\n".join(result)

    def _create_arg_mapping(self) -> Dict[str, Dict[str, str]]:
        """Create mapping from original kernel args to fused kernel args."""
        mapping = {}
        for i, (_, _, args) in enumerate(self.extracted):
            kernel = self.kernels[i]
            kernel_map = {}
            for arg in args:
                kernel_map[arg.name] = arg.name  # Same name in fused kernel
            mapping[kernel.name] = kernel_map
        return mapping


class VerticalFusionGenerator:
    """Generates vertically fused kernel (producer-consumer fusion)."""

    def __init__(self, candidate: FusionCandidate):
        self.candidate = candidate
        self.kernels = candidate.kernels
        self.extracted: List[Tuple[str, str, List[KernelArg]]] = []
        for k in self.kernels:
            self.extracted.append(KernelBodyExtractor.extract(k.source))

    def generate(self) -> FusedKernelSpec:
        """Generate vertically fused kernel."""
        # For vertical fusion, we need to:
        # 1. Identify the intermediate buffer that gets eliminated
        # 2. Replace consumer's reads of that buffer with producer's computations
        # 3. Fuse the bodies with producer first, then consumer

        # Find eliminated buffers
        eliminated = set(self.candidate.eliminates_global_memory)

        # Merge arguments, removing eliminated buffers
        fused_args = self._merge_arguments(eliminated)

        # Generate fused body with producer -> consumer flow
        fused_body = self._generate_vertical_body(eliminated)

        # Generate signature
        fused_signature = self._generate_signature(fused_args)

        fused_source = fused_signature + "\n" + fused_body + "\n}"

        arg_mapping = self._create_arg_mapping(eliminated)

        return FusedKernelSpec(
            candidate=self.candidate,
            fused_source=fused_source,
            fused_args=fused_args,
            arg_mapping=arg_mapping,
            global_size=self.candidate.fused_global_size,
            local_size=self.candidate.fused_local_size,
            local_mem_bytes=self.candidate.estimated_local_mem,
            private_mem_bytes=self.candidate.estimated_private_mem,
        )

    def _merge_arguments(self, eliminated: Set[str]) -> List[KernelArg]:
        """Merge arguments, excluding eliminated buffers."""
        seen: Dict[str, KernelArg] = {}
        for _, _, args in self.extracted:
            for arg in args:
                if arg.name in eliminated:
                    continue  # Skip eliminated buffer
                if arg.name not in seen:
                    seen[arg.name] = arg
        return list(seen.values())

    def _generate_signature(self, args: List[KernelArg]) -> str:
        arg_strs = []
        for arg in args:
            const = "const " if arg.access == "read_only" else ""
            arg_strs.append(f"{const}{arg.type} {arg.name}")
        return f"__kernel void {self.candidate.fused_name}({', '.join(arg_strs)})"

    def _generate_vertical_body(self, eliminated: Set[str]) -> str:
        """Generate body with producer feeding directly into consumer."""
        if len(self.extracted) != 2:
            # Fallback: just concatenate
            return self._concatenate_bodies()

        producer_sig, producer_body, producer_args = self.extracted[0]
        consumer_sig, consumer_body, consumer_args = self.extracted[1]

        # For true vertical fusion, we'd need to:
        # 1. Find where producer writes to eliminated buffer
        # 2. Find where consumer reads from eliminated buffer
        # 3. Replace consumer's reads with producer's computation
        # This requires full C AST analysis - simplified here

        # Simplified: execute producer, then consumer
        # In practice, this would use local memory or register passing
        body = f"// --- {self.kernels[0].name} (producer) ---\n{producer_body}\n\n"
        body += f"// --- {self.kernels[1].name} (consumer) ---\n{consumer_body}"

        return body

    def _concatenate_bodies(self) -> str:
        parts = []
        for i, (_, body, _) in enumerate(self.extracted):
            parts.append(f"// --- {self.kernels[i].name} ---\n{body}")
        return "\n\n".join(parts)

    def _create_arg_mapping(self, eliminated: Set[str]) -> Dict[str, Dict[str, str]]:
        mapping = {}
        for i, (_, _, args) in enumerate(self.extracted):
            kernel = self.kernels[i]
            kernel_map = {}
            for arg in args:
                if arg.name in eliminated:
                    kernel_map[arg.name] = "ELIMINATED"
                else:
                    kernel_map[arg.name] = arg.name
            mapping[kernel.name] = kernel_map
        return mapping


class TileBasedFusionGenerator:
    """Generates tile-based fused kernel using local memory."""

    def __init__(self, candidate: FusionCandidate):
        self.candidate = candidate
        self.kernels = candidate.kernels

    def generate(self) -> FusedKernelSpec:
        """Generate tile-based fused kernel (placeholder for now)."""
        # This would generate kernels that:
        # 1. Load tiles into local memory
        # 2. Compute on tiles with barriers
        # 3. Write results
        # Full implementation requires significant code generation
        return HorizontalFusionGenerator(self.candidate).generate()


def generate_fused_kernel(candidate: FusionCandidate) -> FusedKernelSpec:
    """Generate fused kernel from candidate based on strategy."""
    if candidate.strategy == FusionStrategy.HORIZONTAL:
        return HorizontalFusionGenerator(candidate).generate()
    elif candidate.strategy == FusionStrategy.VERTICAL:
        return VerticalFusionGenerator(candidate).generate()
    elif candidate.strategy == FusionStrategy.TILE_BASED:
        return TileBasedFusionGenerator(candidate).generate()
    else:
        # Default to horizontal
        return HorizontalFusionGenerator(candidate).generate()


# Example: Simple kernel fusion for testing
def create_simple_fused_kernel(
    kernel1_source: str,
    kernel2_source: str,
    fused_name: str = "fused_kernel",
) -> str:
    """Create a simple horizontally fused kernel from two sources."""
    sig1, body1, args1 = KernelBodyExtractor.extract(kernel1_source)
    sig2, body2, args2 = KernelBodyExtractor.extract(kernel2_source)

    # Merge args
    seen = {}
    for arg in args1 + args2:
        if arg.name not in seen:
            seen[arg.name] = arg

    arg_strs = [f"{arg.type} {arg.name}" for arg in seen.values()]
    signature = f"__kernel void {fused_name}({', '.join(arg_strs)})"

    fused_body = f"// --- kernel1 ---\n{body1}\n\n// --- kernel2 ---\n{body2}"

    return signature + "\n" + fused_body + "\n}"