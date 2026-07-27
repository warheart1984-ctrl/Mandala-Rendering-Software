"""Unit tests for path_routing — classifier, router, and receipt honesty."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict

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


# ---------------------------------------------------------------------------
# classify_prompt
# ---------------------------------------------------------------------------

class TestClassifyPrompt:
    """Keyword-based prompt classifier tests."""

    def test_empty_prompt_returns_hybrid(self):
        assert classify_prompt("") == PathKind.HYBRID
        assert classify_prompt(None) == PathKind.HYBRID  # type: ignore[arg-type]

    def test_tesseract_is_abstract(self):
        assert classify_prompt("a glowing tesseract lattice") == PathKind.ABSTRACT

    def test_hypercube_is_abstract(self):
        assert classify_prompt("4d hypercube rotating") == PathKind.ABSTRACT

    def test_neural_lattice_is_abstract(self):
        assert classify_prompt("neural lattice energy core") == PathKind.ABSTRACT

    def test_mandala_is_abstract(self):
        assert classify_prompt("radial mandala glyph pattern") == PathKind.ABSTRACT

    def test_torus_ring_is_abstract(self):
        assert classify_prompt("torus ring orbit halo") == PathKind.ABSTRACT

    def test_lattice_grid_is_abstract(self):
        assert classify_prompt("grid lattice matrix array") == PathKind.ABSTRACT

    def test_orbital_cluster_is_abstract(self):
        assert classify_prompt("cluster galaxy constellation nebula") == PathKind.ABSTRACT

    def test_portrait_face_is_portrait(self):
        assert classify_prompt(
            "portrait of a man with face and hair and skin"
        ) == PathKind.PORTRAIT

    def test_person_with_attributes_is_portrait(self):
        assert classify_prompt(
            "person with face skin eyes lips smile"
        ) == PathKind.PORTRAIT

    def test_photograph_is_portrait(self):
        assert classify_prompt(
            "photograph portrait of a woman face hair eyes"
        ) == PathKind.PORTRAIT

    def test_weak_portrait_signal_is_hybrid(self):
        # Only 1 portrait keyword — not enough for PORTRAIT.
        assert classify_prompt("a face in the clouds") == PathKind.HYBRID

    def test_weak_abstract_signal_is_hybrid(self):
        # Only 1 abstract keyword — not enough for ABSTRACT.
        assert classify_prompt("a single sphere") == PathKind.HYBRID

    def test_mixed_portrait_and_abstract_is_hybrid(self):
        # Equal portrait and abstract hits (2 each) → neither wins → HYBRID.
        assert classify_prompt(
            "tesseract lattice with a face and skin"
        ) == PathKind.HYBRID

    def test_ai_direct_painting_is_direct_ai(self):
        assert classify_prompt(
            "oil painting with studio lighting and bokeh"
        ) == PathKind.DIRECT_AI

    def test_ai_direct_sketch_is_direct_ai(self):
        assert classify_prompt(
            "digital art sketch illustration high resolution"
        ) == PathKind.DIRECT_AI

    def test_generic_prompt_is_hybrid(self):
        assert classify_prompt("something cool") == PathKind.HYBRID

    def test_abstract_with_ai_direct_is_abstract(self):
        # Abstract keywords win when they dominate.
        assert classify_prompt(
            "tesseract lattice neon electric glow abstract"
        ) == PathKind.ABSTRACT


# ---------------------------------------------------------------------------
# decide_route
# ---------------------------------------------------------------------------

class TestDecideRoute:
    """Route decision logic tests."""

    def test_abstract_with_img2img(self):
        d = decide_route(
            "tesseract lattice neural lattice",
            img2img_available=True,
            img2img_provider="nim-flux",
            img2img_model="flux.1-schnell",
        )
        assert d.path_kind == PathKind.ABSTRACT
        assert d.renderer_role == RendererRole.STRUCTURE
        assert d.ai_role == AIRole.POLISH
        assert d.ai_provider == "nim-flux"
        assert d.ai_model == "flux.1-schnell"
        assert d.img2img_available is True
        assert d.composition_source == "rt4d-structure"

    def test_abstract_without_img2img(self):
        d = decide_route(
            "tesseract lattice neural lattice",
            img2img_available=False,
            rt4d_enabled=True,
        )
        assert d.path_kind == PathKind.ABSTRACT
        assert d.renderer_role == RendererRole.PRIMARY
        assert d.ai_role == AIRole.SKIPPED
        assert d.ai_provider is None

    def test_abstract_with_rt4d_disabled(self):
        d = decide_route(
            "tesseract lattice neural lattice",
            img2img_available=True,
            rt4d_enabled=False,
        )
        assert d.path_kind == PathKind.ABSTRACT
        assert d.renderer_role == RendererRole.SKIPPED
        assert d.ai_role == AIRole.PRIMARY

    def test_portrait_with_img2img(self):
        d = decide_route(
            "portrait of a face with skin hair eyes lips smile",
            img2img_available=True,
            img2img_provider="fal-flux",
            img2img_model="flux.1-dev",
        )
        assert d.path_kind == PathKind.PORTRAIT
        assert d.renderer_role == RendererRole.SKIPPED
        assert d.ai_role == AIRole.PRIMARY
        assert d.ai_provider == "fal-flux"

    def test_portrait_without_img2img_falls_to_hybrid(self):
        d = decide_route(
            "portrait of a face with skin hair eyes lips smile",
            img2img_available=False,
        )
        assert d.path_kind == PathKind.PORTRAIT
        assert d.renderer_role == RendererRole.SKIPPED
        assert d.ai_role == AIRole.PRIMARY
        assert d.ai_provider is None
        assert "no img2img" in d.prompt_classification.lower()

    def test_direct_ai(self):
        d = decide_route(
            "oil painting studio lighting bokeh",
            img2img_available=True,
            img2img_provider="nim-flux",
        )
        assert d.path_kind == PathKind.DIRECT_AI
        assert d.renderer_role == RendererRole.SKIPPED
        assert d.ai_role == AIRole.PRIMARY

    def test_hybrid_with_both(self):
        d = decide_route(
            "something cool",
            img2img_available=True,
            rt4d_enabled=True,
        )
        assert d.path_kind == PathKind.HYBRID
        assert d.renderer_role == RendererRole.STRUCTURE
        assert d.ai_role == AIRole.POLISH

    def test_hybrid_with_rt4d_only(self):
        d = decide_route(
            "something cool",
            img2img_available=False,
            rt4d_enabled=True,
        )
        assert d.path_kind == PathKind.HYBRID
        assert d.renderer_role == RendererRole.PRIMARY
        assert d.ai_role == AIRole.SKIPPED

    def test_to_dict_serializes_enums(self):
        d = decide_route("tesseract lattice", img2img_available=True)
        dd = d.to_dict()
        assert dd["path_kind"] == "abstract"
        assert dd["renderer_role"] == "structure"
        assert dd["ai_role"] == "polish"


# ---------------------------------------------------------------------------
# RenderReceipt
# ---------------------------------------------------------------------------

class TestRenderReceipt:
    """Receipt honesty and validation tests."""

    def _make_decision(self, **overrides) -> RouteDecision:
        defaults = dict(
            path_kind=PathKind.ABSTRACT,
            renderer_role=RendererRole.STRUCTURE,
            ai_role=AIRole.POLISH,
            ai_provider="nim-flux",
            ai_model="flux.1-schnell",
            prompt_classification="test",
            img2img_available=True,
        )
        defaults.update(overrides)
        return RouteDecision(**defaults)

    def test_honest_receipt_passes_validation(self):
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            renderer_ran=True,
            renderer_sha256="abc123",
            renderer_render_time_ms=150.0,
            ai_ran=True,
            ai_sha256="def456",
            ai_render_time_ms=200.0,
            composition_preserved=True,
        )
        violations = receipt.validate_honesty()
        assert violations == [], f"Unexpected violations: {violations}"

    def test_dishonest_renderer_claim_fails(self):
        """Claiming renderer output when renderer didn't run."""
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            renderer_ran=False,
            renderer_sha256="abc123",  # dishonest
        )
        violations = receipt.validate_honesty()
        assert any("renderer_sha256" in v for v in violations)

    def test_dishonest_ai_claim_fails(self):
        """Claiming AI output when AI didn't run."""
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            ai_ran=False,
            ai_sha256="def456",  # dishonest
        )
        violations = receipt.validate_honesty()
        assert any("ai_sha256" in v for v in violations)

    def test_composition_preserved_requires_both(self):
        """composition_preserved requires both renderer and AI to have run."""
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            renderer_ran=True,
            ai_ran=False,
            composition_preserved=True,  # dishonest — AI didn't run
        )
        violations = receipt.validate_honesty()
        assert any("composition_preserved" in v for v in violations)

    def test_hybrid_empty_note_fails(self):
        """Hybrid paths must have a note documenting both contributions."""
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            renderer_ran=True,
            ai_ran=True,
        )
        # Override note to empty after construction to bypass build logic.
        receipt.note = ""
        violations = receipt.validate_honesty()
        assert any("empty note" in v for v in violations)

    def test_skipped_renderer_no_violation(self):
        """Renderer skipped with no renderer fields — clean."""
        decision = self._make_decision(
            renderer_role=RendererRole.SKIPPED,
            ai_role=AIRole.PRIMARY,
        )
        receipt = build_render_receipt(
            decision,
            renderer_ran=False,
            ai_ran=True,
            ai_sha256="abc",
        )
        violations = receipt.validate_honesty()
        assert violations == [], f"Unexpected violations: {violations}"

    def test_to_manifest_kind_abstract_hybrid(self):
        decision = self._make_decision()
        receipt = build_render_receipt(decision, renderer_ran=True, ai_ran=True)
        assert receipt.to_manifest_kind() == "hybrid-abstract-render"

    def test_to_manifest_kind_mrs_only(self):
        decision = self._make_decision(
            ai_role=AIRole.SKIPPED,
            ai_provider=None,
            ai_model=None,
        )
        receipt = build_render_receipt(decision, renderer_ran=True, ai_ran=False)
        assert receipt.to_manifest_kind() == "deterministic-procedural-4d-render"

    def test_to_manifest_kind_ai_only(self):
        decision = self._make_decision(
            renderer_role=RendererRole.SKIPPED,
        )
        receipt = build_render_receipt(decision, renderer_ran=False, ai_ran=True)
        assert receipt.to_manifest_kind() == "ai-only-render"

    def test_to_dict_includes_all_fields(self):
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            renderer_ran=True,
            renderer_sha256="abc",
            ai_ran=True,
            ai_sha256="def",
            composition_preserved=True,
            run_id="run-123",
            warnings=["test warning"],
        )
        d = receipt.to_dict()
        assert d["path_kind"] == "abstract"
        assert d["renderer_role"] == "structure"
        assert d["ai_role"] == "polish"
        assert d["renderer_ran"] is True
        assert d["renderer_sha256"] == "abc"
        assert d["ai_ran"] is True
        assert d["ai_sha256"] == "def"
        assert d["composition_preserved"] is True
        assert d["run_id"] == "run-123"
        assert d["warnings"] == ["test warning"]

    def test_receipt_json_serializable(self):
        """Receipt must be JSON-serializable for manifest storage."""
        decision = self._make_decision()
        receipt = build_render_receipt(
            decision,
            renderer_ran=True,
            ai_ran=True,
            composition_preserved=True,
        )
        json_str = json.dumps(receipt.to_dict(), indent=2)
        assert len(json_str) > 0
        # Verify round-trip.
        restored = json.loads(json_str)
        assert restored["path_kind"] == "abstract"
