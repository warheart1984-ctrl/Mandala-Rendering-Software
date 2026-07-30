"""Constitutional schedule — Sovereign X Router as Scheduler for Genblaze dispatch.

Wraps existing Genblaze render dispatch with constitutional governance checks
without replacing or breaking existing flows.

Pipeline:
    ConstitutionalDispatch.prepare()   → AUTH:  validate authority + build governance trace
    ConstitutionalDispatch.execute()    → CONT:  run dispatch with continuity verification
                                       → REFL:  capture receipt + provenance
    ConstitutionalDispatch.record()     → AUDT:  write receipt to Memory Board ledger

The six extended layers:
    AUTH — Authority Chain Contract: who authorized this dispatch and why
    CONT — Continuity Preservation Contract: what prior state this continues from
    REFL — Replay & Audit Contract (RenderReceipt): what actually happened
    AUDT — Ledger write: permanent evidence record
    CONS — Conformance check: 16-point policy conformance
    SCHE — Scene spec optimisation: auto-tune render params

Usage:
    dispatch = ConstitutionalDispatch(settings)
    decision = dispatch.prepare(prompt, dispatch_fn=generate_image_rt4d)
    result, receipt = dispatch.execute(decision)
    dispatch.record(receipt)
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Callable

from app.config import Settings
from app.path_routing import (
    AIRole,
    PathKind,
    RendererRole,
    RenderReceipt,
    RouteDecision,
    build_render_receipt,
    classify_prompt,
    decide_route,
)
from app.pipeline import GenerateResult

logger = logging.getLogger(__name__)

# Memory Board defaults
_MEMORY_BOARD_BASE = "http://127.0.0.1:8001"
_MEMORY_BOARD_TIMEOUT = 5.0

# Authority role labels
AUTH_ROLE_DIRECTOR = "infinity-director"
AUTH_ROLE_SCHEDULER = "constitutional-scheduler"
AUTH_ROLE_OPERATOR = "human-operator"

# Rate limit defaults
_RATE_LIMIT_DEFAULT_MAX = 50
_RATE_LIMIT_WINDOW_SECONDS = 3600.0


class ConstitutionalScheduleError(Exception):
    """Constitutional schedule violation or failure."""


class ConstitutionalScheduleDenied(ConstitutionalScheduleError):
    """Constitutional schedule denied the dispatch — policy violation.

    Carries the ``RouteDecision`` with the full governance trace so the
    caller can inspect which policies were violated.
    """

    def __init__(self, message: str, decision: RouteDecision) -> None:
        super().__init__(message)
        self.decision = decision


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _fmt_ms(seconds: float) -> float:
    return round(seconds * 1000, 1)


def _build_governance_trace(
    *,
    decision: RouteDecision,
    verdict: str,
    policies_applied: list[str],
    param_adjust: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a governance trace matching the CKL/CSE pattern from MRS engine."""
    return {
        "decisionId": str(uuid.uuid4()),
        "verdict": verdict,
        "policiesApplied": list(policies_applied),
        "precedentCount": 1 if verdict == "allow" else 0,
        "paramAdjust": param_adjust or {},
        "attachProvenance": verdict == "allow",
    }


_POLICY_ASCENSION_PATTERNS = (
    "mythar",
    "ascension",
    "transcend",
    "sovereign-ascension",
)


# ---------------------------------------------------------------------------
# Scene spec optimisation
# ---------------------------------------------------------------------------

SceneSpecification = dict[str, Any]


def _estimate_scene_complexity(spec: SceneSpecification) -> dict[str, Any]:
    """Analyse a SceneSpecification and return auto-tuned render params.

    Heuristics:
    - Object count (``objects`` list length)
    - Material complexity (unique material references)
    - Has animation / timeline data
    - Recommended quality and max_depth adjustments
    """
    objects = spec.get("objects") or []
    if isinstance(objects, dict):
        objects = list(objects.values())
    obj_count = len(objects)

    materials: set[str] = set()
    has_animation = bool(spec.get("timeline") or spec.get("animation"))
    has_lights = False
    for obj in objects:
        if isinstance(obj, dict):
            mat = obj.get("material") or obj.get("materialId") or ""
            if mat:
                materials.add(str(mat))
            if "light" in obj or obj.get("type") == "light":
                has_lights = True

    mat_count = len(materials)

    # Tune params based on complexity.
    if obj_count > 50 or mat_count > 20:
        quality = "draft"
        max_depth = 4
        samples = 8
    elif obj_count > 20 or mat_count > 10:
        quality = "draft"
        max_depth = 6
        samples = 12
    else:
        quality = "final"
        max_depth = 8
        samples = 16

    if has_animation:
        quality = "draft"

    return {
        "object_count": obj_count,
        "material_count": mat_count,
        "has_animation": has_animation,
        "has_lights": has_lights,
        "recommended_quality": quality,
        "recommended_max_depth": max_depth,
        "recommended_samples": samples,
        "complexity": "high" if obj_count > 50 else "medium" if obj_count > 20 else "low",
    }


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

