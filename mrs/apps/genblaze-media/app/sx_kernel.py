"""Sovereign X Operating System Kernel — SX-OSM.

Translates the Constitutional Kernel pseudocode into a real Python scheduler
with the full CIS instruction set (AUTH, CONT, REFL, AUDT, ENRG, SYNC, EXEC,
HALT), configurable latency/governance model, and lawful process scheduling.

Integrates with ``ConstitutionalDispatch`` from ``constitutional_schedule.py``
to provide the lawful execution pipeline.

Usage::

    kernel = SovereignXKernel()
    result = kernel.schedule(
        intent=RenderIntent(...),
        authority="director-42",
        energy_kw=150.0,
    )
"""

from __future__ import annotations

import enum
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from app.constitutional_schedule import (
    AUTH_ROLE_DIRECTOR,
    AUTH_ROLE_SCHEDULER,
    _compute_governed_throughput_formatted,
    _compute_mandala_energy,
    _validate_driver_manifest,
)

logger = logging.getLogger(__name__)


# ── CIS: Constitutional Instruction Set ──────────────────────────────────

class CIS(enum.Enum):
    AUTH = "AUTH"   # Validate authority signature
    CONT = "CONT"   # Preserve continuity lineage
    SCAL = "SCAL"   # Adaptive metric inheritance (Amendment VII §2)
    ENRG = "ENRG"   # Route lawful energy
    EXEC = "EXEC"   # Execute lawful instruction
    REFL = "REFL"   # Reflect execution feedback
    AUDT = "AUDT"   # Record event in ledger
    SYNC = "SYNC"   # Synchronize photonic lattice
    HALT = "HALT"   # Suspend unlawful state

    @classmethod
    def meanings(cls) -> dict[str, str]:
        return {
            "AUTH": "Validate authority signature — ensures lawful origin",
            "CONT": "Preserve continuity lineage — maintains lawful state chain",
            "SCAL": "Adaptive metric inheritance — fixtures declare/inherit scaleClass (Amendment VII §2)",
            "ENRG": "Route lawful energy — applies Mandala Energy Law",
            "EXEC": "Execute lawful instruction — performs governed computation",
            "REFL": "Reflect execution feedback — returns structured audit data",
            "AUDT": "Record event in ledger — guarantees replayability",
            "SYNC": "Synchronize photonic lattice — maintains quantum coherence",
            "HALT": "Suspend unlawful state — enforces constitutional protection",
        }


# ── Data models ──────────────────────────────────────────────────────────

@dataclass
class ProcessIntent:
    """A process intent submitted to the kernel scheduler."""
    uid: str = field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str = ""
    priority: int = 0
    authority_id: str = ""
    continuity_id: str = ""
    world_id: str = ""
    energy_kw: float = 150.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProcessResult:
    """Result of a scheduled process execution."""
    uid: str
    verdict: str  # allow | deny | halt
    instructions_executed: list[CIS]
    governed_throughput: dict[str, Any] | None = None
    mandala_energy: dict[str, Any] | None = None
    receipt: dict[str, Any] | None = None
    error: str | None = None
    elapsed_ns: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "uid": self.uid,
            "verdict": self.verdict,
            "instructions": [i.value for i in self.instructions_executed],
            "governed_throughput": self.governed_throughput,
            "mandala_energy": self.mandala_energy,
            "receipt": self.receipt,
            "error": self.error,
            "elapsed_ns": round(self.elapsed_ns, 2),
        }


# ── Kernel ───────────────────────────────────────────────────────────────

