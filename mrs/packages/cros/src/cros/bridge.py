"""Optional thin bridge: map a FLUX-like genblaze manifest dict → RenderEvidence shape.

Status: **skeleton / test helper**.

This module:

- performs no I/O;
- does not import ``app``, ``genblaze``, or anything under ``mrs/apps/``;
- is not wired into ``mrs/apps/genblaze-media``.

It exists so CROS tests can exercise CI-004/CI-005 against a realistic field
set (``run_id``, ``model``, ``provider``, ``asset_sha256``, ``prompt``, …)
without coupling the packages. A future HTTP export from genblaze-media could
emit the same fields; that is a recommended increment, not a present capability.
"""

from __future__ import annotations

import hashlib
from typing import Any, Mapping
from uuid import uuid4

from cros.adapter import AdapterCapabilities, AdapterRef
from cros.artifacts import (
    CreativeIntent,
    OutputArtifact,
    ProgressEvent,
    RenderExecution,
    RenderIntent,
    RenderResult,
    sha256_bytes,
)
from cros.evidence import build_evidence, build_unverified_replay_record
from cros.planning import derive_plan

__all__ = [
    "BridgeError",
    "evidence_from_genblaze_manifest",
    "unverified_replay_from_manifest",
]


class BridgeError(ValueError):
    """The input manifest cannot be mapped into CROS shape."""


def evidence_from_genblaze_manifest(
    manifest: Mapping[str, Any],
    *,
    author: str = "genblaze-media-operator",
    adapter_id: str = "cros.bridge.genblaze-shaped",
    adapter_version: str = "0.1.0",
) -> dict[str, Any]:
    """Map a genblaze-shaped manifest dict into a sealed RenderEvidence.

    Expected keys (aligned with ``GenerateResult.to_dict()`` in genblaze-media,
    but not imported from it):

    - ``run_id`` (str)
    - ``prompt`` (str)
    - ``model`` (str)
    - ``provider`` (str)
    - ``asset_sha256`` (str, 64 hex)
    - ``asset_key`` or ``preview_url`` (str) — used as the asset URI
    - ``created_at`` (str, ISO-8601)
    - ``seed`` (int | None, optional)
    - ``provider_request_id`` (str, optional — synthesised if absent, with disclosure)
    """
    required = ("run_id", "prompt", "model", "provider", "asset_sha256", "created_at")
    missing = [k for k in required if k not in manifest or manifest[k] in (None, "")]
    if missing:
        raise BridgeError(f"manifest missing required fields: {missing}")

    asset_uri = (
        manifest.get("asset_key")
        or manifest.get("preview_url")
        or f"urn:cros:asset:{manifest['run_id']}"
    )
    asset_sha = str(manifest["asset_sha256"]).lower()
    if len(asset_sha) != 64 or any(c not in "0123456789abcdef" for c in asset_sha):
        raise BridgeError(f"asset_sha256 is not 64 hex chars: {asset_sha!r}")

    prompt = str(manifest["prompt"])
    prompt_sha = sha256_bytes(prompt.encode("utf-8"))
    seed = manifest.get("seed", None)
    has_seed_key = "seed" in manifest

    provider_request_id = manifest.get("provider_request_id") or manifest.get(
        "providerRequestId"
    )
    synthesised_request_id = False
    if not provider_request_id:
        synthesised_request_id = True
        provider_request_id = hashlib.sha256(
            f"{manifest['run_id']}|{manifest['model']}|{asset_sha}".encode("utf-8")
        ).hexdigest()[:32]

    created = str(manifest["created_at"])
    run_id = str(manifest["run_id"])
    modality = str(manifest.get("modality") or "image")
    if modality not in {"image", "video", "frameSequence"}:
        modality = "image"

    creative = CreativeIntent(
        id=f"ci-{run_id}",
        author=author,
        brief=prompt,
        profile="cros.gen-ai-nim",
        created_at=created,
        tags=("bridge", "genblaze-shaped"),
    ).to_dict()

    intent = RenderIntent(
        id=f"ri-{run_id}",
        profile="cros.gen-ai-nim",
        derived_from=creative["id"],
        creative_intent_hash=creative["contentHash"],
        target={"modality": modality},
        created_at=created,
        prompt=prompt,
        prompt_sha256=prompt_sha,
        seed=seed if has_seed_key else None,
        omit_seed=False,
    ).to_dict()

    caps = AdapterCapabilities(
        adapter=AdapterRef(adapter_id, adapter_version),
        profiles=("cros.gen-ai-nim",),
        modality=("image", "video"),
        capability_names=("gen.submit",),
        features={"bridge": True, "renders": False},
    )
    plan = derive_plan(intent, caps, plan_id=f"plan-{run_id}")

    execution = RenderExecution(
        id=f"exec-{run_id}",
        profile="cros.gen-ai-nim",
        derived_from=plan["id"],
        plan_hash=plan["contentHash"],
        adapter=caps.adapter.to_dict(),
        state="succeeded",
        started_at=created,
        ended_at=created,
        progress_events=(
            ProgressEvent(phase="submit", fraction=0.0, at=created),
            ProgressEvent(phase="complete", fraction=1.0, at=created),
        ),
        created_at=created,
        provider_request_id=str(provider_request_id),
    ).to_dict()

    result = RenderResult(
        id=f"result-{run_id}",
        profile="cros.gen-ai-nim",
        derived_from=execution["id"],
        execution_hash=execution["contentHash"],
        status="ok",
        outputs=(
            OutputArtifact(
                role="primary",
                uri=str(asset_uri),
                sha256=asset_sha,
                media_type=str(manifest.get("media_type") or "application/octet-stream"),
            ),
        ),
        created_at=created,
    ).to_dict()

    replay_inputs: dict[str, Any] = {
        "model": {"id": str(manifest["model"])},
        "params": {
            "provider": str(manifest["provider"]),
            "modality": modality,
            "dry_run": bool(manifest.get("dry_run", False)),
        },
        "prompt": {"sha256": prompt_sha},
        "seed": seed if has_seed_key else None,
        "provider": {"requestId": str(provider_request_id)},
    }

    return build_evidence(
        result=result,
        execution=execution,
        plan=plan,
        render_intent=intent,
        creative_intent=creative,
        replay_inputs=replay_inputs,
        evidence_id=f"evidence-{run_id}",
        manifest={
            "source": "cros.bridge.evidence_from_genblaze_manifest",
            "run_id": run_id,
            "provider": str(manifest["provider"]),
            "model": str(manifest["model"]),
            "synthesisedProviderRequestId": synthesised_request_id,
            "note": (
                "Mapped from a genblaze-shaped dict for CROS tests. "
                "Does not imply genblaze-media implements CROS. "
                "No I/O performed."
            ),
        },
    )


def unverified_replay_from_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    """Convenience: evidence + unverified ReplayRecord from a genblaze-shaped dict."""
    evidence = evidence_from_genblaze_manifest(manifest)
    return build_unverified_replay_record(
        evidence,
        record_id=f"replay-{manifest.get('run_id', uuid4())}",
        notes="bridge: no replay attempted",
    )