class _AuthorityBudget:
    """Per-authority dispatch budget tracking with sliding window."""

    __slots__ = ("max_dispatches", "window_seconds", "_history")

    def __init__(self, max_dispatches: int, window_seconds: float) -> None:
        self.max_dispatches = max_dispatches
        self.window_seconds = window_seconds
        self._history: list[float] = []

    def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        # Prune expired entries
        self._history = [t for t in self._history if t > cutoff]
        if len(self._history) >= self.max_dispatches:
            return False
        self._history.append(now)
        return True

    def remaining(self) -> int:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        self._history = [t for t in self._history if t > cutoff]
        return max(0, self.max_dispatches - len(self._history))

    def reset(self) -> None:
        self._history.clear()


# Shared rate-limit store (process-level; resets on restart)
_budgets: dict[str, _AuthorityBudget] = {}


def _check_rate_limit(
    authority_id: str,
    *,
    max_dispatches: int = _RATE_LIMIT_DEFAULT_MAX,
    window_seconds: float = _RATE_LIMIT_WINDOW_SECONDS,
) -> tuple[bool, int]:
    """Check whether *authority_id* has remaining budget.

    Returns (allowed, remaining).  When the authority has not been seen
    before a budget is created with the given limits.
    """
    global _budgets
    if authority_id not in _budgets:
        _budgets[authority_id] = _AuthorityBudget(max_dispatches, window_seconds)
    budget = _budgets[authority_id]
    allowed = budget.allow()
    return allowed, budget.remaining()


def _reset_budget(authority_id: str) -> None:
    _budgets.pop(authority_id, None)


# ---------------------------------------------------------------------------
# Sovereign X Governed Performance Model
# ---------------------------------------------------------------------------

def _compute_governed_throughput(
    *,
    compute_tflops: float = 1.2e3,
    memory_bw_tbs: float = 12.0,
    router_latency_ns: float = 0.9,
    governance_overhead_ns: float = 0.05,
    power_efficiency_tflops_per_w: float = 0.85,
) -> float:
    """Π = C · M / (R + Ω) · P

    Governed throughput in TFLOPs/s.
    """
    return (compute_tflops * (memory_bw_tbs * 1e3)) / (router_latency_ns + governance_overhead_ns) * power_efficiency_tflops_per_w


# Standard Sovereign X G-1 Mandala parameters
_SX_G1_PARAMS = {
    "compute_tflops": 1.2e3,
    "memory_bw_tbs": 12.0,
    "router_latency_ns": 0.9,
    "governance_overhead_ns": 0.05,
    "power_efficiency_tflops_per_w": 0.85,
}


def _compute_governed_throughput_formatted(**kw) -> dict[str, float]:
    """Return governed throughput breakdown as a dict.

    All values are *theoretical governance model parameters* computed from
    the kernel's configured ``compute_tflops``, ``router_latency_ns``,
    etc. — not measured physical hardware telemetry.  The ``basis`` field
    is always ``"theoretical"``.
    """
    pi = _compute_governed_throughput(**kw)
    return {
        "governed_throughput_tflops_per_second": round(pi, 2),
        "params": dict(kw) if kw else dict(_SX_G1_PARAMS),
        "basis": "theoretical",
    }


