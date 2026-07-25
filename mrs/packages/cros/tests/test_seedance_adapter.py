"""Seedance adapter skeleton tests."""

from __future__ import annotations

from cros.adapter import IRenderAdapter
from cros.adapters.seedance import SeedanceRenderAdapter


def test_seedance_adapter_is_protocol_instance():
    adapter = SeedanceRenderAdapter()
    assert isinstance(adapter, IRenderAdapter)


def test_seedance_adapter_declares_video_and_provider_contract():
    caps = SeedanceRenderAdapter().discoverCapabilities()
    assert caps.modality == ("video",)
    assert "seedance.text2video" in caps.capability_names
    assert caps.features.get("replayClass") == "provider-contract"
    assert caps.features.get("temporalLayers") == "declared-not-implemented"
    assert caps.features.get("status") == "skeleton"


def test_seedance_validate_environment_without_key():
    report = SeedanceRenderAdapter(fal_key_present=False).validateEnvironment()
    assert report.ok is False


def test_seedance_compile_plan_shape():
    plan = SeedanceRenderAdapter().compilePlan(
        {"id": "intent-1", "profile": "cros.gen-ai-nim"}
    )
    body = plan.to_dict()
    assert body["kind"] == "RenderPlan"
    assert body["adapter"]["id"] == "cros.seedance"
    assert body["steps"][0]["capability"] == "seedance.text2video"
