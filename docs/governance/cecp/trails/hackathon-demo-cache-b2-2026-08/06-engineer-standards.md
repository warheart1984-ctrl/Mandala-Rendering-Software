# 06 ESFR — Engineer Standards

| Field | Value |
|-------|-------|
| ESFRVerdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |

## Test matrix

| Probe | Result |
|-------|--------|
| 01 Intent declared | PASS |
| 02 Evidence-bound claims | PASS |
| 03 No protected SoT edits | PASS |
| 04 Unit tests demo_cache | PASS (18) |
| 05 Live GMI/B2 | GAP (operator keys/credits) |
| 06 Docker optional gmi extra | GAP |
| 07 Fail-closed labeling | PASS (unit) |
| 08 Secrets hygiene | PASS |

## Gaps to close later

1. Install `genblaze-gmicloud` in Render image when judging live GMI.
2. Pre-render 24 frames into B2 before demo day.
3. Set `GMI_API_KEY` + `GENBLAZE_DEMO_CACHE=1` on dashboard.