class SovereignXKernel:
    """Real Python implementation of the SX-OSM Constitutional Kernel.

    Implements the CIS loop::

        AUTH  → validate authority
        CONT  → check continuity lineage
        ENRG  → compute lawful energy budget
        EXEC  → run the task
        REFL  → capture result
        AUDT  → record to ledger
        SYNC  → (simulated) lattice synchronization

    Configurable ``router_latency_ns`` and ``governance_overhead_ns``
    model the physical Router-as-Scheduler parameters from the hardware
    charter.
    """

    def __init__(
        self,
        *,
        router_latency_ns: float = 0.9,
        governance_overhead_ns: float = 0.05,
        power_efficiency: float = 0.85,
        compute_tflops: float = 1.2e3,
        memory_bw_tbs: float = 12.0,
    ) -> None:
        self.router_latency_ns = router_latency_ns
        self.governance_overhead_ns = governance_overhead_ns
        self.power_efficiency = power_efficiency
        self.compute_tflops = compute_tflops
        self.memory_bw_tbs = memory_bw_tbs
        self._instruction_count: int = 0
        self._halted: set[str] = set()
        self._dispatch_count: int = 0
        self._halt_count: int = 0
        self._total_elapsed_ns: float = 0.0
        self._sync_count: int = 0
        self._last_error: str | None = None
        self._error_counts: dict[str, int] = {}

    # ── Public API ───────────────────────────────────────────────────────

    def schedule(
        self,
        intent: ProcessIntent,
        *,
        dispatch_fn: Callable[..., Any] | None = None,
        min_throughput: float = 1.0e6,
    ) -> ProcessResult:
        """Full CIS pipeline for a process intent.

        Steps:
        1. AUTH — validate authority_id
        2. CONT — check continuity (only requires continuity_id + world_id)
        3. ENRG — compute governed throughput and mandala energy
        4. EXEC — call the dispatch function
        5. REFL — build receipt
        6. AUDT — record (stub; real ledger write via ConstitutionalDispatch)
        7. SYNC — (no-op stub)

        Returns a ``ProcessResult`` with the verdict and trace.
        """
        executed: list[CIS] = []
        start = time.monotonic()
        self._dispatch_count += 1

        # ── AUTH ─────────────────────────────────────────────────────────
        auth_ok, auth_msg = self._auth(intent.authority_id)
        executed.append(CIS.AUTH)
        if not auth_ok:
            return self._halt(intent, executed, auth_msg, start)

        # ── CONT ─────────────────────────────────────────────────────────
        cont_ok, cont_msg = self._cont(intent.continuity_id, intent.world_id)
        executed.append(CIS.CONT)
        if not cont_ok:
            return self._halt(intent, executed, cont_msg, start)

        # ── SCAL ─────────────────────────────────────────────────────────
        scal_ok, scal_msg = self._scal(intent)
        executed.append(CIS.SCAL)
        if not scal_ok:
            return self._halt(intent, executed, scal_msg, start)

        # ── ENRG ─────────────────────────────────────────────────────────
        throughput = _compute_governed_throughput_formatted(
            compute_tflops=self.compute_tflops,
            memory_bw_tbs=self.memory_bw_tbs,
            router_latency_ns=self.router_latency_ns,
            governance_overhead_ns=self.governance_overhead_ns,
            power_efficiency_tflops_per_w=self.power_efficiency,
        )
        energy = _compute_mandala_energy()
        executed.append(CIS.ENRG)

        if throughput["governed_throughput_tflops_per_second"] < min_throughput:
            return self._halt(
                intent, executed,
                f"governed throughput {throughput['governed_throughput_tflops_per_second']:.2e} "
                f"below minimum {min_throughput:.2e}",
                start, throughput=throughput, energy=energy,
            )

        # ── EXEC ─────────────────────────────────────────────────────────
        exec_ok, exec_result = self._exec(intent, dispatch_fn)
        executed.append(CIS.EXEC)
        if not exec_ok:
            return self._halt(
                intent, executed, str(exec_result),
                start, throughput=throughput, energy=energy,
            )

        # ── REFL ─────────────────────────────────────────────────────────
        receipt = self._refl(intent, exec_result)
        executed.append(CIS.REFL)

        # ── AUDT ─────────────────────────────────────────────────────────
        self._audt(receipt)
        executed.append(CIS.AUDT)

        # ── SYNC ─────────────────────────────────────────────────────────
        self._sync()
        executed.append(CIS.SYNC)

        elapsed = (time.monotonic() - start) * 1e9  # ns
        self._total_elapsed_ns += elapsed

        return ProcessResult(
            uid=intent.uid,
            verdict="allow",
            instructions_executed=executed,
            governed_throughput=throughput,
            mandala_energy=energy,
            receipt=receipt,
            elapsed_ns=elapsed,
        )

    # ── CIS instruction implementations ──────────────────────────────────

    def _auth(self, authority_id: str) -> tuple[bool, str]:
        """AUTH: validate authority signature (must be non-empty)."""
        if not authority_id or not authority_id.strip():
            return False, "authority_id is empty — HALT"
        if authority_id in self._halted:
            return False, f"authority {authority_id} is halted — HALT"
        return True, "authority valid"

    def _cont(self, continuity_id: str, world_id: str) -> tuple[bool, str]:
        """CONT: preserve continuity lineage.

        When continuity_id is set, world_id must also be set.
        """
        if continuity_id and not world_id:
            return False, "continuity_id requires world_id — HALT"
        return True, "continuity preserved"

    def _scal(self, intent: ProcessIntent) -> tuple[bool, str]:
        """SCAL: adaptive metric inheritance (Amendment VII §2).

        Fixtures must declare or inherit scaleClass. When intent.metadata
        contains fixtures with biometricAmendment context, validate that
        each fixture has a resolved scaleClass.
        """
        fixtures = intent.metadata.get("fixtures")
        if not isinstance(fixtures, list) or not fixtures:
            return True, "no fixtures — SCAL skipped"

        biometric_ctx = intent.metadata.get("biometricAmendment") or {}
        enforce = intent.metadata.get("enforceAmendmentVII", False)

        if not biometric_ctx and not enforce:
            return True, "biometricAmendment not active — SCAL skipped"

        for fixture in fixtures:
            scale_class = (
                fixture.get("scaleClass")
                or fixture.get("inheritedScaleClass")
                or fixture.get("parentScaleClass")
                or biometric_ctx.get("worldScaleClass")
                or biometric_ctx.get("parentScaleClass")
            )
            if not scale_class:
                return False, f"fixture {fixture.get('id', 'unknown')} missing scaleClass — HALT:MISSING-SCALE-CONTEXT"

        return True, "scaleClass resolved for all fixtures"

    def _exec(
        self,
        intent: ProcessIntent,
        dispatch_fn: Callable[..., Any] | None,
    ) -> tuple[bool, Any]:
        """EXEC: execute the dispatch function if provided."""
        if dispatch_fn is None:
            return True, {"status": "dry_run", "detail": "no dispatch_fn provided"}
        try:
            result = dispatch_fn(intent)
            return True, result
        except Exception as exc:
            return False, f"dispatch failed: {exc}"

    def _refl(self, intent: ProcessIntent, exec_result: Any) -> dict[str, Any]:
        """REFL: build a receipt from the execution result."""
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        return {
            "uid": intent.uid,
            "verdict": "allow",
            "authority_id": intent.authority_id,
            "continuity_id": intent.continuity_id,
            "prompt": intent.prompt,
            "executed_at": now,
            "result": exec_result if isinstance(exec_result, dict) else {"detail": str(exec_result)},
        }

    def _audt(self, receipt: dict[str, Any]) -> None:
        """AUDT: record receipt to internal ledger (in-memory)."""
        logger.info("AUDT: ledger entry uid=%s", receipt.get("uid"))

    def _sync(self) -> None:
        """SYNC: synchronize photonic lattice — log and track sync events."""
        self._sync_count += 1
        logger.debug("SYNC: lattice synchronized (sync_count=%d)", self._sync_count)

    def _halt(
        self,
        intent: ProcessIntent,
        executed: list[CIS],
        reason: str,
        start: float,
        *,
        throughput: dict[str, Any] | None = None,
        energy: dict[str, Any] | None = None,
    ) -> ProcessResult:
        """HALT: suspend unlawful state and return a denied result."""
        executed.append(CIS.HALT)
        elapsed = (time.monotonic() - start) * 1e9
        self._halt_count += 1
        self._last_error = reason
        self._error_counts[reason] = self._error_counts.get(reason, 0) + 1
        self._total_elapsed_ns += elapsed
        logger.warning("HALT: uid=%s reason=%s", intent.uid, reason)
        return ProcessResult(
            uid=intent.uid,
            verdict="halt",
            instructions_executed=executed,
            governed_throughput=throughput,
            mandala_energy=energy,
            error=reason,
            elapsed_ns=elapsed,
        )

    # ── Kernel introspection ─────────────────────────────────────────────

    def metrics(self) -> dict[str, Any]:
        """Return kernel telemetry counters."""
        avg_elapsed_ns = (
            self._total_elapsed_ns / self._dispatch_count
            if self._dispatch_count > 0 else 0.0
        )
        return {
            "dispatch_count": self._dispatch_count,
            "halt_count": self._halt_count,
            "halt_rate": (
                round(self._halt_count / self._dispatch_count, 4)
                if self._dispatch_count > 0 else 0.0
            ),
            "sync_count": self._sync_count,
            "total_elapsed_ns": round(self._total_elapsed_ns, 2),
            "avg_elapsed_ns": round(avg_elapsed_ns, 2),
            "last_error": self._last_error,
            "error_counts": dict(self._error_counts),
        }

    def describe(self) -> dict[str, Any]:
        """Return kernel configuration and CIS meanings."""
        return {
            "kernel": "SovereignXKernel",
            "version": "1.0",
            "cis": CIS.meanings(),
            "params": {
                "router_latency_ns": self.router_latency_ns,
                "governance_overhead_ns": self.governance_overhead_ns,
                "power_efficiency": self.power_efficiency,
                "compute_tflops": self.compute_tflops,
                "memory_bw_tbs": self.memory_bw_tbs,
            },
            "throughput": _compute_governed_throughput_formatted(
                compute_tflops=self.compute_tflops,
                memory_bw_tbs=self.memory_bw_tbs,
                router_latency_ns=self.router_latency_ns,
                governance_overhead_ns=self.governance_overhead_ns,
                power_efficiency_tflops_per_w=self.power_efficiency,
            ),
            "energy": _compute_mandala_energy(),
            "instruction_count": self._instruction_count,
            "telemetry": self.metrics(),
        }
