# 06 — Engineer Standards (ESFR): cinematic-quality-v2

**Trail:** `cinematic-quality-v2-2026-07`  
**Stage:** ESFR / Engineer Standards  
**mode:** Anchor + Guardian  
**ESFRVerdict:** **PASS_WITH_GAPS**  
**PromotionEligibility:** **PROMOTE_WITH_GAPS**

## Test matrix

| Probe | Command / artifact | Result |
|-------|-------------------|--------|
| 01 Build | `npm run build` in engine3d-core | PASS |
| 02 Raster upgrade | 13 tests | PASS |
| 03 First-10s render | `render_ch1_cinematic.mjs --cinematic-v2 --max-seconds 10` | PASS |
| 03b 30s remaster | `--max-seconds 30` → 720 frames / MP4 | PASS |
| 04 Proof still | `--proof --shot 02-dim-room --cinematic-v2` | PASS |
| 05 Lemonade models | GET `:13305/api/v1/models` | PASS (catalog) |
| 06 Lemonade generate | POST images/generations SD-Turbo | FAIL `sd-server` |
| 07 Genblaze lemonade SX | POST `:18080/api/sx/schedule` | PASS halt (honest) |
| 08 Docs honesty | showcase README + trail | PASS (when written) |

## Standards

- Determinism: soft-raster posts seeded / no wall-clock in pixel hash.  
- Sovereignty: local Lemonade preferred; cloud not required.  
- Evidence: probe JSON records blocked SD despite downloaded weights.  
- MIT: no new copyleft deps.

## Promotion gaps (must remain labeled)

- Soft-raster ≠ photoreal.  
- Lemonade SD still **blocked** at sd-server on this AMD host.  
- SX_DEMO_MODE images are simulated checkerboards — never ship as beauty.

## Decision

Promote cinematic-v2 soft-raster showcase path + CECP trail as the quality iteration deliverable. Do **not** promote Genblaze/Lemonade as a working beauty plate source until `images/generations` returns HTTP 200 with decodable PNG on this machine.