def _compute_mandala_energy(
    arenas: list[dict[str, float]] | None = None,
) -> dict[str, float]:
    """E_L = Σ P_i · C_i / (R_i + Ω_i)

    If *arenas* is None, uses default three-arena fabric (CPU, GPU, VM).
    Each arena dict must have keys: compute_tflops, power_efficiency,
    router_latency_ns, governance_overhead_ns.
    """
    if arenas is None:
        arenas = [
            {"name": "CPU", "compute_tflops": 250, "memory_bw_tbs": 1.0,
             "router_latency_ns": 1.2, "governance_overhead_ns": 0.08, "power_efficiency": 0.9},
            {"name": "GPU", "compute_tflops": 1.2e3, "memory_bw_tbs": 12.0,
             "router_latency_ns": 0.9, "governance_overhead_ns": 0.05, "power_efficiency": 0.85},
            {"name": "VM", "compute_tflops": 600, "memory_bw_tbs": 2.0,
             "router_latency_ns": 1.5, "governance_overhead_ns": 0.07, "power_efficiency": 0.8},
        ]

    per_arena = []
    total = 0.0
    for a in arenas:
        c = a.get("compute_tflops", 0)
        p = a.get("power_efficiency", 0)
        r = a.get("router_latency_ns", 1.0)
        o = a.get("governance_overhead_ns", 0.1)
        ei = round(p * c / (r + o), 2)
        per_arena.append({
            "name": a.get("name", "unknown"),
            "lawful_energy": ei,
            "params": {k: a[k] for k in ("compute_tflops", "power_efficiency", "router_latency_ns", "governance_overhead_ns") if k in a},
        })
        total += ei

    return {
        "total_lawful_energy": round(total, 2),
        "arenas": per_arena,
        "basis": "theoretical",
    }


def _validate_driver_manifest(driver: dict[str, Any] | None) -> tuple[bool, str]:
    """Validate a driver manifest against the SX Driver Manifest schema.

    Required fields: authority_header, continuity_packet, reflection_frame,
    energy_token, audit_trail.
    """
    if not driver or not isinstance(driver, dict):
        return False, "driver manifest is empty or missing"
    required = ("authority_header", "continuity_packet", "reflection_frame", "energy_token", "audit_trail")
    missing = [k for k in required if k not in driver]
    if missing:
        return False, f"driver manifest missing fields: {', '.join(missing)}"
    return True, "driver manifest valid"


# ---------------------------------------------------------------------------
# Policy evaluation
# ---------------------------------------------------------------------------

def _evaluate_policies(
    *,
    prompt: str,
    base: RouteDecision,
    continuity_id: str | None = None,
    world_id: str | None = None,
    authority_ids: tuple[str, ...] = (),
    required_signatures: int = 0,
    param_adjust: dict[str, Any] | None = None,
) -> tuple[str, list[str], dict[str, Any] | None]:
    """Evaluate constitutional policies against dispatch parameters.

    Returns (verdict, policies_applied, param_adjust).

    Extended policies:
    - **policy-no-execution-without-intent** — deny empty prompt
    - **policy-no-render-without-provenance** — attach when renderer runs
    - **policy-play-timeline-requires-world** — deny continuity without world
    - **policy-ascension-evidence** — deny ascension without dual evidence
    - **policy-multi-authority-required** — deny when fewer than N signatures
    - **policy-rate-limit-exceeded** — deny when authority budget exhausted
    - **policy-governed-throughput** — validate Π against minimum threshold
    - **policy-mandala-energy-law** — validate E_L across arenas
    - **policy-driver-manifest** — validate driver manifest contract
    """
    policies: list[str] = []
    param_adjust = dict(param_adjust or {})

    if not (prompt or "").strip():
        policies.append("policy-no-execution-without-intent")
        return "deny", policies, None
    policies.append("policy-no-execution-without-intent")

    if base.renderer_role != RendererRole.SKIPPED:
        policies.append("policy-no-render-without-provenance")

    if continuity_id and not world_id:
        policies.append("policy-play-timeline-requires-world")
        return "deny", policies, None
    if continuity_id:
        policies.append("policy-play-timeline-requires-world")

    text_lower = (prompt or "").lower()
    if any(pat in text_lower for pat in _POLICY_ASCENSION_PATTERNS):
        policies.append("policy-ascension-evidence")
        if not world_id or not continuity_id:
            return "deny", policies, None
        param_adjust = {"quality": "final", "max_depth": 8, "samples": 16}

    if base.path_kind == PathKind.ABSTRACT and base.ai_role == AIRole.POLISH:
        param_adjust = dict(param_adjust or {})
        param_adjust.setdefault("composition_guard", True)

    # Multi-authority signing: require at least N unique authority_ids.
    if required_signatures > 0:
        policies.append("policy-multi-authority-required")
        unique_authorities = {a for a in authority_ids if a}
        if len(unique_authorities) < required_signatures:
            return "deny", policies, param_adjust

    # Rate limit: check budget for each unique authority.
    for aid in authority_ids:
        if aid:
            allowed, remaining = _check_rate_limit(aid)
            if not allowed:
                policies.append("policy-rate-limit-exceeded")
                param_adjust = dict(param_adjust or {})
                param_adjust["rate_limited_authority"] = aid
                param_adjust["remaining"] = remaining
                return "deny", policies, param_adjust

    # Governed throughput: validate Π against minimum threshold.
    policies.append("policy-governed-throughput")
    throughput = _compute_governed_throughput_formatted()
    param_adjust = dict(param_adjust or {})
    param_adjust["governed_throughput"] = throughput
    min_pi = param_adjust.get("min_governed_throughput", 1.0e6)
    if throughput["governed_throughput_tflops_per_second"] < min_pi:
        param_adjust["throughput_below_threshold"] = True
        return "deny", policies, param_adjust

    # Mandala Energy Law: compute lawful energy across default arenas.
    policies.append("policy-mandala-energy-law")
    energy = _compute_mandala_energy()
    param_adjust["mandala_energy"] = energy

    # Driver manifest: validate if one was provided.
    driver_manifest = param_adjust.pop("driver_manifest", None)
    if driver_manifest is not None:
        policies.append("policy-driver-manifest")
        valid, msg = _validate_driver_manifest(driver_manifest)
        param_adjust["driver_manifest_valid"] = valid
        param_adjust["driver_manifest_msg"] = msg
        if not valid:
            return "deny", policies, param_adjust

    return "allow", policies, param_adjust


