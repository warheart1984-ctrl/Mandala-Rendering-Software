"""Typed CROS lineage artifacts, canonical hashing, and schema validation.

Seven artifacts, six transitions, nothing skips — see ``schemas/lineage.md``.

Hashing rule (CI-001): ``contentHash`` is SHA-256 over canonical JSON of the
artifact body with the ``contentHash`` key removed. A hash cannot cover itself.

Dataclasses are provided for the five producer-side stages. ``RenderEvidence``
and ``ReplayRecord`` are built by :mod:`cros.evidence`, because constructing them
requires reading the active conformance profile and is therefore a policy
operation rather than a data operation.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from jsonschema import Draft202012Validator

from cros.resources import schema_for_kind

__all__ = [
    "CROS_VERSION",
    "LINEAGE_ORDER",
    "STAGES",
    "CreativeIntent",
    "OutputArtifact",
    "ProgressEvent",
    "RenderExecution",
    "RenderIntent",
    "RenderPlan",
    "RenderResult",
    "SchemaValidationError",
    "StageSpec",
    "canonical_hash",
    "canonical_json",
    "seal",
    "sha256_bytes",
    "utc_now",
    "validate_artifact",
    "verify_seal",
]

CROS_VERSION = "0.1.0"

LINEAGE_ORDER: tuple[str, ...] = (
    "CreativeIntent",
    "RenderIntent",
    "RenderPlan",
    "RenderExecution",
    "RenderResult",
    "RenderEvidence",
    "ReplayRecord",
)


@dataclass(frozen=True)
class StageSpec:
    """How a lineage stage cites its predecessor.

    ``predecessor_hash_field`` is the field carrying the predecessor's
    ``contentHash``. Both citations are required by schema for every stage except
    the origin, which is what makes a skipped stage detectable.
    """

    kind: str
    predecessor: str | None
    predecessor_hash_field: str | None


STAGES: dict[str, StageSpec] = {
    "CreativeIntent": StageSpec("CreativeIntent", None, None),
    "RenderIntent": StageSpec("RenderIntent", "CreativeIntent", "creativeIntentHash"),
    "RenderPlan": StageSpec("RenderPlan", "RenderIntent", "renderIntentHash"),
    "RenderExecution": StageSpec("RenderExecution", "RenderPlan", "planHash"),
    "RenderResult": StageSpec("RenderResult", "RenderExecution", "executionHash"),
    "RenderEvidence": StageSpec("RenderEvidence", "RenderResult", "resultHash"),
    "ReplayRecord": StageSpec("ReplayRecord", "RenderEvidence", "evidenceHash"),
}


class SchemaValidationError(ValueError):
    """An artifact does not satisfy its JSON Schema."""


# --------------------------------------------------------------------------- #
# Canonical form and hashing
# --------------------------------------------------------------------------- #


def utc_now() -> str:
    """Second-resolution UTC ISO-8601 timestamp."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def canonical_json(value: Any) -> str:
    """Serialise to canonical JSON: sorted keys, no insignificant whitespace, UTF-8.

    Determinism here is what makes ``contentHash`` comparable across machines and
    languages, so the separators and key ordering are part of the contract, not a
    formatting preference.
    """
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_hash(body: Mapping[str, Any], *, exclude: Sequence[str] = ("contentHash",)) -> str:
    """SHA-256 over canonical JSON of ``body``, with ``exclude`` keys removed."""
    stripped = {k: v for k, v in body.items() if k not in set(exclude)}
    return sha256_bytes(canonical_json(stripped).encode("utf-8"))


def seal(body: Mapping[str, Any]) -> dict[str, Any]:
    """Return ``body`` with a freshly computed ``contentHash``."""
    sealed = {k: v for k, v in body.items() if k != "contentHash"}
    sealed["contentHash"] = canonical_hash(sealed)
    return sealed


def verify_seal(artifact: Mapping[str, Any]) -> bool:
    """True when the declared ``contentHash`` matches a recomputation."""
    declared = artifact.get("contentHash")
    if not isinstance(declared, str):
        return False
    return declared == canonical_hash(artifact)


def validate_artifact(artifact: Mapping[str, Any]) -> None:
    """Validate against the schema for ``artifact["kind"]``.

    Raises :class:`SchemaValidationError` listing every violation, rather than
    only the first — a caller fixing an artifact wants the whole list.
    """
    kind = artifact.get("kind")
    if not isinstance(kind, str):
        raise SchemaValidationError("artifact has no string 'kind'")
    validator = Draft202012Validator(
        schema_for_kind(kind),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )
    errors = sorted(validator.iter_errors(artifact), key=lambda e: list(e.absolute_path))
    if errors:
        detail = "; ".join(
            f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}"
            for e in errors
        )
        raise SchemaValidationError(f"{kind} failed schema validation: {detail}")


# --------------------------------------------------------------------------- #
# Stage 1–5 artifacts
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class CreativeIntent:
    """Stage 1. Human creative authority. Origin of the chain."""

    id: str
    author: str
    brief: str
    profile: str
    created_at: str = field(default_factory=utc_now)
    references: tuple[str, ...] = ()
    constraints: Mapping[str, Any] | None = None
    tags: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "crosVersion": CROS_VERSION,
            "kind": "CreativeIntent",
            "id": self.id,
            "createdAt": self.created_at,
            "profile": self.profile,
            "author": self.author,
            "brief": self.brief,
        }
        if self.references:
            body["references"] = list(self.references)
        if self.constraints:
            body["constraints"] = dict(self.constraints)
        if self.tags:
            body["tags"] = list(self.tags)
        return seal(body)


