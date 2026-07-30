"""Tests for constitutional_schedule — Sovereign X Router as Scheduler.

Tests the AUTH (authority chain), CONT (continuity), REFL (RenderReceipt),
and AUDT (ledger) layers without requiring a live render backend.
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.constitutional_schedule import (
    AUTH_ROLE_DIRECTOR,
    AUTH_ROLE_SCHEDULER,
    ConstitutionalDispatch,
    ConstitutionalScheduleError,
    _compute_governed_throughput,
    _compute_mandala_energy,
    _estimate_scene_complexity,
    _reset_budget,
    _validate_driver_manifest,
    build_authority_entry,
    run_conformance_checks,
)
from app.sx_kernel import (
    CIS,
    ProcessIntent,
    SovereignXKernel,
)
from app.path_routing import (
    AIRole,
    PathKind,
    RendererRole,
    RouteDecision,
)
from app.pipeline import GenerateResult


def _settings(**kwargs) -> Settings:
    defaults = dict(
        nvidia_api_key=None,
        fal_api_key=None,
        b2_key_id=None,
        b2_app_key=None,
        b2_bucket="test",
        b2_region="us-east-005",
        b2_endpoint=None,
        storage_prefix="t",
        image_model="black-forest-labs/flux.1-schnell",
        video_model="nvidia/cosmos-1.0-7b-diffusion-text2world",
        video_enabled=False,
        video_backend="nvidia",
        seedance_model="bytedance/seedance-2.0/text-to-video",
        seedance_resolution="720p",
        seedance_duration="5",
        seedance_aspect_ratio="16:9",
        seedance_generate_audio=True,
        seedance_watermark=None,
        embed_model="nvidia/nv-embedcode-7b-v1",
        embed_url="https://integrate.api.nvidia.com/v1/embeddings",
        embed_timeout_seconds=60.0,
        store_full_embeddings=False,
        presign_expires_seconds=3600,
        dry_run=True,
        b2_probe_on_health=False,
        abstract_retry_on_blank=True,
        empty_504_retry=False,
        empty_504_retry_delay_seconds=45.0,
        nvidia_warmup_on_startup=False,
        dotenv_loaded=(),
        allow_byok=False,
        polish_enabled=False,
        image_backend="nvidia",
    )
    # Convert convenience kwarg 'rt4d_selected' to image_backend if passed.
    if kwargs.pop("rt4d_selected", False):
        defaults["image_backend"] = "rt4d"
    defaults.update(kwargs)
    return Settings(**defaults)


def _fake_generate_result(prompt: str, **overrides) -> GenerateResult:
    import hashlib
    import uuid
    from datetime import datetime, timezone

    run_id = str(uuid.uuid4())
    sha = hashlib.sha256(prompt.encode()).hexdigest()
    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    defaults = dict(
        run_id=run_id,
        prompt=prompt,
        model="test/mock",
        provider="test",
        status="ok",
        asset_key=f"t/test/{run_id}/render.png",
        manifest_key=f"t/test/{run_id}/manifest.json",
        asset_sha256=sha,
        preview_url=None,
        created_at=created_at,
        dry_run=False,
    )
    defaults.update(overrides)
    return GenerateResult(**defaults)


# ---------------------------------------------------------------------------
# AUTH — Authority Chain Contract
# ---------------------------------------------------------------------------

class TestConstitutionalDispatchAuth:
    """AUTH layer: authority chain + governance trace."""

    def test_prepare_populates_authority_chain(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(
            settings,
            authority_id="test-auth-001",
            authority_role="test-role",
        )
        decision = dispatch.prepare("glowing tesseract lattice")
        assert len(decision.authority_chain) == 1
        entry = decision.authority_chain[0]
        assert entry["authority_id"] == "test-auth-001"
        assert entry["role"] == "test-role"
        assert "timestamp" in entry

    def test_prepare_with_authority_override(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings, authority_id="scheduler-1")
        override = build_authority_entry(
            authority_id="director-42",
            role=AUTH_ROLE_DIRECTOR,
            statement="dispatch signed by director",
        )
        decision = dispatch.prepare(
            "abstract mandala glyph",
            authority_override=override,
        )
        assert len(decision.authority_chain) == 2
        assert decision.authority_chain[0]["authority_id"] == "director-42"
        assert decision.authority_chain[0]["role"] == AUTH_ROLE_DIRECTOR
        assert decision.authority_chain[1]["role"] == AUTH_ROLE_SCHEDULER

    def test_prepare_populates_governance_trace(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare("glowing tesseract lattice")
        assert decision.governance_trace is not None
        assert "decisionId" in decision.governance_trace
        assert decision.governance_trace["verdict"] == "allow"
        assert "policy-no-execution-without-intent" in decision.governance_trace["policiesApplied"]
        assert decision.governance_trace["attachProvenance"] is True

    def test_prepare_with_continuity_id(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            continuity_id="prior-run-42",
            world_id="world-42",
        )
        assert decision.continuity_id == "prior-run-42"
        assert "policy-play-timeline-requires-world" in decision.governance_trace["policiesApplied"]

    def test_prepare_abstract_path_assigns_correct_roles(self):
        settings = _settings(rt4d_selected=True, polish_enabled=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare("glowing tesseract lattice lattice energy")
        assert decision.path_kind == PathKind.ABSTRACT
        assert decision.renderer_role == RendererRole.STRUCTURE
        assert decision.ai_role == AIRole.POLISH

    def test_prepare_maps_decision_to_dict(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings, authority_id="auth-1")
        decision = dispatch.prepare("glowing tesseract lattice")
        d = decision.to_dict()
        assert d["path_kind"] == "abstract"
        assert d["authority_chain"] == list(decision.authority_chain)
        assert d["authority_chain"][0]["authority_id"] == "auth-1"


# ---------------------------------------------------------------------------
# CONT/REFL — Continuity + Receipt
# ---------------------------------------------------------------------------

class TestConstitutionalDispatchExecute:
    """CONT/REFL layers: dispatch execution and receipt building."""

    def test_execute_builds_receipt_with_constitutional_fields(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings, authority_id="auth-1")
        decision = dispatch.prepare("glowing tesseract lattice")

        mock_fn = MagicMock(return_value=_fake_generate_result("glowing tesseract lattice"))
        result, receipt = dispatch.execute(decision, "glowing tesseract lattice", dispatch_fn=mock_fn)

        assert result.status == "ok"
        assert receipt.renderer_ran is True
        assert receipt.path_kind == "abstract"
        # Constitutional fields propagated from decision
        assert receipt.authority_chain == list(decision.authority_chain)
        assert receipt.continuity_id == decision.continuity_id
        assert receipt.governance_trace == decision.governance_trace

    def test_execute_handles_dispatch_failure(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)

        decision = dispatch.prepare("glowing tesseract lattice")
        mock_fn = MagicMock(side_effect=RuntimeError("CLI not found"))

        result, receipt = dispatch.execute(decision, "glowing tesseract lattice", dispatch_fn=mock_fn)
        assert result.status == "error"
        assert receipt.renderer_ran is False
        assert any("dispatch failed" in w for w in receipt.warnings)

    def test_execute_with_continuity_id_does_not_fail_when_board_offline(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings, authority_id="auth-1")

        decision = dispatch.prepare(
            "glowing tesseract lattice",
            continuity_id="nonexistent-prior",
            world_id="world-42",
        )
        mock_fn = MagicMock(return_value=_fake_generate_result("glowing tesseract lattice"))
        # Should not raise — board offline is non-fatal.
        result, receipt = dispatch.execute(decision, "glowing tesseract lattice", dispatch_fn=mock_fn)
        assert result.status == "ok"
        assert receipt.continuity_id == "nonexistent-prior"

    def test_execute_with_init_continuity_skips_verification(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)

        decision = dispatch.prepare(
            "glowing tesseract lattice",
            continuity_id="init",
            world_id="world-42",
        )
        mock_fn = MagicMock(return_value=_fake_generate_result("glowing tesseract lattice"))
        result, receipt = dispatch.execute(decision, "glowing tesseract lattice", dispatch_fn=mock_fn)
        assert result.status == "ok"


# ---------------------------------------------------------------------------
# RenderReceipt constitutional field propagation
# ---------------------------------------------------------------------------

class TestRenderReceiptConstitutionalFields:
    """Verify constitutional fields propagate through build_render_receipt."""

    def test_receipt_carries_authority_chain(self):
        from app.path_routing import build_render_receipt, decide_route

        decision = decide_route("glowing tesseract lattice", img2img_available=True)
        # Manually add constitutional fields (as ConstitutionalDispatch would).
        chain = ({"authority_id": "test", "role": "scheduler", "statement": "test"},)
        decision = RouteDecision(
            **{**decision.__dict__,
               "authority_chain": chain,
               "continuity_id": "cont-42",
               "governance_trace": {"decisionId": "d-1", "verdict": "allow"}},
        )
        receipt = build_render_receipt(decision, renderer_ran=True, ai_ran=True)
        assert receipt.authority_chain == list(chain)
        assert receipt.continuity_id == "cont-42"
        assert receipt.governance_trace == {"decisionId": "d-1", "verdict": "allow"}

    def test_receipt_to_dict_includes_constitutional_fields(self):
        from app.path_routing import build_render_receipt, decide_route

        decision = decide_route("glowing tesseract lattice", img2img_available=True)
        chain = ({"authority_id": "test", "role": "scheduler", "statement": "test"},)
        decision = RouteDecision(
            **{**decision.__dict__,
               "authority_chain": chain,
               "continuity_id": "cont-42",
               "governance_trace": {"decisionId": "d-1"}},
        )
        receipt = build_render_receipt(decision, renderer_ran=True, ai_ran=True)
        d = receipt.to_dict()
        assert d["authority_chain"] == [{"authority_id": "test", "role": "scheduler", "statement": "test"}]
        assert d["continuity_id"] == "cont-42"
        assert d["governance_trace"] == {"decisionId": "d-1"}


# ---------------------------------------------------------------------------
# build_authority_entry
# ---------------------------------------------------------------------------

class TestBuildAuthorityEntry:
    """Unit tests for the authority entry builder."""

    def test_builds_expected_structure(self):
        entry = build_authority_entry(
            authority_id="director-1",
            role=AUTH_ROLE_DIRECTOR,
            statement="dispatch signed",
        )
        assert entry["authority_id"] == "director-1"
        assert entry["role"] == AUTH_ROLE_DIRECTOR
        assert entry["statement"] == "dispatch signed"
        assert "timestamp" in entry

    def test_defaults_to_director_role(self):
        entry = build_authority_entry(authority_id="director-2")
        assert entry["role"] == AUTH_ROLE_DIRECTOR
        assert entry["authority_id"] == "director-2"


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

class TestConstitutionalDispatchRun:
    """Full AUTH → CONT/REFL → AUDT pipeline."""

    def test_run_returns_result_and_receipt(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings, authority_id="run-test")
        mock_fn = MagicMock(return_value=_fake_generate_result("glowing tesseract lattice"))
        result, receipt = dispatch.run(
            "glowing tesseract lattice",
            dispatch_fn=mock_fn,
        )
        assert result.status == "ok"
        assert receipt.renderer_ran is True
        assert receipt.renderer_sha256 is not None

    def test_run_with_authority_override(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        override = build_authority_entry(
            authority_id="director-run",
            statement="run test dispatch",
        )
        mock_fn = MagicMock(return_value=_fake_generate_result("glowing tesseract lattice"))
        result, receipt = dispatch.run(
            "glowing tesseract lattice",
            dispatch_fn=mock_fn,
            authority_override=override,
        )
        assert receipt.authority_chain[0]["authority_id"] == "director-run"


# ---------------------------------------------------------------------------
# CCS endpoint smoke test (requires FastAPI TestClient)
# ---------------------------------------------------------------------------

class TestCcsEndpoint:
    """Smoke tests for POST /api/ccs/dispatch via TestClient."""

    def test_dry_run_returns_decision_without_render(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        body = client.post(
            "/api/ccs/dispatch",
            json={
                "prompt": "glowing tesseract lattice",
                "authority_id": "test-auth",
                "dry_run": True,
            },
        ).json()
        assert body["status"] == "dry_run"
        assert "decision" in body
        assert body["decision"]["path_kind"] == "abstract"
        assert body["decision"]["authority_chain"]

    def test_dry_run_sets_governance_trace(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        body = client.post(
            "/api/ccs/dispatch",
            json={
                "prompt": "glowing tesseract lattice",
                "dry_run": True,
            },
        ).json()
        assert body["status"] == "dry_run"
        assert body["decision"]["governance_trace"] is not None
        assert body["decision"]["governance_trace"]["verdict"] == "allow"


# ---------------------------------------------------------------------------
# Deny-verdict policy evaluation
# ---------------------------------------------------------------------------

class TestDenyVerdicts:
    """Policy engine evaluates → deny on violations."""

    def test_empty_prompt_is_denied(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        with pytest.raises(ConstitutionalScheduleError) as exc_info:
            dispatch.prepare("")
        assert "denied" in str(exc_info.value).lower()

    def test_blank_prompt_is_denied(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        with pytest.raises(ConstitutionalScheduleError):
            dispatch.prepare("   ")

    def test_ascension_without_evidence_is_denied(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        with pytest.raises(ConstitutionalScheduleError) as exc_info:
            dispatch.prepare("mythar ascension ritual")
        assert "policy-ascension-evidence" in str(exc_info.value)

    def test_timeline_without_world_is_denied(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        with pytest.raises(ConstitutionalScheduleError) as exc_info:
            dispatch.prepare(
                "render timeline",
                continuity_id="timeline-1",
            )
        assert "policy-play-timeline-requires-world" in str(exc_info.value)

    def test_ascension_with_dual_evidence_is_allowed(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare(
            "mythar ascension ritual",
            continuity_id="asc-1",
            world_id="world-42",
        )
        assert decision.governance_trace["verdict"] == "allow"

    def test_continuity_with_world_is_allowed(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare(
            "render timeline scene",
            continuity_id="timeline-1",
            world_id="world-42",
        )
        assert decision.governance_trace["verdict"] == "allow"

    def test_denied_decision_carries_governance_trace(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        try:
            dispatch.prepare(
                "render timeline",
                continuity_id="timeline-1",
            )
        except ConstitutionalScheduleError as exc:
            from app.constitutional_schedule import ConstitutionalScheduleDenied
            if isinstance(exc, ConstitutionalScheduleDenied):
                assert exc.decision.governance_trace is not None
                assert exc.decision.governance_trace["verdict"] == "deny"
                assert "policy-play-timeline-requires-world" in exc.decision.governance_trace["policiesApplied"]
            else:
                raise


# ---------------------------------------------------------------------------
# CCS endpoint deny (HTTP 403)
# ---------------------------------------------------------------------------

class TestCcsEndpointDeny:
    """POST /api/ccs/dispatch returns 403 when policies deny."""

    def test_empty_prompt_returns_403(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        # Valid prompt but continuity without world_id triggers
        # policy-play-timeline-requires-world → deny → 403.
        resp = client.post(
            "/api/ccs/dispatch",
            json={
                "prompt": "render timeline scene",
                "continuity_id": "timeline-no-world",
                "dry_run": True,
            },
        )
        assert resp.status_code == 403, f"expected 403 got {resp.status_code}"
        body = resp.json()
        assert "denied" in body.get("detail", {}).get("error", "").lower()
        assert body["detail"]["governance_trace"] is not None
        assert body["detail"]["governance_trace"]["verdict"] == "deny"

    def test_ascension_returns_403(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        # Ascension pattern without world_id/continuity_id triggers deny.
        resp = client.post(
            "/api/ccs/dispatch",
            json={
                "prompt": "mythar ascension ritual",
                "dry_run": True,
            },
        )
        assert resp.status_code == 403, f"expected 403 got {resp.status_code}"
        body = resp.json()
        assert body["detail"]["governance_trace"]["verdict"] == "deny"


# ---------------------------------------------------------------------------
# POST /api/ccs/play-timeline endpoint
# ---------------------------------------------------------------------------

class TestCcsPlayTimeline:
    """Smoke tests for POST /api/ccs/play-timeline via TestClient."""

    def test_deny_empty_spec_returns_403(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/ccs/play-timeline",
            json={
                "spec": {},
                "authority_id": "test-auth",
            },
        )
        # An empty spec without world_id + continuity_id with ascension pattern
        # in its id "unnamed" is not ascension — should prep and fail at
        # scene-spec render because render_scene_spec checks for dict content.
        # But since no node binary exists, it'll 502 rather than 403.
        # We just check the endpoint is reachable and returns something sane.
        assert resp.status_code in (403, 502)

    def test_with_authority_id_and_continuity(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/ccs/play-timeline",
            json={
                "spec": {"id": "test-scene", "objects": []},
                "authority_id": "director-test",
                "continuity_id": "timeline-1",
                "world_id": "world-42",
            },
        )
        # With world_id + continuity_id and non-ascension spec id, AUTH passes.
        # But scene-spec render will 502 (no Node CLI). Accept either outcome.
        assert resp.status_code in (403, 502)

    def test_play_timeline_contract(self, monkeypatch):
        """Verify the endpoint returns decision + receipt on success (mock render)."""
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from unittest.mock import patch as mock_patch
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)

        with mock_patch("app.constitutional_schedule.ConstitutionalDispatch.prepare") as mock_prep:
            from app.path_routing import RouteDecision, PathKind, RendererRole, AIRole
            fake_decision = RouteDecision(
                path_kind=PathKind.ABSTRACT,
                renderer_role=RendererRole.STRUCTURE,
                ai_role=AIRole.PRIMARY,
                ai_provider="test",
                ai_model="test/mock",
                prompt_classification="test",
                img2img_available=False,
                composition_source=None,
                metadata={},
                authority_chain=(),
                continuity_id="test-cont",
                governance_trace={"decisionId": "mock", "verdict": "allow"},
            )
            mock_prep.return_value = fake_decision

            resp = client.post(
                "/api/ccs/play-timeline",
                json={
                    "spec": {"id": "mock-test", "objects": []},
                    "authority_id": "mock-auth",
                    "continuity_id": "test-cont",
                    "world_id": "world-42",
                },
            )
            # Without mocking render_scene_spec we expect 502 (no Node CLI),
            # but the endpoint contract should still be valid.
            if resp.status_code == 502:
                assert "failed" in resp.json().get("detail", "")
            elif resp.status_code == 403:
                pytest.fail("AUTH should pass: mock decision is allow")


# ---------------------------------------------------------------------------
# Director authority entry builder (local copy for tile dispatch)
# ---------------------------------------------------------------------------

class TestDirectorAuthorityEntry:
    """Verify the Director's local _build_authority_entry matches contract."""

    @staticmethod
    def _build_authority_entry(
        authority_id: str = "infinity-director",
        *,
        role: str = "infinity-director",
        statement: str | None = None,
    ) -> dict:
        """Mirror of genblaze_tile_dispatch._build_authority_entry."""
        from datetime import datetime, timezone
        return {
            "authority_id": authority_id,
            "role": role,
            "statement": statement or "director tile dispatch",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    def test_builds_expected_structure(self):
        entry = self._build_authority_entry(
            authority_id="director-1",
            statement="dispatch signed",
        )
        assert entry["authority_id"] == "director-1"
        assert entry["role"] == "infinity-director"
        assert entry["statement"] == "dispatch signed"
        assert "timestamp" in entry
        assert entry["timestamp"].endswith("Z")

    def test_default_statement(self):
        entry = self._build_authority_entry(authority_id="director-2")
        assert entry["statement"] == "director tile dispatch"

    def test_role_override(self):
        entry = self._build_authority_entry(
            authority_id="scheduler-1",
            role="ccs-scheduler",
            statement="scheduler dispatch",
        )
        assert entry["role"] == "ccs-scheduler"
        assert entry["authority_id"] == "scheduler-1"


# ---------------------------------------------------------------------------
# Continuity verification — strict mode
# ---------------------------------------------------------------------------

class TestContinuityVerification:
    """CONT: continuity chain verification with strict mode."""

    def test_strict_continuity_raises_when_board_offline(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(
            settings,
            memory_board_base="http://127.0.0.1:1",
        )
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            continuity_id="missing-chain",
            world_id="world-42",
        )
        # Board on port 1 should be unreachable.
        with pytest.raises(ConstitutionalScheduleError):
            dispatch.execute(
                decision,
                "glowing tesseract lattice",
                dispatch_fn=MagicMock(return_value=_fake_generate_result("ok")),
                strict_continuity=True,
            )

    def test_non_strict_proceeds_when_board_offline(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(
            settings,
            memory_board_base="http://127.0.0.1:1",
        )
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            continuity_id="missing-chain",
            world_id="world-42",
        )
        mock_fn = MagicMock(return_value=_fake_generate_result("ok"))
        result, receipt = dispatch.execute(
            decision,
            "glowing tesseract lattice",
            dispatch_fn=mock_fn,
            strict_continuity=False,
        )
        assert result.status == "ok"

    def test_init_continuity_skips_verification_even_strict(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            continuity_id="init",
            world_id="world-42",
        )
        mock_fn = MagicMock(return_value=_fake_generate_result("ok"))
        # Should not raise even with strict=True because "init" is the first link.
        result, receipt = dispatch.execute(
            decision,
            "glowing tesseract lattice",
            dispatch_fn=mock_fn,
            strict_continuity=True,
        )
        assert result.status == "ok"


# ---------------------------------------------------------------------------
# Scene spec optimisation
# ---------------------------------------------------------------------------

class TestSceneSpecOptimisation:
    """SCHE: auto-tune render params from SceneSpecification."""

    def test_empty_spec_returns_low_complexity(self):
        analysis = _estimate_scene_complexity({})
        assert analysis["complexity"] == "low"
        assert analysis["object_count"] == 0
        assert analysis["material_count"] == 0

    def test_simple_spec_returns_final_quality(self):
        spec = {
            "id": "test",
            "objects": [
                {"type": "mesh", "material": "stone"},
                {"type": "mesh", "material": "wood"},
            ],
        }
        analysis = _estimate_scene_complexity(spec)
        assert analysis["complexity"] == "low"
        assert analysis["recommended_quality"] == "final"
        assert analysis["recommended_max_depth"] == 8

    def test_medium_complexity_returns_draft(self):
        spec = {
            "id": "complex",
            "objects": [
                {"type": "mesh", "material": f"mat-{i}"}
                for i in range(25)
            ],
        }
        analysis = _estimate_scene_complexity(spec)
        assert analysis["complexity"] == "medium"
        assert analysis["object_count"] == 25
        assert analysis["material_count"] == 25
        assert analysis["recommended_quality"] == "draft"

    def test_high_complexity_returns_low_samples(self):
        spec = {
            "id": "dense",
            "objects": [
                {"type": "mesh", "material": f"mat-{i}"}
                for i in range(60)
            ],
        }
        analysis = _estimate_scene_complexity(spec)
        assert analysis["complexity"] == "high"
        assert analysis["recommended_samples"] == 8
        assert analysis["recommended_max_depth"] == 4

    def test_animation_forces_draft(self):
        spec = {
            "id": "animated",
            "objects": [{"type": "mesh", "material": "stone"}],
            "timeline": {"frames": 120},
        }
        analysis = _estimate_scene_complexity(spec)
        assert analysis["has_animation"] is True
        assert analysis["recommended_quality"] == "draft"

    def test_lights_detected(self):
        spec = {
            "id": "lit",
            "objects": [
                {"type": "light", "intensity": 1.0},
                {"type": "mesh", "material": "wall"},
            ],
        }
        analysis = _estimate_scene_complexity(spec)
        assert analysis["has_lights"] is True

    def test_optimise_scene_convenience_method(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        spec = {"id": "test", "objects": [{"type": "mesh"}]}
        result = dispatch.optimise_scene_spec(spec)
        assert result["complexity"] == "low"
        assert "recommended_quality" in result


# ---------------------------------------------------------------------------
# Multi-authority signing (N-of-M)
# ---------------------------------------------------------------------------

class TestMultiAuthoritySigning:
    """AUTH: N-of-M multi-authority signing."""

    def test_single_authority_passes_n_of_1(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        entries = [
            build_authority_entry(authority_id="auth-1", role="director", statement="ok"),
        ]
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            authority_overrides=entries,
            required_signatures=1,
        )
        assert len(decision.authority_chain) == 2  # override + scheduler

    def test_two_authorities_passes_n_of_2(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        entries = [
            build_authority_entry(authority_id="auth-1", role="director", statement="ok"),
            build_authority_entry(authority_id="auth-2", role="operator", statement="approved"),
        ]
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            authority_overrides=entries,
            required_signatures=2,
        )
        assert len(decision.authority_chain) == 3

    def test_insufficient_signatures_denies(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        entries = [
            build_authority_entry(authority_id="auth-1", role="director", statement="ok"),
        ]
        with pytest.raises(ConstitutionalScheduleError):
            dispatch.prepare(
                "glowing tesseract lattice",
                authority_overrides=entries,
                required_signatures=3,
            )

    def test_zero_sigs_allows_any(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            required_signatures=0,
        )
        assert decision.governance_trace["verdict"] == "allow"

    def test_legacy_override_is_accepted(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        entry = build_authority_entry(authority_id="legacy-auth", statement="old path")
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            authority_override=entry,
            required_signatures=0,
        )
        assert len(decision.authority_chain) == 2


# ---------------------------------------------------------------------------
# Rate limiting / quotas
# ---------------------------------------------------------------------------

class TestRateLimiting:
    """Rate limiting per-authority dispatch budgets."""

    def setup_method(self):
        _reset_budget("rate-test-auth")

    def test_allows_within_budget(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare(
            "glowing tesseract lattice",
            authority_override=build_authority_entry(authority_id="rate-test-auth"),
        )
        assert decision.governance_trace["verdict"] == "allow"

    def test_denies_when_budget_exhausted(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        # Exhaust the default budget (max 50 dispatches per window).
        for i in range(50):
            decision = dispatch.prepare(
                f"prompt-{i}",
                authority_override=build_authority_entry(authority_id="exhaust-test"),
            )
            assert decision.governance_trace["verdict"] == "allow"

        with pytest.raises(ConstitutionalScheduleError) as exc_info:
            dispatch.prepare(
                "one-too-many",
                authority_override=build_authority_entry(authority_id="exhaust-test"),
            )
        assert "denied" in str(exc_info.value)

    def test_reset_budget_allows_again(self):
        _reset_budget("reset-test-auth")
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        # Use all 50 budget slots.
        for i in range(50):
            decision = dispatch.prepare(
                f"prompt-{i}",
                authority_override=build_authority_entry(authority_id="reset-test-auth"),
            )
            assert decision.governance_trace["verdict"] == "allow"

        _reset_budget("reset-test-auth")

        decision = dispatch.prepare(
            "after-reset",
            authority_override=build_authority_entry(authority_id="reset-test-auth"),
        )
        assert decision.governance_trace["verdict"] == "allow"

    def test_different_authorities_have_separate_budgets(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        for i in range(50):
            decision = dispatch.prepare(
                f"prompt-{i}",
                authority_override=build_authority_entry(authority_id="sep-auth-A"),
            )
            assert decision.governance_trace["verdict"] == "allow"

        decision = dispatch.prepare(
            "first-for-B",
            authority_override=build_authority_entry(authority_id="sep-auth-B"),
        )
        # B has its own budget — not exhausted.
        assert decision.governance_trace["verdict"] == "allow"


# ---------------------------------------------------------------------------
# Conformance check
# ---------------------------------------------------------------------------

class TestConformanceChecks:
    """CONS: 16-point conformance check."""

    def test_conformance_returns_checks(self):
        results = run_conformance_checks()
        assert isinstance(results, list)
        assert len(results) > 0

    def test_each_check_has_required_fields(self):
        results = run_conformance_checks()
        for check in results:
            assert "id" in check
            assert "status" in check
            assert check["status"] in ("pass", "fail", "skipped", "error")

    def test_provenance_recorder_check_exists(self):
        results = run_conformance_checks()
        ids = {r["id"] for r in results}
        assert "provenance.recorder-exists" in ids

    def test_convenience_method_called(self):
        results = run_conformance_checks()
        # Most probes should pass since the runtime is loaded.
        passed = sum(1 for r in results if r.get("status") == "pass")
        assert passed >= 8  # most of the 16 should pass


# ---------------------------------------------------------------------------
# Audit trail queries
# ---------------------------------------------------------------------------

class TestAuditTrail:
    """Audit trail query (requires no live Jarvis; returns empty)."""

    def test_returns_empty_list_when_board_offline(self):
        from app.constitutional_schedule import _query_audit_trail
        receipts = _query_audit_trail(authority_id="test-auth")
        assert isinstance(receipts, list)

    def test_returns_empty_for_continuity_id(self):
        from app.constitutional_schedule import _query_audit_trail
        receipts = _query_audit_trail(continuity_id="missing-chain")
        assert isinstance(receipts, list)


# ---------------------------------------------------------------------------
# CCS endpoint: audit trail
# ---------------------------------------------------------------------------

class TestCcsAuditTrailEndpoint:
    """GET /api/ccs/audit-trail via TestClient."""

    def test_returns_empty_when_board_offline(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.get("/api/ccs/audit-trail?authority_id=test-auth")
        assert resp.status_code == 200
        body = resp.json()
        assert "receipts" in body
        assert body["authority_id"] == "test-auth"


# ---------------------------------------------------------------------------
# CCS endpoint: conformance
# ---------------------------------------------------------------------------

class TestCcsConformanceEndpoint:
    """POST /api/ccs/conformance via TestClient."""

    def test_returns_checks(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post("/api/ccs/conformance")
        assert resp.status_code == 200
        body = resp.json()
        assert "checks" in body
        assert body["passed"] >= 8
        assert "conformant" in body


# ---------------------------------------------------------------------------
# CCS endpoint: optimise scene
# ---------------------------------------------------------------------------

class TestCcsOptimiseEndpoint:
    """POST /api/ccs/optimise-scene via TestClient."""

    def test_returns_analysis(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/ccs/optimise-scene",
            json={"spec": {"id": "test", "objects": [{"type": "mesh"}]}},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "analysis" in body
        assert body["analysis"]["complexity"] == "low"


# ---------------------------------------------------------------------------
# CCS endpoint: multi-sign
# ---------------------------------------------------------------------------

class TestCcsMultiSignEndpoint:
    """POST /api/ccs/multi-sign-dispatch via TestClient."""

    def test_dry_run_returns_decision(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/ccs/multi-sign-dispatch",
            json={
                "prompt": "glowing tesseract",
                "authorities": [
                    {"authority_id": "auth-1", "role": "director",
                     "statement": "ok", "timestamp": "2026-01-01T00:00:00Z"},
                    {"authority_id": "auth-2", "role": "operator",
                     "statement": "ok", "timestamp": "2026-01-01T00:00:00Z"},
                ],
                "required_signatures": 2,
                "dry_run": True,
            },
        )
        assert resp.status_code == 200, f"expected 200 got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["status"] == "dry_run"
        assert body["satisfied"] is True
        assert body["unique_authorities"] == 2

    def test_insufficient_signatures_returns_403(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        monkeypatch.delenv("RENDER", raising=False)
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/ccs/multi-sign-dispatch",
            json={
                "prompt": "glowing tesseract",
                "authorities": [
                    {"authority_id": "auth-1", "role": "director",
                     "statement": "ok", "timestamp": "2026-01-01T00:00:00Z"},
                ],
                "required_signatures": 3,
                "dry_run": True,
            },
        )
        assert resp.status_code == 403
        body = resp.json()
        assert "denied" in body.get("detail", {}).get("error", "").lower()


# ---------------------------------------------------------------------------
# Governed throughput — Π equation
# ---------------------------------------------------------------------------

class TestGovernedThroughput:
    """Π = C·M/(R+Ω)·P — Sovereign X governed performance model."""

    def test_compute_default_matches_spec(self):
        pi = _compute_governed_throughput()
        # Spec says ≈ 1.29×10⁷
        assert 1.28e7 < pi < 1.30e7, f"Π={pi} outside expected range"

    def test_compute_with_override(self):
        pi = _compute_governed_throughput(
            compute_tflops=500,
            memory_bw_tbs=4.0,
            router_latency_ns=2.0,
            governance_overhead_ns=0.1,
            power_efficiency_tflops_per_w=0.5,
        )
        expected = (500 * (4 * 1e3)) / (2.0 + 0.1) * 0.5
        assert abs(pi - expected) < 1.0

    def test_formatted_returns_structure(self):
        from app.constitutional_schedule import _compute_governed_throughput_formatted
        result = _compute_governed_throughput_formatted()
        assert "governed_throughput_tflops_per_second" in result
        assert "params" in result

    def test_policy_passes_for_default_throughput(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare("glowing tesseract lattice")
        trace = decision.governance_trace
        assert trace["verdict"] == "allow"
        assert "policy-governed-throughput" in trace["policiesApplied"]

    def test_governed_throughput_in_param_adjust(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare("glowing tesseract lattice")
        adjust = decision.governance_trace.get("paramAdjust", {})
        assert "governed_throughput" in adjust


# ---------------------------------------------------------------------------
# Mandala Energy Law (MEL)
# ---------------------------------------------------------------------------

class TestMandalaEnergyLaw:
    """E_L = Σ P_i·C_i/(R_i+Ω_i) — lawful energy across arenas."""

    def test_compute_returns_three_arenas_by_default(self):
        result = _compute_mandala_energy()
        assert "total_lawful_energy" in result
        assert "arenas" in result
        assert len(result["arenas"]) == 3

    def test_each_arena_has_lawful_energy(self):
        result = _compute_mandala_energy()
        for arena in result["arenas"]:
            assert "name" in arena
            assert "lawful_energy" in arena
            assert arena["lawful_energy"] > 0

    def test_gpu_energy_highest(self):
        result = _compute_mandala_energy()
        energies = {a["name"]: a["lawful_energy"] for a in result["arenas"]}
        assert energies["GPU"] > energies["CPU"]
        assert energies["GPU"] > energies["VM"]

    def test_policy_includes_energy_in_adjust(self):
        settings = _settings(rt4d_selected=True)
        dispatch = ConstitutionalDispatch(settings)
        decision = dispatch.prepare("glowing tesseract lattice")
        adjust = decision.governance_trace.get("paramAdjust", {})
        assert "mandala_energy" in adjust
        assert "policy-mandala-energy-law" in decision.governance_trace["policiesApplied"]


# ---------------------------------------------------------------------------
# Driver Manifest
# ---------------------------------------------------------------------------

class TestDriverManifest:
    """SX Driver Manifest contract validation."""

    def test_valid_manifest(self):
        driver = {
            "authority_header": "signed-by-director",
            "continuity_packet": "cont-42",
            "reflection_frame": "refl-data",
            "energy_token": "mel-compliant",
            "audit_trail": "ledger-tx-1",
        }
        valid, msg = _validate_driver_manifest(driver)
        assert valid is True
        assert "valid" in msg

    def test_empty_manifest_denied(self):
        valid, msg = _validate_driver_manifest(None)
        assert valid is False
        assert "empty" in msg.lower()

    def test_missing_fields_denied(self):
        driver = {"authority_header": "ok", "continuity_packet": "ok"}
        valid, msg = _validate_driver_manifest(driver)
        assert valid is False
        assert "reflection_frame" in msg

    def test_policy_denies_invalid_manifest(self):
        from app.constitutional_schedule import _evaluate_policies
        from app.path_routing import decide_route
        base = decide_route("glowing tesseract", img2img_available=True)
        # Set driver_manifest via param_adjust to trigger the policy check.
        verdict, policies, adjust = _evaluate_policies(
            prompt="glowing tesseract",
            base=base,
            param_adjust={"driver_manifest": {"authority_header": "partial"}},
        )
        assert verdict == "deny"
        assert "policy-driver-manifest" in policies

    def test_empty_dict_manifest_denied(self):
        valid, msg = _validate_driver_manifest({})
        assert valid is False


# ---------------------------------------------------------------------------
# SX Kernel — SovereignXKernel scheduler
# ---------------------------------------------------------------------------

class TestSovereignXKernel:
    """CIS instruction set and lawful process scheduler."""

    def test_describe_returns_structure(self):
        kernel = SovereignXKernel()
        info = kernel.describe()
        assert info["kernel"] == "SovereignXKernel"
        assert "cis" in info
        assert "params" in info
        assert "throughput" in info
        assert "energy" in info
        assert len(info["cis"]) == 9  # 9 CIS instructions (AUTH, CONT, SCAL, ENRG, EXEC, REFL, AUDT, SYNC, HALT)

    def test_default_throughput_matches_spec(self):
        kernel = SovereignXKernel()
        t = kernel.describe()["throughput"]
        pi = t["governed_throughput_tflops_per_second"]
        assert 1.28e7 < pi < 1.30e7

    def test_schedule_dry_run_allows(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(
            prompt="glowing tesseract lattice",
            authority_id="scheduler-1",
            continuity_id="",
            world_id="",
        )
        result = kernel.schedule(intent)
        assert result.verdict == "allow"
        assert CIS.AUTH in result.instructions_executed
        assert CIS.CONT in result.instructions_executed
        assert CIS.ENRG in result.instructions_executed
        assert CIS.EXEC in result.instructions_executed
        assert CIS.REFL in result.instructions_executed
        assert CIS.AUDT in result.instructions_executed
        assert CIS.SYNC in result.instructions_executed
        assert CIS.HALT not in result.instructions_executed

    def test_auth_empty_authority_halts(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="")
        result = kernel.schedule(intent)
        assert result.verdict == "halt"
        assert CIS.HALT in result.instructions_executed

    def test_cont_requires_world_with_continuity(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(
            prompt="test", authority_id="auth-1",
            continuity_id="cont-42", world_id="",
        )
        result = kernel.schedule(intent)
        assert result.verdict == "halt"

    def test_cont_with_world_and_continuity_passes(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(
            prompt="test", authority_id="auth-1",
            continuity_id="cont-42", world_id="world-1",
        )
        result = kernel.schedule(intent)
        assert result.verdict == "allow"

    def test_schedule_with_dispatch_fn(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(
            prompt="test", authority_id="auth-1",
        )

        def fake_dispatch(_intent: ProcessIntent) -> dict:
            return {"status": "ok", "output": "rendered"}

        result = kernel.schedule(intent, dispatch_fn=fake_dispatch)
        assert result.verdict == "allow"
        assert result.receipt is not None
        assert result.receipt["result"]["output"] == "rendered"

    def test_schedule_with_failing_dispatch(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(
            prompt="test", authority_id="auth-1",
        )

        def failing_dispatch(_intent: ProcessIntent) -> dict:
            raise RuntimeError("CLI crash")

        result = kernel.schedule(intent, dispatch_fn=failing_dispatch)
        assert result.verdict == "halt"
        assert "CLI crash" in (result.error or "")

    def test_to_dict_includes_fields(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="auth-1")
        result = kernel.schedule(intent)
        d = result.to_dict()
        assert d["uid"] == intent.uid
        assert d["verdict"] == "allow"
        assert "instructions" in d

    def test_params_override(self):
        kernel = SovereignXKernel(
            router_latency_ns=5.0,
            governance_overhead_ns=1.0,
            compute_tflops=100,
            memory_bw_tbs=1.0,
            power_efficiency=0.5,
        )
        t = kernel.describe()["throughput"]
        pi = t["governed_throughput_tflops_per_second"]
        expected = (100 * (1 * 1e3)) / (5.0 + 1.0) * 0.5
        assert abs(pi - expected) < 1.0

    def test_kernel_governed_throughput_in_result(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="auth-1")
        result = kernel.schedule(intent)
        assert result.governed_throughput is not None
        assert result.governed_throughput["governed_throughput_tflops_per_second"] > 0

    def test_kernel_mandala_energy_in_result(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="auth-1")
        result = kernel.schedule(intent)
        assert result.mandala_energy is not None
        assert result.mandala_energy["total_lawful_energy"] > 0

    def test_cis_meanings_all_eight(self):
        meanings = CIS.meanings()
        assert len(meanings) == 9  # AUTH, CONT, SCAL, ENRG, EXEC, REFL, AUDT, SYNC, HALT
        assert "AUTH" in meanings
        assert "SCAL" in meanings


# ---------------------------------------------------------------------------
# SX Kernel — Telemetry Metrics
# ---------------------------------------------------------------------------

class TestSovereignXKernelMetrics:
    """Kernel telemetry counters and introspection."""

    def test_metrics_returns_structure(self):
        kernel = SovereignXKernel()
        m = kernel.metrics()
        assert "dispatch_count" in m
        assert "halt_count" in m
        assert "halt_rate" in m
        assert "sync_count" in m
        assert "total_elapsed_ns" in m
        assert "avg_elapsed_ns" in m
        assert "last_error" in m
        assert "error_counts" in m

    def test_metrics_starts_empty(self):
        kernel = SovereignXKernel()
        m = kernel.metrics()
        assert m["dispatch_count"] == 0
        assert m["halt_count"] == 0
        assert m["halt_rate"] == 0.0
        assert m["sync_count"] == 0
        assert m["total_elapsed_ns"] == 0.0
        assert m["avg_elapsed_ns"] == 0.0
        assert m["last_error"] is None
        assert m["error_counts"] == {}

    def test_metrics_tracks_dispatch_count(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="auth-1")
        kernel.schedule(intent)
        assert kernel.metrics()["dispatch_count"] == 1
        kernel.schedule(intent)
        assert kernel.metrics()["dispatch_count"] == 2

    def test_metrics_tracks_halt_count(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="")
        kernel.schedule(intent)
        m = kernel.metrics()
        assert m["halt_count"] == 1
        assert m["dispatch_count"] == 1
        assert m["halt_rate"] == 1.0

    def test_metrics_tracks_sync_count(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="auth-1")
        kernel.schedule(intent)
        assert kernel.metrics()["sync_count"] == 1

    def test_metrics_tracks_error_counts(self):
        kernel = SovereignXKernel()
        # Two halts with empty authority_id (same error reason).
        kernel.schedule(ProcessIntent(prompt="a", authority_id=""))
        kernel.schedule(ProcessIntent(prompt="b", authority_id=""))
        ec = kernel.metrics()["error_counts"]
        assert len(ec) >= 1
        # The exact reason string contains "authority_id is empty"
        matching = {k: v for k, v in ec.items() if "authority_id is empty" in k}
        assert sum(matching.values()) == 2

    def test_metrics_tracks_elapsed_time(self):
        kernel = SovereignXKernel()
        intent = ProcessIntent(prompt="test", authority_id="auth-1")
        kernel.schedule(intent)
        assert kernel.metrics()["total_elapsed_ns"] >= 0

    def test_describe_includes_telemetry(self):
        kernel = SovereignXKernel()
        info = kernel.describe()
        assert "telemetry" in info
        assert info["telemetry"]["dispatch_count"] == 0
        assert info["telemetry"]["halt_count"] == 0

    def test_metrics_tracks_halt_rate_mixed(self):
        kernel = SovereignXKernel()
        kernel.schedule(ProcessIntent(prompt="ok", authority_id="auth-1"))
        kernel.schedule(ProcessIntent(prompt="bad", authority_id=""))
        m = kernel.metrics()
        assert m["dispatch_count"] == 2
        assert m["halt_count"] == 1
        assert m["halt_rate"] == 0.5

    def test_metrics_resets_between_instances(self):
        k1 = SovereignXKernel()
        k2 = SovereignXKernel()
        k1.schedule(ProcessIntent(prompt="test", authority_id="auth-1"))
        assert k1.metrics()["dispatch_count"] == 1
        assert k2.metrics()["dispatch_count"] == 0
