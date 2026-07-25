"""RenderEvidence / ReplayRecord builders — stages 6 and 7.

Status: **partial** for ``cros.gen-ai-nim`` (required evidence fields are
machine-checked); **declared** for ``cros.dcc-offline`` (schema-valid evidence
can be built, but the offline required-field set is not enforced because no
producer exists to check).

CI-004 lives here: a result is not complete until evidence citing its hash
exists. CI-005 also lives here: the asserted ``replayClass`` must be permitted
by the active profile.
"""

from __future__ import annotations

from typing import Any, Mapping
from uuid import uuid4

from cros.artifacts import (
    CROS_VERSION,
    canonical_hash,
    seal,
    utc_now,
    validate_artifact,
    verify_seal,
)
from cros.resources import load_profile

__all__ = [
    "EvidenceError",
    "build_evidence",
    "build_unverified_replay_record",
    "check_profile_evidence_fields",
]


class EvidenceError(ValueError):
    """Evidence cannot be constructed from the given inputs."""


def _dot_get(obj: Mapping[str, Any], path: str) -> Any:
    """Resolve a dotted path; returns a sentinel on missing intermediate keys."""
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, Mapping) or part not in cur:
            return _MISSING
        cur = cur[part]
    return cur


class _Missing:
    def __repr__(self) -> str:  # pragma: no cover
        return "<missing>"


_MISSING = _Missing()


def check_profile_evidence_fields(
    evidence_body: Mapping[str, Any],
    profile: Mapping[str, Any],
) -> list[str]:
    """Return the list of ``requiredEvidenceFields`` that are absent.

    Presence of a key with value ``None`` counts as present — for gen-ai, a
    ``seed: null`` is a recorded fact ("provider exposed no seed"), not a
    missing field. See ``profiles/cros.gen-ai-nim.json``.
    """
    required = profile.get("requiredEvidenceFields") or []
    if not isinstance(required, list):
        return []
    # Offline profile fields are declared expectations, not machine-checked.
    if profile.get("profileId") == "cros.dcc-offline":
        return []
    missing: list[str] = []
    for path in required:
        if _dot_get(evidence_body, path) is _MISSING:
            missing.append(path)
    return missing