@dataclass(frozen=True)
class RenderIntent:
    """Stage 2. Technical restatement of a CreativeIntent.

    ``seed`` distinguishes three states deliberately: an int (pinned),
    ``None`` (the provider exposed no seed — a recorded fact), and ``omit_seed``
    (not applicable to this profile). Conflating the last two is how "we did not
    record it" gets misread as "there was nothing to record".
    """

    id: str
    profile: str
    derived_from: str
    creative_intent_hash: str
    target: Mapping[str, Any]
    created_at: str = field(default_factory=utc_now)
    prompt: str | None = None
    prompt_sha256: str | None = None
    seed: int | None = None
    omit_seed: bool = True
    color_space: str | None = None
    deliverables: tuple[Mapping[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "crosVersion": CROS_VERSION,
            "kind": "RenderIntent",
            "id": self.id,
            "createdAt": self.created_at,
            "profile": self.profile,
            "derivedFrom": self.derived_from,
            "creativeIntentHash": self.creative_intent_hash,
            "target": dict(self.target),
        }
        if self.prompt is not None:
            body["prompt"] = self.prompt
            body["promptSha256"] = self.prompt_sha256 or sha256_bytes(
                self.prompt.encode("utf-8")
            )
        elif self.prompt_sha256 is not None:
            body["promptSha256"] = self.prompt_sha256
        if not self.omit_seed:
            body["seed"] = self.seed
        if self.color_space is not None:
            body["colorSpace"] = self.color_space
        if self.deliverables:
            body["deliverables"] = [dict(d) for d in self.deliverables]
        return seal(body)


@dataclass(frozen=True)
class RenderPlan:
    """Stage 3. Executable decomposition bound to a declared capability set."""

    id: str
    profile: str
    derived_from: str
    render_intent_hash: str
    adapter: Mapping[str, str]
    capabilities_hash: str
    steps: tuple[Mapping[str, Any], ...]
    created_at: str = field(default_factory=utc_now)
    estimates: Mapping[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "crosVersion": CROS_VERSION,
            "kind": "RenderPlan",
            "id": self.id,
            "createdAt": self.created_at,
            "profile": self.profile,
            "derivedFrom": self.derived_from,
            "renderIntentHash": self.render_intent_hash,
            "adapter": dict(self.adapter),
            "capabilitiesHash": self.capabilities_hash,
            "steps": [dict(s) for s in self.steps],
        }
        if self.estimates:
            body["estimates"] = dict(self.estimates)
        return seal(body)


@dataclass(frozen=True)
class ProgressEvent:
    """One observation of in-flight execution (CI-003)."""

    phase: str
    fraction: float
    at: str = field(default_factory=utc_now)
    message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "at": self.at,
            "phase": self.phase,
            "fraction": self.fraction,
        }
        if self.message is not None:
            body["message"] = self.message
        return body


@dataclass(frozen=True)
class RenderExecution:
    """Stage 4. The observed run of a RenderPlan."""

    id: str
    profile: str
    derived_from: str
    plan_hash: str
    adapter: Mapping[str, str]
    state: str
    started_at: str
    progress_events: tuple[ProgressEvent, ...]
    created_at: str = field(default_factory=utc_now)
    ended_at: str | None = None
    provider_request_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "crosVersion": CROS_VERSION,
            "kind": "RenderExecution",
            "id": self.id,
            "createdAt": self.created_at,
            "profile": self.profile,
            "derivedFrom": self.derived_from,
            "planHash": self.plan_hash,
            "adapter": dict(self.adapter),
            "state": self.state,
            "startedAt": self.started_at,
            "progressEvents": [e.to_dict() for e in self.progress_events],
        }
        if self.ended_at is not None:
            body["endedAt"] = self.ended_at
        if self.provider_request_id is not None:
            body["providerRequestId"] = self.provider_request_id
        return seal(body)


@dataclass(frozen=True)
class OutputArtifact:
    """A produced file, addressed by content."""

    role: str
    uri: str
    sha256: str
    media_type: str | None = None
    bytes_: int | None = None

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "role": self.role,
            "uri": self.uri,
            "sha256": self.sha256,
        }
        if self.media_type is not None:
            body["mediaType"] = self.media_type
        if self.bytes_ is not None:
            body["bytes"] = self.bytes_
        return body


@dataclass(frozen=True)
class RenderResult:
    """Stage 5. What the execution produced.

    Not a completion signal — CI-004 puts completion at stage 6.
    """

    id: str
    profile: str
    derived_from: str
    execution_hash: str
    status: str
    outputs: tuple[OutputArtifact, ...] = ()
    created_at: str = field(default_factory=utc_now)
    metrics: Mapping[str, Any] | None = None
    failure_detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "crosVersion": CROS_VERSION,
            "kind": "RenderResult",
            "id": self.id,
            "createdAt": self.created_at,
            "profile": self.profile,
            "derivedFrom": self.derived_from,
            "executionHash": self.execution_hash,
            "status": self.status,
            "outputs": [o.to_dict() for o in self.outputs],
        }
        if self.metrics:
            body["metrics"] = dict(self.metrics)
        if self.failure_detail is not None:
            body["failureDetail"] = self.failure_detail
        return seal(body)
