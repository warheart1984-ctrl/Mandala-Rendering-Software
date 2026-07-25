"""Shared fixtures and a small lineage factory for CROS tests."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

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
from cros.evidence import build_evidence
from cros.planning import derive_plan


PACKAGE_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def package_root() -> Path:
    return PACKAGE_ROOT


@pytest.fixture
def gen_ai_capabilities() -> AdapterCapabilities:
    return AdapterCapabilities(
        adapter=AdapterRef("cros.test.gen-ai", "0.1.0"),
        profiles=("cros.gen-ai-nim",),
        modality=("image", "video"),
        capability_names=("gen.submit",),
        features={"test": True},
    )


@pytest.fixture
def sample_prompt() -> str:
    return "a matte painting of a clifford torus under volumetric light"


@pytest.fixture
def sample_asset_sha() -> str:
    return sha256_bytes(b"fake-png-bytes-for-cros-tests")


def build_gen_ai_lineage(
    *,
    prompt: str = "a matte painting of a clifford torus under volumetric light",
    seed: int | None = 42,
    include_seed: bool = True,
    asset_sha: str | None = None,
    provider_request_id: str = "req-test-001",
    capabilities: AdapterCapabilities | None = None,
) -> dict[str, dict[str, Any]]:
    """Build a complete sealed gen-ai lineage ending at RenderEvidence."""
    caps = capabilities or AdapterCapabilities(
        adapter=AdapterRef("cros.test.gen-ai", "0.1.0"),
        profiles=("cros.gen-ai-nim",),
        modality=("image", "video"),
        capability_names=("gen.submit",),
        features={"test": True},
    )
    sha = asset_sha or sha256_bytes(b"fake-png-bytes-for-cros-tests")
    created = "2026-07-24T21:00:00+00:00"

    creative = CreativeIntent(
        id="ci-test-001",
        author="test-operator",
        brief=prompt,
        profile="cros.gen-ai-nim",
        created_at=created,
        tags=("test",),
    ).to_dict()

    intent = RenderIntent(
        id="ri-test-001",
        profile="cros.gen-ai-nim",
        derived_from=creative["id"],
        creative_intent_hash=creative["contentHash"],
        target={"modality": "image", "width": 1024, "height": 1024},
        created_at=created,
        prompt=prompt,
        prompt_sha256=sha256_bytes(prompt.encode("utf-8")),
        seed=seed if include_seed else None,
        omit_seed=not include_seed,
    ).to_dict()

    plan = derive_plan(intent, caps, plan_id="plan-test-001")

    execution = RenderExecution(
        id="exec-test-001",
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
        provider_request_id=provider_request_id,
    ).to_dict()

    result = RenderResult(
        id="result-test-001",
        profile="cros.gen-ai-nim",
        derived_from=execution["id"],
        execution_hash=execution["contentHash"],
        status="ok",
        outputs=(
            OutputArtifact(
                role="primary",
                uri="s3://test-bucket/concept.png",
                sha256=sha,
                media_type="image/png",
                bytes_=17,
            ),
        ),
        created_at=created,
    ).to_dict()

    replay_inputs: dict[str, Any] = {
        "model": {"id": "black-forest-labs/flux.1-schnell"},
        "params": {"steps": 4, "guidance": 0.0, "width": 1024, "height": 1024},
        "prompt": {"sha256": intent["promptSha256"]},
        "seed": seed if include_seed else None,
        "provider": {"requestId": provider_request_id},
    }

    evidence = build_evidence(
        result=result,
        execution=execution,
        plan=plan,
        render_intent=intent,
        creative_intent=creative,
        replay_inputs=replay_inputs,
        evidence_id="evidence-test-001",
        manifest={"test": True},
    )

    return {
        "CreativeIntent": creative,
        "RenderIntent": intent,
        "RenderPlan": plan,
        "RenderExecution": execution,
        "RenderResult": result,
        "RenderEvidence": evidence,
    }