def build_evidence(
    *,
    result: Mapping[str, Any],
    execution: Mapping[str, Any],
    plan: Mapping[str, Any],
    render_intent: Mapping[str, Any],
    creative_intent: Mapping[str, Any],
    replay_inputs: Mapping[str, Any],
    replay_class: str | None = None,
    evidence_id: str | None = None,
    manifest: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a sealed RenderEvidence from the upstream sealed lineage.

    Raises :class:`EvidenceError` when:
    - any upstream artifact fails its seal or schema;
    - the chain of ``derivedFrom`` / hash citations is inconsistent;
    - the result has status ``ok`` but no hashed outputs (CI-004);
    - the asserted ``replayClass`` is outside the profile's ``allowedClasses``
      (CI-005);
    - a gen-ai required evidence field is missing.
    """
    for name, art in (
        ("creative_intent", creative_intent),
        ("render_intent", render_intent),
        ("plan", plan),
        ("execution", execution),
        ("result", result),
    ):
        if not verify_seal(art):
            raise EvidenceError(f"{name} contentHash does not match body")
        validate_artifact(art)

    profile_id = result["profile"]
    for art in (execution, plan, render_intent, creative_intent):
        if art["profile"] != profile_id:
            raise EvidenceError(
                f"profile mismatch: result={profile_id!r} vs {art['kind']}={art['profile']!r}"
            )

    _assert_citation(result, "derivedFrom", execution["id"], "executionHash", execution["contentHash"])
    _assert_citation(execution, "derivedFrom", plan["id"], "planHash", plan["contentHash"])
    _assert_citation(plan, "derivedFrom", render_intent["id"], "renderIntentHash", render_intent["contentHash"])
    _assert_citation(
        render_intent,
        "derivedFrom",
        creative_intent["id"],
        "creativeIntentHash",
        creative_intent["contentHash"],
    )

    profile = load_profile(profile_id)
    allowed = list(profile.get("replay", {}).get("allowedClasses") or [])
    default_class = profile.get("replay", {}).get("default")
    chosen = replay_class or default_class
    if chosen not in allowed:
        raise EvidenceError(
            f"replayClass {chosen!r} is not permitted under profile "
            f"{profile_id!r}; allowed={allowed} (CI-005)"
        )

    assets = [dict(o) for o in (result.get("outputs") or [])]
    if result.get("status") == "ok" and not assets:
        raise EvidenceError(
            "CI-004: a successful RenderResult must carry at least one hashed "
            "output before evidence can be built"
        )
    for asset in assets:
        if "sha256" not in asset:
            raise EvidenceError(f"CI-004: output missing sha256: {asset!r}")

    claim = str(profile.get("replay", {}).get("claim") or "")
    if not claim:
        raise EvidenceError(f"profile {profile_id!r} has no replay.claim text")

    body: dict[str, Any] = {
        "crosVersion": CROS_VERSION,
        "kind": "RenderEvidence",
        "id": evidence_id or f"evidence-{uuid4()}",
        "createdAt": utc_now(),
        "profile": profile_id,
        "derivedFrom": result["id"],
        "resultHash": result["contentHash"],
        "lineage": {
            "creativeIntentId": creative_intent["id"],
            "renderIntentId": render_intent["id"],
            "planId": plan["id"],
            "executionId": execution["id"],
            "resultId": result["id"],
            "hashes": {
                "CreativeIntent": creative_intent["contentHash"],
                "RenderIntent": render_intent["contentHash"],
                "RenderPlan": plan["contentHash"],
                "RenderExecution": execution["contentHash"],
                "RenderResult": result["contentHash"],
            },
        },
        "assets": assets,
        "replay": {
            "replayClass": chosen,
            "claim": claim,
            "inputs": dict(replay_inputs),
        },
    }
    if manifest:
        body["manifest"] = dict(manifest)

    missing = check_profile_evidence_fields(body, profile)
    if missing:
        raise EvidenceError(
            f"profile {profile_id!r} requires evidence fields {missing}; not present"
        )

    sealed = seal(body)
    validate_artifact(sealed)
    return sealed


def build_unverified_replay_record(
    evidence: Mapping[str, Any],
    *,
    record_id: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Build a ReplayRecord with ``verdict: unverified``.

    This is the honest default for the scaffold: evidence claims a class, and
    the record acknowledges that no reproduction attempt was made. A future
    replay executor would produce ``reproduced`` / ``diverged`` instead.
    """
    if not verify_seal(evidence):
        raise EvidenceError("evidence contentHash does not match body")
    validate_artifact(evidence)

    profile = load_profile(evidence["profile"])
    replay_class = evidence["replay"]["replayClass"]
    allowed = list(profile.get("replay", {}).get("allowedClasses") or [])
    if replay_class not in allowed:
        raise EvidenceError(
            f"evidence asserts replayClass {replay_class!r} which profile "
            f"{evidence['profile']!r} does not permit (CI-005)"
        )

    body: dict[str, Any] = {
        "crosVersion": CROS_VERSION,
        "kind": "ReplayRecord",
        "id": record_id or f"replay-{uuid4()}",
        "createdAt": utc_now(),
        "profile": evidence["profile"],
        "derivedFrom": evidence["id"],
        "evidenceHash": evidence["contentHash"],
        "replayClass": replay_class,
        "verdict": "unverified",
        "inputs": dict(evidence["replay"]["inputs"]),
        "comparison": {
            "status": "not-attempted",
            "note": "scaffold: no replay executor exists",
        },
    }
    if notes is not None:
        body["notes"] = notes
    sealed = seal(body)
    validate_artifact(sealed)
    return sealed


def _assert_citation(
    child: Mapping[str, Any],
    derived_field: str,
    expected_id: str,
    hash_field: str,
    expected_hash: str,
) -> None:
    if child.get(derived_field) != expected_id:
        raise EvidenceError(
            f"{child.get('kind')} .{derived_field}={child.get(derived_field)!r} "
            f"does not cite {expected_id!r}"
        )
    if child.get(hash_field) != expected_hash:
        raise EvidenceError(
            f"{child.get('kind')} .{hash_field} does not match predecessor contentHash"
        )


def hash_capabilities(capabilities: Mapping[str, Any]) -> str:
    """Public helper: hash an arbitrary capabilities mapping."""
    return canonical_hash(capabilities)
