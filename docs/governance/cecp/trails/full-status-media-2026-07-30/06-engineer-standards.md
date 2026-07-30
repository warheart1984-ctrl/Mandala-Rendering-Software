# 06 — Engineer Standards (ESFR)

| Field | Value |
|-------|-------|
| Role | ESFR |
| lens | Anchor + Guardian |
| ESFRVerdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |

## Intake

InspectorVerdict **PASS_WITH_GAPS** accepted. Trail stages 01–05 present. Module under review: media/render standings verification (no new constitutional surface).

## Test matrix (summary)

| Category | Outcome | Cite |
|----------|---------|------|
| Coding / hygiene | PASS | No protected-path edits; trail-only writes |
| API / CLI honesty | PASS | promote/certify/rcs CLIs wired and executed on live run `91aa9be8f7a2215b` |
| Tests / CI smoke | PASS | ImageGen 21, VII 12, raster 13, photoreal evidence ran |
| License / deps | PASS | No new deps |
| Drive-G-1 wording | PASS | No Full Photoreal / Phase 4 certified claims |
| Drive-G-2 maturity dims | PASS_WITH_GAPS | Engine/reference partial; commercial not assessed |
| Replay / determinism | PASS_WITH_GAPS | Cycles dual-run pixel identity still held-not-rerun (prior CPCS) |
| Scope discipline | PASS | Verification-only |

## Probes 01–08 (citations)

| Probe | Result | Evidence |
|-------|--------|----------|
| 01 Intent declared | PASS | Architect ADR |
| 02 Evidence bound | PASS | commands + paths in 03/05 |
| 03 Authority/contract | PASS | no protected edits |
| 04 Replayability | PASS_WITH_GAPS | governed runIds + seed; Cycles dual pixel held |
| 05 Conformance tags | PASS | soft-raster / held / certified:false |
| 06 Lineage | PASS | this trail + Quality Progress Log |
| 07 Anti-overclaim | PASS | CPCS certified false; Lemonade held |
| 08 Promotion readiness | PASS_WITH_GAPS | media + promote/certify chain shippable; CPCS gates remain partial |

## Gaps (promotion path)

1. Raise PEP/SRP completeness from 0.6061/0.65 toward CPCS thresholds (≥0.95/1.0).
2. Re-run pixel-level dual replay to flip `rdc.replayVerified` from false.
3. Move CAT from `PASS_WITH_GAPS` to `PASS` by closing checklist partials (T-01..T-05, T-08, T-10..T-12).
4. Lemonade: keep held until verified `pixelsProduced: true` evidence.
5. Raise Cycles samples/resolution only after GPU device path.

## Verdict

**ESFRVerdict:** PASS_WITH_GAPS  
**PromotionEligibility:** PROMOTE_WITH_GAPS  

Standings report and media catalog are eligible to publish as operator truth. Photoreal certification remains **not certified**.
