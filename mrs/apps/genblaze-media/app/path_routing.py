"""Path routing schema for the MRS → AI polish pipeline.

Drive-G-1 honesty:
    Every render receipt must accurately declare which system (MRS renderer vs
    AI provider) produced which part of the final image.  No receipt may claim
    "MRS rendered the face" when MRS only provided layout cues, and no receipt
    may omit the AI contribution when img2img polish was applied.

Pipeline overview:
    Prompt  →  classify_prompt()  →  PathKind
           →  decide_route()      →  RouteDecision  (who does what)
           →  execute route       →  RenderReceipt  (what actually happened)

The RouteDecision and RenderReceipt are the honesty contract.  They are
included in the manifest and stored alongside the output PNG so that any
downstream consumer can verify what the renderer contributed vs what the
AI provider contributed.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PathKind(str, Enum):
    """Classifies the rendering path chosen for a prompt.

    The classifier inspects the prompt text and selects the path that
    honestly represents what each system (MRS renderer, AI provider)
    contributes to the final image.
    """

    ABSTRACT = "abstract"
    """RT4D lays 4D structure (lattice, orb, tesseract); AI polishes the look.

    RT4D genuinely renders geometry.  The AI refines materials, lighting,
    atmosphere.  Both contributions are real and documented.
    """

    PORTRAIT = "portrait"
    """AI owns face/skin/hair; MRS geometry is skipped or layout-only.

    For photoreal humans, animals, or subjects where RT4D procedural
    primitives cannot represent the subject.  MRS may provide composition
    cues but does not render the final pixels of the subject.
    """

    HYBRID = "hybrid"
    """Both MRS and AI contribute meaningfully; receipt documents each role.

    Ambiguous prompts where both systems contribute.  The receipt must
    specify exactly what each system did.
    """

    DIRECT_AI = "direct-ai"
    """AI only — no MRS involvement.

    Pure text-to-image or image-to-image with no RT4D structure pass.
    Used when the prompt is explicitly AI-only or when MRS is disabled.
    """

    DIRECT_MRS = "direct-mrs"
    """MRS only — no AI involvement.

    Pure RT4D deterministic render with no AI polish.  Used when img2img
    is disabled or when the prompt explicitly requests MRS-only output.
    """


class RendererRole(str, Enum):
    """What the MRS renderer contributed to the final image."""

    STRUCTURE = "structure"
    """RT4D provided genuine 4D geometry (lattice, orb, tesseract) that the
    AI used as a structural base for refinement.  The rendered pixels
    informed the AI's composition and lighting.
    """

    LAYOUT = "layout"
    """RT4D provided composition/layout cues (camera angle, object placement)
    but not the final subject pixels.  The AI replaced the RT4D geometry
    with its own interpretation while preserving the layout.
    """

    SKIPPED = "skipped"
    """RT4D was not involved in producing this image.

    The renderer did not run.  No RT4D pixels are in the output.
    """

    PRIMARY = "primary"
    """RT4D produced the final image with no AI involvement.

    The rendered pixels ARE the final output.  No AI polish was applied.
    """


class AIRole(str, Enum):
    """What the AI provider contributed to the final image."""

    POLISH = "polish"
    """AI enhanced/refined an RT4D render.

    The AI received the RT4D output and improved materials, lighting,
    atmosphere, or visual quality while preserving the 4D structure.
    """

    PRIMARY = "primary"
    """AI produced the main image.

    The AI generated the final pixels.  MRS may have provided layout
    cues but the AI owns the visual output.
    """

    SKIPPED = "skipped"
    """AI was not involved in producing this image.

    No AI provider was called.  The output is purely from RT4D.
    """

    COMPOSITION = "composition"
    """AI provided composition/depth/pose cues for RT4D to render.

    The AI analyzed a reference image and produced structural guidance
    (depth map, pose, layout) that RT4D used for its render.
    """


# ---------------------------------------------------------------------------
# Prompt classification keywords
# ---------------------------------------------------------------------------

# Portrait / photoreal subject keywords — when these dominate, MRS cannot
# meaningfully represent the subject with procedural primitives.
_PORTRAIT_WORDS = re.compile(
    r"\b("
    r"face|faces|facial|portrait|selfie|person|people|man|woman|child|baby"
    r"|boy|girl|his|her|them|couple|family|wedding|bride|groom"
    r"|skin|hair|eyes|lips|smile|expression|pose|body"
    r"|photograph|photo|photoreal|realistic|cinematic|headshot"
    r"|actor|actress|model|celebrity|king|queen|prince|princess"
    r"|warrior|knight|samurai|ninja|viking|soldier"
    r")\b",
    re.IGNORECASE,
)

# Abstract / RT4D-structure keywords — when these dominate, RT4D can
# meaningfully render geometry that the AI can polish.
_ABSTRACT_WORDS = re.compile(
    r"\b("
    r"tesseract|hypercube|4d|four[- ]?dimension|8-cell"
    r"|lattice|neural[- ]?lattice|mandala|glyph|glyphs"
    r"|orbital|cluster|constellation|nebula|galaxy"
    r"|torus|ring|halo|orbit|donut"
    r"|sphere|orb|orbital|planet|singularity|core"
    r"|grid|matrix|array|mesh|net|web"
    r"|abstract|geometric|geometry|mathematical|fractal"
    r"|sci[- ]?fi|cyberpunk|neon|electric|glow|glowing"
    r"|energy[- ]?core|sovereign|constitutional"
    r")\b",
    re.IGNORECASE,
)

# AI-direct keywords — explicitly requesting AI generation, no MRS.
_AI_DIRECT_WORDS = re.compile(
    r"\b("
    r"paint|painting|oil|watercolor|canvas|brush"
    r"|sketch|drawing|illustration|digital[- ]?art"
    r"|photorealistic|hyperrealistic|8k|4k|high[- ]?resolution"
    r"|studio[- ]?lighting|bokeh|depth[- ]?of[- ]?field"
    r")\b",
    re.IGNORECASE,
)


def classify_prompt(prompt: str) -> PathKind:
    """Classify a prompt into a PathKind based on keyword analysis.

    This is a rule-based classifier.  It is intentionally conservative:
    when signals are mixed or weak, it returns HYBRID so that the receipt
    honestly documents both contributions.

    Classification rules:
    1. If portrait keywords dominate (>= 3 matches) → PORTRAIT
    2. If abstract keywords dominate (>= 3 matches) → ABSTRACT
    3. If AI-direct keywords dominate (>= 2 matches) → DIRECT_AI
    4. If both portrait and abstract match → HYBRID
    5. If no strong signal → HYBRID (conservative default)

    The thresholds are deliberately high to avoid misclassification.
    A misclassified PORTRAIT (claiming MRS rendered a face) is worse
    than a misclassified HYBRID (being overly honest).
    """
    text = (prompt or "").strip()
    if not text:
        return PathKind.HYBRID

    portrait_hits = len(_PORTRAIT_WORDS.findall(text))
    abstract_hits = len(_ABSTRACT_WORDS.findall(text))
    ai_direct_hits = len(_AI_DIRECT_WORDS.findall(text))

    # Strong portrait signal: MRS cannot represent these subjects.
    if portrait_hits >= 2 and portrait_hits > abstract_hits:
        return PathKind.PORTRAIT

    # Strong abstract signal: RT4D can meaningfully contribute.
    if abstract_hits >= 2 and abstract_hits > portrait_hits:
        return PathKind.ABSTRACT

    # Strong AI-direct signal: user explicitly wants AI-only output.
    if ai_direct_hits >= 2 and portrait_hits == 0 and abstract_hits == 0:
        return PathKind.DIRECT_AI

    # Mixed or weak signal: honest default is HYBRID.
    if portrait_hits > 0 and abstract_hits > 0:
        return PathKind.HYBRID

    return PathKind.HYBRID


# ---------------------------------------------------------------------------
# Route decision
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RouteDecision:
    """Determines who does what for a given prompt.

    Produced by ``decide_route()`` and consumed by the pipeline dispatch.
    The decision is the pre-execution honesty contract: it declares intent
    before any pixels are rendered.

    Sovereign X constitutional fields (authority_chain, continuity_id,
    governance_trace) are set by ``ConstitutionalDispatch.prepare()`` to
    trace who authorized the dispatch and what policies were checked.
    """

    path_kind: PathKind
    renderer_role: RendererRole
    ai_role: AIRole
    ai_provider: str | None
    ai_model: str | None
    prompt_classification: str
    """Human-readable explanation of why this route was chosen."""
    img2img_available: bool
    """Whether an img2img endpoint is configured and reachable."""
    composition_source: str | None = None
    """Where composition cues come from (e.g. 'rt4d-structure', 'depth-map')."""
    metadata: dict[str, Any] = field(default_factory=dict)

    authority_chain: tuple[dict[str, Any], ...] = ()
    """Ordered trace of who authorized this dispatch (Sovereign X AUTH layer).

    Each entry: ``{"authority_id": str, "role": str, "statement": str}``.
    Empty when the constitutional scheduler is not active.
    """
    continuity_id: str | None = None
    """Link to a prior dispatch or render state (Sovereign X CONT layer).

    When set, this dispatch continues from a previous continuity chain.
    The scheduler verifies that the prior receipt exists and is compatible.
    """
    governance_trace: dict[str, Any] | None = None
    """Policy evaluation evidence (mirrors CKL/CSE governanceTrace).

    Populated when ``ConstitutionalDispatch.prepare()`` runs policy checks.
    Contains: decisionId, verdict, policiesApplied, precedentCount,
    paramAdjust, attachProvenance.
    """

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["path_kind"] = self.path_kind.value
        d["renderer_role"] = self.renderer_role.value
        d["ai_role"] = self.ai_role.value
        d["authority_chain"] = list(self.authority_chain)
        return d


def decide_route(
    prompt: str,
    *,
    img2img_available: bool = False,
    img2img_provider: str | None = None,
    img2img_model: str | None = None,
    rt4d_enabled: bool = True,
) -> RouteDecision:
    """Decide who renders what for a given prompt.

    This is the core routing logic.  It combines prompt classification
    with capability availability to produce an honest route decision.

    Args:
        prompt: The user's prompt text.
        img2img_available: Whether an img2img provider is configured.
        img2img_provider: Provider name (e.g. "nim-flux", "fal-flux").
        img2img_model: Model name (e.g. "flux.1-schnell").
        rt4d_enabled: Whether RT4D is available as a renderer.

    Returns:
        RouteDecision declaring intent before execution.
    """
    path_kind = classify_prompt(prompt)
    provider = img2img_provider if img2img_available else None
    model = img2img_model if img2img_available else None

    if path_kind == PathKind.PORTRAIT:
        if img2img_available:
            return RouteDecision(
                path_kind=path_kind,
                renderer_role=RendererRole.SKIPPED,
                ai_role=AIRole.PRIMARY,
                ai_provider=provider,
                ai_model=model,
                prompt_classification=(
                    f"Portrait keywords detected; MRS procedural primitives "
                    f"cannot represent the subject.  AI generates the image."
                ),
                img2img_available=img2img_available,
            )
        else:
            return RouteDecision(
                path_kind=path_kind,
                renderer_role=RendererRole.SKIPPED,
                ai_role=AIRole.PRIMARY,
                ai_provider=None,
                ai_model=None,
                prompt_classification=(
                    f"Portrait keywords detected but no img2img provider "
                    f"configured.  Falling back to HYBRID."
                ),
                img2img_available=False,
            )

    if path_kind == PathKind.ABSTRACT:
        if img2img_available and rt4d_enabled:
            return RouteDecision(
                path_kind=path_kind,
                renderer_role=RendererRole.STRUCTURE,
                ai_role=AIRole.POLISH,
                ai_provider=provider,
                ai_model=model,
                prompt_classification=(
                    f"Abstract/geometry keywords detected; RT4D renders "
                    f"4D structure, AI polishes the look."
                ),
                img2img_available=img2img_available,
                composition_source="rt4d-structure",
            )
        elif rt4d_enabled:
            return RouteDecision(
                path_kind=path_kind,
                renderer_role=RendererRole.PRIMARY,
                ai_role=AIRole.SKIPPED,
                ai_provider=None,
                ai_model=None,
                prompt_classification=(
                    f"Abstract/geometry keywords detected; RT4D renders "
                    f"4D structure.  No img2img provider configured."
                ),
                img2img_available=False,
                composition_source="rt4d-structure",
            )
        else:
            return RouteDecision(
                path_kind=path_kind,
                renderer_role=RendererRole.SKIPPED,
                ai_role=AIRole.PRIMARY,
                ai_provider=provider,
                ai_model=model,
                prompt_classification=(
                    f"Abstract keywords detected but RT4D disabled.  "
                    f"AI generates the image."
                ),
                img2img_available=img2img_available,
            )

    if path_kind == PathKind.DIRECT_AI:
        return RouteDecision(
            path_kind=path_kind,
            renderer_role=RendererRole.SKIPPED,
            ai_role=AIRole.PRIMARY,
            ai_provider=provider,
            ai_model=model,
            prompt_classification=(
                f"AI-direct keywords detected; user requests pure AI output."
            ),
            img2img_available=img2img_available,
        )

    # HYBRID: mixed or weak signal
    if rt4d_enabled and img2img_available:
        return RouteDecision(
            path_kind=path_kind,
            renderer_role=RendererRole.STRUCTURE,
            ai_role=AIRole.POLISH,
            ai_provider=provider,
            ai_model=model,
            prompt_classification=(
                f"Mixed or weak signal; RT4D renders structure, AI polishes.  "
                f"Both contributions documented in receipt."
            ),
            img2img_available=img2img_available,
            composition_source="rt4d-structure",
        )
    elif rt4d_enabled:
        return RouteDecision(
            path_kind=path_kind,
            renderer_role=RendererRole.PRIMARY,
            ai_role=AIRole.SKIPPED,
            ai_provider=None,
            ai_model=None,
            prompt_classification=(
                f"Mixed signal; RT4D renders.  No img2img provider configured."
            ),
            img2img_available=False,
            composition_source="rt4d-structure",
        )
    else:
        return RouteDecision(
            path_kind=path_kind,
            renderer_role=RendererRole.SKIPPED,
            ai_role=AIRole.PRIMARY,
            ai_provider=provider,
            ai_model=model,
            prompt_classification=(
                f"Mixed signal; RT4D disabled.  AI generates the image."
            ),
            img2img_available=img2img_available,
        )


# ---------------------------------------------------------------------------
# Render receipt (post-execution honesty record)
# ---------------------------------------------------------------------------

@dataclass
class RenderReceipt:
    """Post-execution honesty record documenting what actually happened.

    This is the canonical record stored alongside the output PNG.  It
    includes the pre-execution RouteDecision and the post-execution
    verification of what each system actually contributed.

    Drive-G-1: Every field must be backed by implementation evidence.
    Fields like ``composition_preserved`` are only set when an img2img
    provider was actually called and the result was measured.
    """

    # Pre-execution intent (from RouteDecision)
    path_kind: str
    renderer_role: str
    ai_role: str
    ai_provider: str | None = None
    ai_model: str | None = None
    prompt_classification: str = ""

    # Post-execution verification
    renderer_ran: bool = False
    """Whether RT4D actually executed (not just was *intended* to)."""
    renderer_sha256: str | None = None
    """SHA-256 of the RT4D output PNG (before AI polish)."""
    renderer_render_time_ms: float | None = None
    """Wall-clock time for the RT4D render."""

    ai_ran: bool = False
    """Whether the AI provider was actually called."""
    ai_sha256: str | None = None
    """SHA-256 of the AI output."""
    ai_render_time_ms: float | None = None
    """Wall-clock time for the AI call."""

    composition_preserved: bool | None = None
    """Whether the AI preserved the RT4D composition (measured via image metrics).

    None = not measured (AI did not run, or img2img was not used).
    True  = composition was preserved (MSE/SSIM within threshold).
    False = composition was NOT preserved (AI replaced the structure).
    """

    # Honesty fields
    note: str = ""
    """Mandatory honesty note.  Must accurately describe what happened."""
    warnings: list[str] = field(default_factory=list)
    """Any deviations from the intended route (e.g. fallback, provider failure)."""

    # Sovereign X constitutional fields (copied from RouteDecision at receipt build)
    authority_chain: list[dict[str, Any]] = field(default_factory=list)
    """Ordered trace of who authorized this dispatch."""
    continuity_id: str | None = None
    """Link to prior dispatch state (CONT layer continuity chain)."""
    governance_trace: dict[str, Any] | None = None
    """Policy evaluation evidence from CKL/CSE governance check."""

    # Ledger
    ledger_tx_id: str | None = None
    """Memory Board transaction ID where this receipt is stored."""

    # Provenance chain
    run_id: str | None = None
    source_run_id: str | None = None
    """If this receipt is the result of a pipeline step on a prior run."""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_manifest_kind(self) -> str:
        """Return the manifest kind string for this receipt."""
        if self.renderer_role == "skipped":
            return "ai-only-render"
        if self.ai_role == "skipped":
            return "deterministic-procedural-4d-render"
        return f"hybrid-{self.path_kind}-render"

    def validate_honesty(self) -> list[str]:
        """Check for honesty violations.  Returns list of violation strings.

        This enforces Drive-G-1: no claim may exceed implementation evidence.
        """
        violations: list[str] = []

        # If renderer_ran is False, no renderer fields should be set.
        if not self.renderer_ran:
            if self.renderer_sha256:
                violations.append(
                    "renderer_sha256 set but renderer_ran=False"
                )
            if self.renderer_role not in ("skipped",):
                violations.append(
                    f"renderer_role={self.renderer_role!r} but renderer_ran=False"
                )

        # If ai_ran is False, no AI output fields should be set.
        if not self.ai_ran:
            if self.ai_sha256:
                violations.append(
                    "ai_sha256 set but ai_ran=False"
                )
            if self.ai_role not in ("skipped",):
                violations.append(
                    f"ai_role={self.ai_role!r} but ai_ran=False"
                )

        # Composition preservation requires both systems to have run.
        if self.composition_preserved is not None:
            if not self.renderer_ran:
                violations.append(
                    "composition_preserved set but renderer_ran=False"
                )
            if not self.ai_ran:
                violations.append(
                    "composition_preserved set but ai_ran=False"
                )

        # Note must not be empty for hybrid paths.
        if self.renderer_role not in ("skipped",) and self.ai_role not in ("skipped",):
            if not self.note:
                violations.append(
                    "hybrid path with empty note — must document both contributions"
                )

        return violations


def build_render_receipt(
    decision: RouteDecision,
    *,
    renderer_ran: bool = False,
    renderer_sha256: str | None = None,
    renderer_render_time_ms: float | None = None,
    ai_ran: bool = False,
    ai_sha256: str | None = None,
    ai_render_time_ms: float | None = None,
    composition_preserved: bool | None = None,
    run_id: str | None = None,
    source_run_id: str | None = None,
    warnings: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> RenderReceipt:
    """Build a RenderReceipt from a RouteDecision and execution results.

    The receipt documents what was INTENDED (from the decision) and what
    ACTUALLY HAPPENED (from the execution results).  This is the honesty
    contract: the receipt is stored alongside the output PNG and can be
    verified by any downstream consumer.
    """
    note_parts: list[str] = []

    if decision.renderer_role == RendererRole.STRUCTURE:
        if renderer_ran:
            note_parts.append("RT4D rendered 4D geometry as structural base")
        else:
            note_parts.append("RT4D was intended to render structure but did not run")
    elif decision.renderer_role == RendererRole.PRIMARY:
        if renderer_ran:
            note_parts.append("RT4D produced the final image")
        else:
            note_parts.append("RT4D was intended to produce the image but did not run")
    elif decision.renderer_role == RendererRole.LAYOUT:
        if renderer_ran:
            note_parts.append("RT4D provided layout/composition cues")
        else:
            note_parts.append("RT4D was intended to provide layout but did not run")

    if decision.ai_role == AIRole.POLISH:
        if ai_ran:
            note_parts.append("AI polished the RT4D render")
        else:
            note_parts.append("AI was intended to polish but did not run")
    elif decision.ai_role == AIRole.PRIMARY:
        if ai_ran:
            note_parts.append("AI produced the final image")
        else:
            note_parts.append("AI was intended to produce the image but did not run")

    if composition_preserved is True:
        note_parts.append("AI preserved RT4D composition")
    elif composition_preserved is False:
        note_parts.append("AI did NOT preserve RT4D composition")

    return RenderReceipt(
        path_kind=decision.path_kind.value,
        renderer_role=decision.renderer_role.value,
        ai_role=decision.ai_role.value,
        ai_provider=decision.ai_provider,
        ai_model=decision.ai_model,
        prompt_classification=decision.prompt_classification,
        renderer_ran=renderer_ran,
        renderer_sha256=renderer_sha256,
        renderer_render_time_ms=renderer_render_time_ms,
        ai_ran=ai_ran,
        ai_sha256=ai_sha256,
        ai_render_time_ms=ai_render_time_ms,
        composition_preserved=composition_preserved,
        note=". ".join(note_parts),
        warnings=list(warnings or []),
        # Constitutional fields propagated from decision
        authority_chain=list(decision.authority_chain),
        continuity_id=decision.continuity_id,
        governance_trace=decision.governance_trace,
        run_id=run_id,
        source_run_id=source_run_id,
        metadata=dict(metadata or {}),
    )
