# ADR-001 — Adopt RenderAccelContract (Draft v0.1) on Director

**Status:** accepted (PROMOTE_WITH_GAPS)  
**Date:** 2026-07-28  
**Trail:** `director-atcm-2026-07`

## Context

ATCM tile planning existed without a named constitutional artifact binding router authority, evidence shapes, or failure semantics.

## Decision

1. Publish `RENDER_ACCEL_CONTRACT.md` (Articles I–VII) under infinity-director docs — **declared** prose.
2. Add JSON schemas under `mrs/apps/infinity-director/schemas/` for RenderPlan, ComplexityEvidence, ReplayRecord, RenderViolation (Director scope; not CROS lineage).
3. Emit artifacts from `app/render_accel.py` when ATCM is **explicitly** requested.
4. On prerequisite/plan failure, return RenderViolation (422) instead of silent fallback.

## Consequences

- **Partial** enforcement only in Director; Genblaze remains full-frame.
- Work-model speedup stays `estimate_not_measured`.
- Scene graph hash is a prompt/scene_spec proxy until real SceneGraph hashing exists.

## Crew lenses

| Role | Note |
|------|------|
| Architect | Kept accel SoT in Director docs/schemas, not repo root constitution |
| Builder | Wired `/api/direct` + `/api/atcm/plan` response fields |
| Implementor | `render_accel.py` + tests |
| Inspector | Structural schema tests; ESFR PROMOTE_WITH_GAPS |
