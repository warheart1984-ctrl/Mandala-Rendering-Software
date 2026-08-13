"""Axiom-X Memory Access Pattern Analyzer — static analysis of kernel memory access.

STATUS: **partial** — OpenCL C parser (regex-based); declared for SPIR-V/LLVM IR.

Analyzes kernel source to classify buffer access patterns for memory hierarchy optimization.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple


class AccessType(Enum):
    READ = "read"
    WRITE = "write"
    READ_WRITE = "read_write"


@dataclass
class BufferAccess:
    """Single buffer access site in kernel."""
    buffer_name: str
    access_type: AccessType
    index_expr: str  # e.g., "get_global_id(0)", "lid * 4 + i"
    line_number: int
    context: str  # surrounding code snippet


@dataclass
class BufferAccessSummary:
    """Aggregated access pattern for a buffer."""
    buffer_name: str
    accesses: List[BufferAccess]
    inferred_pattern: str = "unknown"
    is_coalesced: bool = False
    is_strided: bool = False
    stride: Optional[int] = None
    is_broadcast: bool = False
    is_reduction: bool = False
    workgroup_local: bool = False
    constant_candidate: bool = False


class AccessPatternAnalyzer:
    """Static analyzer for OpenCL kernel memory access patterns."""

    # Regex patterns for common access patterns
    PATTERNS = {
        "global_id": re.compile(r"get_global_id\s*\(\s*(\d+)\s*\)"),
        "local_id": re.compile(r"get_local_id\s*\(\s*(\d+)\s*\)"),
        "group_id": re.compile(r"get_group_id\s*\(\s*(\d+)\s*\)"),
        "global_size": re.compile(r"get_global_size\s*\(\s*(\d+)\s*\)"),
        "local_size": re.compile(r"get_local_size\s*\(\s*(\d+)\s*\)"),
        "array_index": re.compile(r"(\w+)\s*\[\s*([^\]]+)\s*\]"),
        "pointer_arith": re.compile(r"(\w+)\s*[\+\-]\s*(\d+)"),
        "barrier": re.compile(r"barrier\s*\(\s*CLK_LOCAL_MEM_FENCE\s*\)"),
        "local_decl": re.compile(r"__local\s+\w+\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?"),
        "constant_decl": re.compile(r"__constant\s+\w+\s+(\w+)"),
    }

    def __init__(self, kernel_source: str):
        self.kernel_source = kernel_source
        self.lines = kernel_source.split("\n")
        self.buffer_decls: Dict[str, Dict[str, Any]] = {}
        self.accesses: List[BufferAccess] = []

    def analyze(self) -> Dict[str, BufferAccessSummary]:
        """Run full analysis and return per-buffer summaries."""
        self._find_buffer_declarations()
        self._find_buffer_accesses()
        return self._summarize_accesses()

    def _find_buffer_declarations(self) -> None:
        """Find __global, __local, __constant, __private buffer declarations."""
        # Kernel arguments - find the argument list
        kernel_match = re.search(r'__kernel\s+\w+', self.kernel_source)
        if kernel_match:
            start = kernel_match.end()
            paren_start = self.kernel_source.find('(', start)
            if paren_start != -1:
                # Find matching closing paren
                count = 0
                paren_end = -1
                for i, ch in enumerate(self.kernel_source[paren_start:], start=paren_start):
                    if ch == '(':
                        count += 1
                    elif ch == ')':
                        count -= 1
                        if count == 0:
                            paren_end = i
                            break
                if paren_end != -1:
                    args_text = self.kernel_source[paren_start+1:paren_end]
                    # Parse arguments: __global type *name, __local type name[SIZE], etc.
                    # Memory space qualifier must be at start or after comma
                    arg_pattern2 = re.compile(
                        r'(?:^|,\s*)(__global|__local|__constant|__private)\s+(?:const\s+)?(\w+(?:\s*\*)?)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?',
                        re.MULTILINE
                    )
                    for m in arg_pattern2.finditer(args_text):
                        space = m.group(1)
                        type_name = m.group(2)
                        name = m.group(3)
                        size = m.group(4)
                        self.buffer_decls[name] = {
                            "space": space.strip(),
                            "type": type_name.strip(),
                            "size": int(size) if size else None,
                            "is_pointer": "*" in type_name,
                        }

        # Local memory declarations inside kernel
        for m in self.PATTERNS["local_decl"].finditer(self.kernel_source):
            name = m.group(1)
            size = m.group(2)
            self.buffer_decls[name] = {
                "space": "__local",
                "type": "unknown",
                "size": int(size) if size else None,
                "is_pointer": False,
            }

        # Constant memory declarations
        for m in self.PATTERNS["constant_decl"].finditer(self.kernel_source):
            name = m.group(1)
            self.buffer_decls[name] = {
                "space": "__constant",
                "type": "unknown",
                "size": None,
                "is_pointer": False,
            }

    def _find_buffer_accesses(self) -> None:
        """Find all buffer accesses in the kernel body."""
        # Find kernel body (between { and matching })
        body_start = self.kernel_source.find("{")
        if body_start == -1:
            return
        brace_count = 0
        body_end = body_start
        for i, ch in enumerate(self.kernel_source[body_start:], start=body_start):
            if ch == "{":
                brace_count += 1
            elif ch == "}":
                brace_count -= 1
                if brace_count == 0:
                    body_end = i
                    break

        body = self.kernel_source[body_start:body_end+1]
        body_lines = body.split("\n")

        # Track variable definitions for get_global_id, get_local_id, etc.
        var_defs: Dict[str, str] = {}  # var_name -> expression

        for line_idx, line in enumerate(body_lines):
            # Track variable assignments: int gid = get_global_id(0);
            var_match = re.search(r"(\w+)\s*=\s*(get_(global|local|group)_id\s*\(\s*\d+\s*\))", line)
            if var_match:
                var_defs[var_match.group(1)] = var_match.group(2)

            # Find array accesses: buffer_name[expr]
            for match in self.PATTERNS["array_index"].finditer(line):
                buffer_name = match.group(1)
                index_expr = match.group(2).strip()

                # Resolve variable references in index expression
                resolved_expr = index_expr
                for var, expr in var_defs.items():
                    # Replace whole word only
                    resolved_expr = re.sub(rf"\b{var}\b", f"({expr})", resolved_expr)

                # Determine access type
                access_type = AccessType.READ
                if re.search(rf"{re.escape(buffer_name)}\s*\[\s*{re.escape(index_expr)}\s*\]\s*=", line):
                    access_type = AccessType.WRITE
                elif re.search(rf"{re.escape(buffer_name)}\s*\[\s*{re.escape(index_expr)}\s*\]\s*[\+\-\*\/\|]", line):
                    access_type = AccessType.READ_WRITE

                # Get context (surrounding lines)
                start = max(0, line_idx - 2)
                end = min(len(body_lines), line_idx + 3)
                context = "\n".join(body_lines[start:end])

                # Only track known buffers
                if buffer_name in self.buffer_decls:
                    self.accesses.append(BufferAccess(
                        buffer_name=buffer_name,
                        access_type=access_type,
                        index_expr=resolved_expr,
                        line_number=body_start + line_idx,
                        context=context,
                    ))

    def _summarize_accesses(self) -> Dict[str, BufferAccessSummary]:
        """Aggregate accesses per buffer and classify patterns."""
        by_buffer: Dict[str, List[BufferAccess]] = {}
        for acc in self.accesses:
            by_buffer.setdefault(acc.buffer_name, []).append(acc)

        summaries = {}
        for buffer_name, accesses in by_buffer.items():
            summary = BufferAccessSummary(
                buffer_name=buffer_name,
                accesses=accesses,
            )

            # Classify pattern
            summary.inferred_pattern = self._classify_pattern(accesses)
            summary.is_coalesced = self._check_coalesced(accesses)
            summary.is_strided, summary.stride = self._check_strided(accesses)
            summary.is_broadcast = self._check_broadcast(accesses)
            summary.is_reduction = self._check_reduction(accesses)
            summary.workgroup_local = self._check_workgroup_local(buffer_name, accesses)
            summary.constant_candidate = self._check_constant_candidate(buffer_name, accesses)

            summaries[buffer_name] = summary

        return summaries

    def _classify_pattern(self, accesses: List[BufferAccess]) -> str:
        """Classify overall access pattern."""
        if not accesses:
            return "unknown"

        # Check for coalesced (adjacent threads access adjacent elements)
        if self._check_coalesced(accesses):
            return "coalesced"

        # Check for strided
        is_strided, _ = self._check_strided(accesses)
        if is_strided:
            return "strided"

        # Check for broadcast
        if self._check_broadcast(accesses):
            return "broadcast"

        # Check for reduction
        if self._check_reduction(accesses):
            return "reduction"

        return "random"

    def _check_coalesced(self, accesses: List[BufferAccess]) -> bool:
        """Check if access is coalesced: index = get_global_id(0) or linear with stride 1."""
        for acc in accesses:
            idx = acc.index_expr
            # Pattern: gid (direct get_global_id(0))
            if re.search(r"get_global_id\s*\(\s*0\s*\)", idx) and not re.search(r"[\*\/\%]", idx):
                return True
            if re.search(r"get_local_id\s*\(\s*0\s*\)", idx) and not re.search(r"[\*\/\%]", idx):
                return True
            # Linear with stride 1: get_global_id(0) + offset
            if re.search(r"get_global_id\s*\(\s*0\s*\)\s*\+\s*\d+", idx):
                return True
        return False

    def _check_strided(self, accesses: List[BufferAccess]) -> Tuple[bool, Optional[int]]:
        """Check for strided access with constant stride > 1."""
        strides = set()
        for acc in accesses:
            idx = acc.index_expr
            # Pattern: get_global_id(0) * STRIDE (stride > 1) - with optional parens
            match = re.search(r"\(?get_global_id\s*\(\s*0\s*\)\)?\s*\*\s*(\d+)", idx)
            if match:
                stride = int(match.group(1))
                if stride > 1:
                    strides.add(stride)
                continue
            # Pattern: get_global_id(1) * STRIDE (column-major)
            match = re.search(r"\(?get_global_id\s*\(\s*1\s*\)\)?\s*\*\s*(\d+)", idx)
            if match:
                stride = int(match.group(1))
                if stride > 1:
                    strides.add(stride)
                continue

        if len(strides) == 1:
            return True, strides.pop()
        return False, None

    def _check_broadcast(self, accesses: List[BufferAccess]) -> bool:
        """Check if all threads read the same address (broadcast)."""
        for acc in accesses:
            idx = acc.index_expr
            # Constant index or uniform expression (no get_global_id/get_local_id)
            if not re.search(r"get_(global|local|group)_id", idx):
                # Check if it's a simple constant or uniform variable
                if re.match(r"^\d+$", idx) or re.match(r"^\w+$", idx):
                    return True
        return False

    def _check_reduction(self, accesses: List[BufferAccess]) -> bool:
        """Check for reduction pattern (tree reduction in local memory)."""
        has_barrier = False
        has_local_atomic = False
        for acc in accesses:
            ctx = acc.context
            if "barrier" in ctx and "CLK_LOCAL_MEM_FENCE" in ctx:
                has_barrier = True
            if "atomic_" in ctx and "__local" in self.buffer_decls.get(acc.buffer_name, {}).get("space", ""):
                has_local_atomic = True
        return has_barrier and (has_local_atomic or any("+=" in a.context for a in accesses))

    def _check_workgroup_local(self, buffer_name: str, accesses: List[BufferAccess]) -> bool:
        """Check if buffer is workgroup-local (declared __local or used with local IDs)."""
        decl = self.buffer_decls.get(buffer_name, {})
        if decl.get("space") == "__local":
            return True
        for acc in accesses:
            if "get_local_id" in acc.index_expr:
                return True
        return False

    def _check_constant_candidate(self, buffer_name: str, accesses: List[BufferAccess]) -> bool:
        """Check if buffer is read-only and uniform (good for __constant memory)."""
        decl = self.buffer_decls.get(buffer_name, {})
        if decl.get("space") == "__constant":
            return True
        # All accesses are reads
        if all(a.access_type == AccessType.READ for a in accesses):
            # Check if access is uniform (broadcast or same for all threads)
            if self._check_broadcast(accesses):
                return True
        return False


def analyze_kernel_memory_access(kernel_source: str) -> Dict[str, BufferAccessSummary]:
    """Convenience function to analyze kernel memory access."""
    analyzer = AccessPatternAnalyzer(kernel_source)
    return analyzer.analyze()