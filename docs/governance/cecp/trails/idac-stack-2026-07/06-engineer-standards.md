# ESFR — IDAC stack E2E

**Trail:** idac-stack-2026-07  
**ESFRVerdict:** PASS_WITH_GAPS  
**PromotionEligibility:** PROMOTE_WITH_GAPS

## Probe matrix (abbrev.)

| Probe | Result | Notes |
|-------|--------|-------|
| 01 Scope | PASS | Bridge + router only; no constitution edits |
| 02 Imports | PASS | Top-level imports; lazy `app.main.dispatch_render` in executor (documented coupling) |
| 03 Tests | PASS | 50/50 targeted |
| 04 Docs bound | PASS | Gaps labeled partial/skeleton |
| 05 Secrets | PASS | No credentials added |
| 06 Render honesty | PASS | estimate_not_measured; full_frame_dispatch |
| 07 IDAC invariants | partial | Plan drift enforced in tests |
| 08 Ops | partial | Live Genblaze unavailable |

## Remaining gaps (block full PROMOTE)

- Tile-faithful Genblaze execution
- Bit-identical replay / tile timings
- CKL policy binding for RenderViolation / PlanViolation
- ai/compile domains declared only

## Counsel

Safe to demo Intent→Plan→Evidence on `/api/direct` with `speed_profile=atcm` or `idac=true`; do not claim measured acceleration or per-tile runtime.
