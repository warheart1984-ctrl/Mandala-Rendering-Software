"""Constitutional invariant checks (CI-001..CI-006).

Status of every check: **partial**. Each function is implemented and
unit-tested. No runtime invokes them. Calling a check is the caller's job.

See ``constitution/invariants.json`` for the machine source of truth.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from cros.artifacts import (
    LINEAGE_ORDER,
    STAGES,
    validate_artifact,
    verify_seal,
)
from cros.evidence import check_profile_evidence_fields
from cros.resources import cros_root, invariant, load_invariants, load_profile

__all__ = [
    "CheckResult",
    "check_ci001_intent_immutable",
    "check_ci002_planning_derived",
    "check_ci003_execution_observable",
    "check_ci004_evidence_before_completion",
    "check_ci005_replayability",
    "check_ci006_adapter_isolation",
    "scan_module_imports",
    "validate_lineage",
]


@dataclass(frozen=True)
class CheckResult:
    """Outcome of one invariant check."""

    invariant_id: str
    ok: bool
    detail: str
    status: str = "partial"
    findings: tuple[str, ...] = ()

    def raise_if_failed(self) -> None:
        if not self.ok:
            raise AssertionError(f"{self.invariant_id}: {self.detail}")


def _status(invariant_id: str) -> str:
    try:
        return str(invariant(invariant_id).get("status") or "partial")
    except ValueError:
        return "partial"


# --------------------------------------------------------------------------- #
# CI-001 — Intent immutability
# --------------------------------------------------------------------------- #


def check_ci001_intent_immutable(
    *,
    original: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> CheckResult:
    """Pass when a body change produces a different ``contentHash``.

    Also fails if either artifact's declared hash does not match a recomputation
    (a seal that does not seal is not immutability — it is theatre).
    """
    iid = "CI-001"
    for label, art in (("original", original), ("candidate", candidate)):
        if not verify_seal(art):
            return CheckResult(
                iid,
                False,
                f"{label} contentHash does not match body",
                status=_status(iid),
            )
        try:
            validate_artifact(art)
        except Exception as exc:  # noqa: BLE001 — surface as check failure
            return CheckResult(
                iid, False, f"{label} failed schema: {exc}", status=_status(iid)
            )

    if original["contentHash"] == candidate["contentHash"]:
        # Same hash is fine iff the bodies (excl. contentHash) are identical.
        a = {k: v for k, v in original.items() if k != "contentHash"}
        b = {k: v for k, v in candidate.items() if k != "contentHash"}
        if a != b:
            return CheckResult(
                iid,
                False,
                "body changed but contentHash did not — identity is not content-addressed",
                status=_status(iid),
            )
        return CheckResult(
            iid,
            True,
            "bodies identical; contentHash unchanged (no mutation occurred)",
            status=_status(iid),
        )

    return CheckResult(
        iid,
        True,
        "body change produced a new contentHash (CI-001)",
        status=_status(iid),
    )


# --------------------------------------------------------------------------- #
# CI-002 — Planning derived from intent + capabilities
# --------------------------------------------------------------------------- #


def check_ci002_planning_derived(
    plan: Mapping[str, Any],
    render_intent: Mapping[str, Any],
    *,
    declared_capabilities: Sequence[str],
) -> CheckResult:
    """Pass when the plan cites the intent hash and stays within capabilities."""
    iid = "CI-002"
    if not verify_seal(plan) or not verify_seal(render_intent):
        return CheckResult(iid, False, "plan or intent seal invalid", status=_status(iid))
    if plan.get("derivedFrom") != render_intent.get("id"):
        return CheckResult(
            iid,
            False,
            f"plan.derivedFrom={plan.get('derivedFrom')!r} does not cite "
            f"intent id {render_intent.get('id')!r}",
            status=_status(iid),
        )
    if plan.get("renderIntentHash") != render_intent.get("contentHash"):
        return CheckResult(
            iid,
            False,
            "plan.renderIntentHash does not match intent.contentHash",
            status=_status(iid),
        )
    declared = set(declared_capabilities)
    overreach: list[str] = []
    for step in plan.get("steps") or []:
        for cap in step.get("requiresCapabilities") or []:
            if cap not in declared:
                overreach.append(f"step[{step.get('index')}].{cap}")
    if overreach:
        return CheckResult(
            iid,
            False,
            f"plan requires undeclared capabilities: {overreach}",
            status=_status(iid),
            findings=tuple(overreach),
        )
    return CheckResult(
        iid,
        True,
        "plan cites intent hash and stays within declared capabilities",
        status=_status(iid),
    )


# --------------------------------------------------------------------------- #
# CI-003 — Execution observability
# --------------------------------------------------------------------------- #


def check_ci003_execution_observable(execution: Mapping[str, Any]) -> CheckResult:
    """Pass when ≥1 progress event exists and fractions are non-decreasing."""
    iid = "CI-003"
    if not verify_seal(execution):
        return CheckResult(iid, False, "execution seal invalid", status=_status(iid))
    events = execution.get("progressEvents") or []
    if not events:
        return CheckResult(
            iid,
            False,
            "no progressEvents — execution is not observable",
            status=_status(iid),
        )
    fractions = [e.get("fraction") for e in events]
    if any(not isinstance(f, (int, float)) for f in fractions):
        return CheckResult(iid, False, "progress fraction is not numeric", status=_status(iid))
    if any(f < 0 or f > 1 for f in fractions):  # type: ignore[operator]
        return CheckResult(iid, False, "progress fraction outside [0, 1]", status=_status(iid))
    for i in range(1, len(fractions)):
        if fractions[i] < fractions[i - 1]:  # type: ignore[operator]
            return CheckResult(
                iid,
                False,
                f"progress not monotonic at index {i}: "
                f"{fractions[i - 1]} → {fractions[i]}",
                status=_status(iid),
            )
    return CheckResult(
        iid,
        True,
        f"{len(events)} progress event(s); fractions monotonic",
        status=_status(iid),
    )


# --------------------------------------------------------------------------- #
# CI-004 — Evidence before completion
# --------------------------------------------------------------------------- #


def check_ci004_evidence_before_completion(
    *,
    result: Mapping[str, Any],
    evidence: Mapping[str, Any] | None,
    delivered: bool,
) -> CheckResult:
    """Pass when delivery is gated on evidence that cites the result hash.

    ``delivered=False`` always passes — non-delivery needs no evidence.
    ``delivered=True`` without evidence, or with evidence that does not cite the
    result, fails.
    """
    iid = "CI-004"
    if not delivered:
        return CheckResult(
            iid,
            True,
            "not delivered; evidence not yet required",
            status=_status(iid),
        )
    if evidence is None:
        return CheckResult(
            iid,
            False,
            "delivered=True but no RenderEvidence present",
            status=_status(iid),
        )
    if not verify_seal(result) or not verify_seal(evidence):
        return CheckResult(iid, False, "result or evidence seal invalid", status=_status(iid))
    if evidence.get("derivedFrom") != result.get("id"):
        return CheckResult(
            iid,
            False,
            "evidence.derivedFrom does not cite result.id",
            status=_status(iid),
        )
    if evidence.get("resultHash") != result.get("contentHash"):
        return CheckResult(
            iid,
            False,
            "evidence.resultHash does not match result.contentHash",
            status=_status(iid),
        )
    assets = evidence.get("assets") or []
    if not assets:
        return CheckResult(
            iid,
            False,
            "evidence carries no assets — vacuous completion",
            status=_status(iid),
        )
    if any("sha256" not in a for a in assets):
        return CheckResult(
            iid,
            False,
            "evidence asset missing sha256",
            status=_status(iid),
        )
    return CheckResult(
        iid,
        True,
        "evidence cites result hash and carries hashed assets",
        status=_status(iid),
    )


# --------------------------------------------------------------------------- #
# CI-005 — Profile-scoped replayability
# --------------------------------------------------------------------------- #


def check_ci005_replayability(
    *,
    evidence_or_record: Mapping[str, Any],
    profile_id: str | None = None,
) -> CheckResult:
    """Pass when the asserted replayClass is permitted by the active profile."""
    iid = "CI-005"
    if not verify_seal(evidence_or_record):
        return CheckResult(iid, False, "artifact seal invalid", status=_status(iid))
    pid = profile_id or evidence_or_record.get("profile")
    if not isinstance(pid, str):
        return CheckResult(iid, False, "no profile id", status=_status(iid))
    profile = load_profile(pid)
    allowed = list(profile.get("replay", {}).get("allowedClasses") or [])
    kind = evidence_or_record.get("kind")
    if kind == "RenderEvidence":
        claimed = (evidence_or_record.get("replay") or {}).get("replayClass")
    elif kind == "ReplayRecord":
        claimed = evidence_or_record.get("replayClass")
    else:
        return CheckResult(
            iid,
            False,
            f"CI-005 applies to RenderEvidence/ReplayRecord, not {kind!r}",
            status=_status(iid),
        )
    if claimed not in allowed:
        return CheckResult(
            iid,
            False,
            f"replayClass {claimed!r} not permitted under {pid!r}; "
            f"allowed={allowed}",
            status=_status(iid),
        )
    # Also enforce required evidence fields for gen-ai when checking evidence.
    if kind == "RenderEvidence":
        missing = check_profile_evidence_fields(evidence_or_record, profile)
        if missing:
            return CheckResult(
                iid,
                False,
                f"profile required evidence fields missing: {missing}",
                status=_status(iid),
                findings=tuple(missing),
            )
    return CheckResult(
        iid,
        True,
        f"replayClass {claimed!r} permitted under {pid!r}",
        status=_status(iid),
    )


# --------------------------------------------------------------------------- #
# CI-006 — Adapter isolation
# --------------------------------------------------------------------------- #


@dataclass
class ImportHit:
    module: str
    name: str
    lineno: int


def scan_module_imports(
    path: Path,
    banned_prefixes: Sequence[str],
) -> list[ImportHit]:
    """AST-scan a ``.py`` file for imports whose top-level name matches a ban."""
    hits: list[ImportHit] = []
    try:
        source = path.read_text(encoding="utf-8")
    except OSError:
        return hits
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError:
        return hits
    banned = tuple(banned_prefixes)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".", 1)[0]
                if any(top == b or alias.name.startswith(b + ".") for b in banned):
                    hits.append(ImportHit(str(path), alias.name, node.lineno))
        elif isinstance(node, ast.ImportFrom):
            if node.module is None:
                continue
            top = node.module.split(".", 1)[0]
            if any(top == b or node.module.startswith(b + ".") for b in banned):
                hits.append(ImportHit(str(path), node.module, node.lineno))
    return hits


def check_ci006_adapter_isolation(
    *,
    search_roots: Iterable[Path] | None = None,
    banned_prefixes: Sequence[str] | None = None,
) -> CheckResult:
    """Pass when no scanned module imports a banned prefix.

    Default scan root: ``src/cros``. Default bans: from the constitution.
    """
    iid = "CI-006"
    if banned_prefixes is None:
        banned_prefixes = tuple(
            invariant(iid).get("bannedImportPrefixes")
            or ("story_forge", "storyforge", "app", "genblaze", "cros.adapters")
        )
    roots = list(search_roots) if search_roots is not None else [cros_root() / "src" / "cros"]
    hits: list[ImportHit] = []
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.py")):
            hits.extend(scan_module_imports(path, banned_prefixes))
    if hits:
        findings = tuple(f"{h.module}:{h.lineno} imports {h.name}" for h in hits)
        return CheckResult(
            iid,
            False,
            f"{len(hits)} banned import(s)",
            status=_status(iid),
            findings=findings,
        )
    return CheckResult(
        iid,
        True,
        f"no banned imports under {', '.join(str(r) for r in roots)}",
        status=_status(iid),
    )


# --------------------------------------------------------------------------- #
# Full-chain validation
# --------------------------------------------------------------------------- #


def validate_lineage(artifacts: Mapping[str, Mapping[str, Any]]) -> CheckResult:
    """Validate a complete (or prefix) lineage chain.

    ``artifacts`` is keyed by kind. Every present stage must seal, schema-validate,
    and cite its predecessor correctly. Missing stages are reported; they do not
    by themselves fail the check unless a later stage is present without its
    predecessor (which is the skip we refuse).
    """
    findings: list[str] = []
    present = [k for k in LINEAGE_ORDER if k in artifacts]
    for kind in present:
        art = artifacts[kind]
        if art.get("kind") != kind:
            findings.append(f"{kind}: kind field mismatch ({art.get('kind')!r})")
            continue
        if not verify_seal(art):
            findings.append(f"{kind}: contentHash mismatch")
            continue
        try:
            validate_artifact(art)
        except Exception as exc:  # noqa: BLE001
            findings.append(f"{kind}: schema {exc}")
            continue
        spec = STAGES[kind]
        if spec.predecessor is None:
            continue
        if spec.predecessor not in artifacts:
            findings.append(
                f"{kind}: predecessor {spec.predecessor} missing — stage skipped"
            )
            continue
        pred = artifacts[spec.predecessor]
        if art.get("derivedFrom") != pred.get("id"):
            findings.append(
                f"{kind}: derivedFrom={art.get('derivedFrom')!r} "
                f"≠ {spec.predecessor}.id={pred.get('id')!r}"
            )
        hash_field = spec.predecessor_hash_field
        if hash_field and art.get(hash_field) != pred.get("contentHash"):
            findings.append(
                f"{kind}: {hash_field} does not match {spec.predecessor}.contentHash"
            )

    # Also flag a later stage present while an earlier one is absent.
    if present:
        first_idx = LINEAGE_ORDER.index(present[0])
        for kind in LINEAGE_ORDER[first_idx : LINEAGE_ORDER.index(present[-1]) + 1]:
            if kind not in artifacts:
                findings.append(f"gap: {kind} absent between present stages")

    ok = not findings
    return CheckResult(
        "LINEAGE",
        ok,
        "lineage intact" if ok else f"{len(findings)} lineage fault(s)",
        status="partial",
        findings=tuple(findings),
    )


def constitution_summary() -> dict[str, Any]:
    """Return a compact, evidence-honest summary of the local constitution."""
    data = load_invariants()
    return {
        "crosVersion": data.get("crosVersion"),
        "runtimeStatus": data.get("runtimeStatus"),
        "invariants": [
            {
                "id": i["id"],
                "title": i["title"],
                "status": i["status"],
            }
            for i in data.get("invariants", [])
        ],
    }