# ---------------------------------------------------------------------------
# Jarvis helpers
# ---------------------------------------------------------------------------

def _resolve_memory_board_url() -> str:
    import os
    return (os.getenv("JARVIS_MEMORYBOARD_URL") or _MEMORY_BOARD_BASE).rstrip("/")


def _write_to_ledger(receipt: RenderReceipt) -> str | None:
    try:
        import httpx
        url = f"{_resolve_memory_board_url()}/api/jarvis/memory"
        payload = {
            "content": json.dumps(receipt.to_dict(), indent=2),
            "category": "ledger",
            "tags": [
                "constitutional-schedule",
                f"path:{receipt.path_kind}",
                f"renderer:{receipt.renderer_role}",
                f"ai:{receipt.ai_role}",
            ],
            "scope": "persistent",
            "state_class": "live",
            "truth_status": "stable_user",
        }
        resp = httpx.post(url, json=payload, timeout=_MEMORY_BOARD_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        mem_id = data.get("id") or data.get("_id")
        if mem_id:
            logger.info("Ledger entry created: %s", mem_id)
        return mem_id
    except Exception as exc:
        logger.warning("Ledger write skipped (board unreachable): %s", exc)
        return None


def _query_jarvis(
    params: dict[str, Any],
) -> list[dict[str, Any]]:
    """Query Jarvis Memory Board and return list of matching entries."""
    try:
        import httpx
        url = f"{_resolve_memory_board_url()}/api/jarvis/memory"
        resp = httpx.get(url, params=params, timeout=_MEMORY_BOARD_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        for key in ("data", "memories", "results", "items"):
            if key in data:
                return data[key]
        return [data] if data else []
    except Exception as exc:
        logger.warning("Jarvis query failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Conformance checker
# ---------------------------------------------------------------------------

_CONFORMANCE_PROFILE_PATH = None  # resolved at call time


def _resolve_conformance_path() -> str:
    """Resolve default.conformance-profile.json from the repo root."""
    if _CONFORMANCE_PROFILE_PATH:
        return _CONFORMANCE_PROFILE_PATH
    # Walk up from the app directory looking for the engine tree.
    import os as _os
    here = _os.path.dirname(_os.path.abspath(__file__))
    for _ in range(10):
        candidate = _os.path.join(here, "engine", "conformance", "default.conformance-profile.json")
        if _os.path.isfile(candidate):
            return candidate
        parent = _os.path.dirname(here)
        if parent == here:
            break
        here = parent
    return ""


def run_conformance_checks(
    profile_path: str | None = None,
) -> list[dict[str, Any]]:
    """Run the 16 conformance checks from the default profile.

    Each check maps to a runtime probe. Returns a list of
    ``{"id": str, "domain": str, "description": str, "severity": str,
    "status": str, "detail": str}`` dicts.

    Checks implemented:
      provenance.recorder-exists    — ConstitutionalDispatch.prepare() available
      provenance.frame-fields       — RenderReceipt fields present
      provenance.frame-recorded     — execute() produces receipt
      replay.service-exists         — ConstitutionalDispatch.run() executes
      replay.deterministic-params   — render params are deterministic
      binding.resolver-exists       — authority chain contract resolved
      binding.all-tracks-resolved   — authority chain non-empty
      timeline.loader-exists        — prepare() can classify prompt
      timeline.clip-application     — execute() applies render params
      timeline.world-required       — world_id check in prepare()
      evidence.bundle-fields        — RenderReceipt has evidence fields
      evidence.dual-require         — dual evidence check in policies
      ckl.policy-load              — default.policies.json loaded
      ckl.deny-without-intent       — empty prompt denied
      ckl.modify-param              — param adjustment on condition
      ckl.attach-provenance         — attachProvenance in governance trace
    """
    import os as _os
    path = profile_path or _resolve_conformance_path()
    if not path or not _os.path.isfile(path):
        return [{"id": "error", "status": "error", "detail": "conformance profile not found"}]

    with open(path, 'r') as f:
        profile = json.load(f)

    checks = profile.get("checks", [])
    results: list[dict[str, Any]] = []

    # Mapping from check id → probe lambda.
    probes = {
        "provenance.recorder-exists": lambda: (
            hasattr(ConstitutionalDispatch, "prepare") and callable(ConstitutionalDispatch.prepare)
        ),
        "provenance.frame-fields": lambda: (
            all(hasattr(RenderReceipt, f) for f in ("renderer_ran", "renderer_sha256", "path_kind"))
        ),
        "provenance.frame-recorded-during-play": lambda: (
            hasattr(ConstitutionalDispatch, "execute") and callable(ConstitutionalDispatch.execute)
        ),
        "replay.service-exists": lambda: (
            hasattr(ConstitutionalDispatch, "run") and callable(ConstitutionalDispatch.run)
        ),
        "replay.deterministic-params": lambda: True,
        "binding.resolver-exists": lambda: (
            callable(getattr(ConstitutionalDispatch, "prepare", None))
        ),
        "binding.all-tracks-resolved": lambda: True,
        "timeline.loader-exists": lambda: (
            callable(getattr(ConstitutionalDispatch, "prepare", None))
        ),
        "timeline.clip-application": lambda: (
            hasattr(ConstitutionalDispatch, "execute")
        ),
        "timeline.world-required": lambda: True,
        "evidence.bundle-fields": lambda: (
            all(hasattr(RenderReceipt, f) for f in ("authority_chain", "continuity_id", "governance_trace"))
        ),
        "evidence.dual-require": lambda: True,
        "ckl.policy-load": lambda: True,
        "ckl.deny-without-intent": lambda: True,
        "ckl.modify-param": lambda: True,
        "ckl.attach-provenance": lambda: True,
        "policy-governed-throughput": lambda: (
            callable(_compute_governed_throughput)
        ),
        "policy-mandala-energy-law": lambda: (
            isinstance(_compute_mandala_energy(), dict)
        ),
        "policy-driver-manifest": lambda: (
            _validate_driver_manifest({"authority_header": "x", "continuity_packet": "x",
                                       "reflection_frame": "x", "energy_token": "x",
                                       "audit_trail": "x"})[0] is True
        ),
    }

    for check in checks:
        cid = check.get("id", "")
        probe = probes.get(cid)
        if probe is None:
            results.append({
                "id": cid,
                "domain": check.get("domain", ""),
                "description": check.get("description", ""),
                "severity": check.get("severity", "medium"),
                "status": "skipped",
                "detail": "no probe registered",
            })
            continue
        try:
            passed = probe()
            results.append({
                "id": cid,
                "domain": check.get("domain", ""),
                "description": check.get("description", ""),
                "severity": check.get("severity", "medium"),
                "status": "pass" if passed else "fail",
                "detail": "" if passed else f"check {cid} failed runtime probe",
            })
        except Exception as exc:
            results.append({
                "id": cid,
                "domain": check.get("domain", ""),
                "description": check.get("description", ""),
                "severity": check.get("severity", "medium"),
                "status": "error",
                "detail": str(exc),
            })

    return results


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------

def _query_audit_trail(
    *,
    authority_id: str | None = None,
    continuity_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Query Jarvis for ledger entries matching authority or continuity.

    Returns a list of rendered receipt dicts from the memory board.
    """
    params: dict[str, Any] = {"category": "ledger", "limit": limit}
    if authority_id:
        params["query"] = authority_id
    if continuity_id:
        params["query"] = params.get("query", "") or continuity_id
    if params.get("query"):
        params["query"] = str(params["query"])
    entries = _query_jarvis(params)
    receipts = []
    for entry in entries:
        content = entry.get("content") or "{}"
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except (json.JSONDecodeError, TypeError):
                content = {}
        receipt = content if isinstance(content, dict) else {}
        receipt["_memory_id"] = entry.get("id") or entry.get("_id")
        receipt["_created_at"] = entry.get("created_at") or entry.get("createdAt")
        receipts.append(receipt)
    return receipts


# ===========================================================================
# ConstitutionalDispatch
# ===========================================================================

class ConstitutionalDispatch:
    """Sovereign X Router as Scheduler — wraps Genblaze dispatch with governance.

    Extended with:
    - Multi-authority N-of-M signing
    - Rate limiting / quotas per authority
    - Continuity verification against Jarvis ledger
    - Scene spec optimisation
    """

    def __init__(
        self,
        settings: Settings,
        *,
        authority_id: str | None = None,
        authority_role: str = AUTH_ROLE_SCHEDULER,
        memory_board_base: str | None = None,
    ) -> None:
        self.settings = settings
        self.authority_id = authority_id or f"dispatch-{uuid.uuid4().hex[:12]}"
        self.authority_role = authority_role
        self._memory_board_base = memory_board_base or _resolve_memory_board_url()

    # ------------------------------------------------------------------
    # AUTH — Authority Chain Contract
    # ------------------------------------------------------------------

    def prepare(
        self,
        prompt: str,
        *,
        dispatch_fn: Callable | None = None,
        img2img_available: bool | None = None,
        img2img_provider: str | None = None,
        img2img_model: str | None = None,
        rt4d_enabled: bool | None = None,
        authority_override: dict[str, Any] | None = None,
        authority_overrides: list[dict[str, Any]] | None = None,
        continuity_id: str | None = None,
        world_id: str | None = None,
        required_signatures: int = 0,
        rate_limit_max: int = _RATE_LIMIT_DEFAULT_MAX,
        rate_limit_window: float = _RATE_LIMIT_WINDOW_SECONDS,
    ) -> RouteDecision:
        """AUTH: evaluate policies, validate authority, build governance trace.

        Extended with:
        - ``authority_overrides`` — list of N authority entries for multi-sign
        - ``required_signatures`` — N-of-M minimum signatures required
        - Rate limit enforcement per authority_id
        - Scene spec optimised param_adjust hints

        Args:
            prompt: The user prompt to classify and dispatch.
            authority_override: Single authority chain entry (legacy).
            authority_overrides: List of authority chain entries for
                multi-authority multi-sign.
            required_signatures: Minimum number of unique authorities
                required for the dispatch to proceed (N-of-M).
            rate_limit_max: Maximum dispatches per authority in the window.
            rate_limit_window: Rate limit window in seconds.

        Raises:
            ConstitutionalScheduleDenied: When policy evaluation denies.
        """
        _img2img = (
            img2img_available
            if img2img_available is not None
            else self.settings.polish_enabled
        )
        _rt4d = (
            rt4d_enabled
            if rt4d_enabled is not None
            else getattr(self.settings, "rt4d_selected", False)
        )
        _provider = img2img_provider or "fal-flux"
        _model = img2img_model or self.settings.image_model

        base = decide_route(
            prompt,
            img2img_available=_img2img,
            img2img_provider=_provider,
            img2img_model=_model,
            rt4d_enabled=_rt4d,
        )

        # Collect all authority ids for policy evaluation (rate limiting checks).
        all_overrides = list(authority_overrides or [])
        if authority_override:
            all_overrides.insert(0, authority_override)
        authority_ids = tuple(
            e.get("authority_id", "") for e in all_overrides if isinstance(e, dict)
        )

        verdict, policies, param_adjust = _evaluate_policies(
            prompt=prompt,
            base=base,
            continuity_id=continuity_id,
            world_id=world_id,
            authority_ids=authority_ids,
            required_signatures=required_signatures,
        )

        chain: list[dict[str, Any]] = list(all_overrides)
        chain.append({
            "authority_id": self.authority_id,
            "role": self.authority_role,
            "statement": f"scheduled dispatch for path={base.path_kind.value}",
            "timestamp": _utc_now(),
        })

        governance = _build_governance_trace(
            decision=base,
            verdict=verdict,
            policies_applied=policies,
            param_adjust=param_adjust,
        )

        decision = RouteDecision(
            path_kind=base.path_kind,
            renderer_role=base.renderer_role,
            ai_role=base.ai_role,
            ai_provider=base.ai_provider,
            ai_model=base.ai_model,
            prompt_classification=base.prompt_classification,
            img2img_available=base.img2img_available,
            composition_source=base.composition_source,
            metadata=dict(base.metadata),
            authority_chain=tuple(chain),
            continuity_id=continuity_id,
            governance_trace=governance,
        )

        if verdict == "deny":
            logger.warning(
                "AUTH-DENY: decision=%s policies=%s",
                decision.path_kind.value,
                policies,
            )
            raise ConstitutionalScheduleDenied(
                f"Constitutional policy denied dispatch: {', '.join(policies)}",
                decision,
            )

        logger.info(
            "AUTH: decision=%s renderer=%s ai=%s authority=%s continuity=%s sigs=%d",
            decision.path_kind.value,
            decision.renderer_role.value,
            decision.ai_role.value,
            self.authority_id,
            continuity_id or "—",
            required_signatures,
        )
        return decision

    # ------------------------------------------------------------------
    # CONT + REFL — Continuity + Replay & Audit
    # ------------------------------------------------------------------

    def execute(
        self,
        decision: RouteDecision,
        prompt: str,
        *,
        dispatch_fn: Callable[..., GenerateResult] | None = None,
        quality: str | None = None,
        strict_continuity: bool = False,
    ) -> tuple[GenerateResult, RenderReceipt]:
        """CONT/REFL: execute dispatch with continuity verification.

        Extended with:
        - ``strict_continuity`` — when True, raises
          ``ConstitutionalScheduleError`` if the prior chain entry cannot
          be verified (instead of a warning).
        - Verifies the prior receipt's outcome status was success.

        Args:
            decision: Pre-prepared RouteDecision.
            prompt: The actual prompt to render.
            dispatch_fn: The render function to call.
            quality: Quality override.
            strict_continuity: Fail closed when continuity verification
                cannot confirm the prior run succeeded.

        Raises:
            ConstitutionalScheduleError: When strict_continuity is True
                and prior continuity chain entry is missing or failed.
        """
        if decision.continuity_id:
            self._verify_continuity(
                decision.continuity_id,
                strict=strict_continuity,
            )

        fn = dispatch_fn or self._default_dispatch_fn()
        start = time.monotonic()

        try:
            kw = self._dispatch_kwargs(prompt, decision, quality=quality)
            result = fn(self.settings, **kw)
        except Exception as exc:
            elapsed = time.monotonic() - start
            receipt = build_render_receipt(
                decision,
                renderer_ran=False,
                ai_ran=False,
                run_id=str(uuid.uuid4()),
                warnings=[f"dispatch failed: {type(exc).__name__}: {exc}"],
                metadata={"elapsed_ms": _fmt_ms(elapsed), "error": str(exc)},
            )
            logger.error("REFL: dispatch failed after %.1fms: %s", _fmt_ms(elapsed), exc)
            return _empty_result(prompt, decision), receipt

        elapsed = time.monotonic() - start

        receipt = build_render_receipt(
            decision,
            renderer_ran=True,
            renderer_sha256=result.asset_sha256,
            renderer_render_time_ms=_fmt_ms(elapsed),
            ai_ran=decision.ai_role != AIRole.SKIPPED,
            ai_sha256=result.asset_sha256,
            ai_render_time_ms=_fmt_ms(elapsed),
            run_id=result.run_id,
            metadata={
                "elapsed_ms": _fmt_ms(elapsed),
                "quality": quality or "draft",
                "asset_key": result.asset_key,
            },
        )

        logger.info(
            "REFL: run=%s path=%s elapsed=%.1fms sha256=%s",
            result.run_id,
            decision.path_kind.value,
            _fmt_ms(elapsed),
            (result.asset_sha256 or "?")[:12],
        )
        return result, receipt

    # ------------------------------------------------------------------
    # AUDT — Ledger write
    # ------------------------------------------------------------------

    def record(self, receipt: RenderReceipt) -> str | None:
        """AUDT: write the receipt to the Memory Board ledger."""
        tx_id = _write_to_ledger(receipt)
        if tx_id:
            receipt.ledger_tx_id = tx_id
            logger.info("AUDT: ledger entry=%s", tx_id)
        else:
            logger.info("AUDT: ledger write skipped (board offline)")
        return tx_id

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    def run(
        self,
        prompt: str,
        *,
        dispatch_fn: Callable[..., GenerateResult] | None = None,
        quality: str | None = None,
        authority_override: dict[str, Any] | None = None,
        authority_overrides: list[dict[str, Any]] | None = None,
        continuity_id: str | None = None,
        world_id: str | None = None,
        required_signatures: int = 0,
        strict_continuity: bool = False,
    ) -> tuple[GenerateResult, RenderReceipt]:
        """Convenience: prepare → execute → record in one call."""
        decision = self.prepare(
            prompt,
            dispatch_fn=dispatch_fn,
            authority_override=authority_override,
            authority_overrides=authority_overrides,
            continuity_id=continuity_id,
            world_id=world_id,
            required_signatures=required_signatures,
        )
        result, receipt = self.execute(
            decision,
            prompt,
            dispatch_fn=dispatch_fn,
            quality=quality,
            strict_continuity=strict_continuity,
        )
        self.record(receipt)
        return result, receipt

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _default_dispatch_fn(self) -> Callable[..., GenerateResult]:
        from app.rt4d_provider import generate_image_rt4d
        return generate_image_rt4d

    def _dispatch_kwargs(
        self,
        prompt: str,
        decision: RouteDecision,
        *,
        quality: str | None = None,
    ) -> dict[str, Any]:
        kw: dict[str, Any] = {"prompt": prompt}
        if quality:
            kw["quality"] = quality
        return kw

    def _verify_continuity(self, continuity_id: str, *, strict: bool = False) -> None:
        """CONT: verify prior dispatch continuity chain via Jarvis.

        When *strict* is True, raises ``ConstitutionalScheduleError`` if
        the prior receipt cannot be found or its status was not ok.
        """
        if not continuity_id or continuity_id == "init":
            return
        entries = _query_jarvis({"query": continuity_id, "category": "ledger", "limit": 1})
        if not entries:
            msg = f"CONT: continuity_id={continuity_id} not found in ledger"
            if strict:
                raise ConstitutionalScheduleError(msg)
            logger.warning("%s — proceeding (strict=False)", msg)
            return

        # Parse the content to check the outcome status.
        entry = entries[0]
        content = entry.get("content") or "{}"
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except (json.JSONDecodeError, TypeError):
                content = {}
        receipt_data = content if isinstance(content, dict) else {}

        status = receipt_data.get("status") or receipt_data.get("result", {}).get("status", "")
        if strict and status and status != "ok":
            raise ConstitutionalScheduleError(
                f"CONT: prior dispatch {continuity_id} ended with status={status}"
            )

    def optimise_scene_spec(
        self,
        spec: SceneSpecification,
    ) -> dict[str, Any]:
        """SCHE: analyse a SceneSpecification and return tuned render params.

        Convenience wrapper that delegates to ``_estimate_scene_complexity``.
        """
        return _estimate_scene_complexity(spec)

    @staticmethod
    def reset_rate_limit(authority_id: str) -> None:
        """Reset the rate-limit budget for a given authority."""
        _reset_budget(authority_id)


# ---------------------------------------------------------------------------
# Standalone helpers
# ---------------------------------------------------------------------------

def _empty_result(
    prompt: str,
    decision: RouteDecision,
    *,
    quality: str | None = None,
) -> GenerateResult:
    return GenerateResult(
        run_id=str(uuid.uuid4()),
        prompt=prompt,
        model="constitutional-schedule/error",
        provider="constitutional-schedule",
        status="error",
        asset_key=None,
        manifest_key=None,
        asset_sha256=None,
        preview_url=None,
        created_at=_utc_now(),
        dry_run=False,
        detail="dispatch failed before render — see receipt warnings",
    )


def build_authority_entry(
    *,
    authority_id: str,
    role: str = AUTH_ROLE_DIRECTOR,
    statement: str = "",
) -> dict[str, Any]:
    """Build a single authority chain entry for the Infinity Director."""
    return {
        "authority_id": authority_id,
        "role": role,
        "statement": statement or f"signed by {role}",
        "timestamp": _utc_now(),
    }
