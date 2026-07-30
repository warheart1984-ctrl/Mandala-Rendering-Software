# 06 — Engineer Standards (ESFR)

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** ESFR (CECP 06)  
**Package:** `docs/governance/esfr/`  
**mode:** Guardian + Steward + Runtime-Sage

## ESFRVerdict

**PASS_WITH_GAPS**

## PromotionEligibility

**PROMOTE_WITH_GAPS**

Promote: ShaderBridge (**partial**), ACES-approx tone-map (**partial**), FixtureFaceRegistry (**partial**), Lemonade provenance/checksum gate (**partial**), CECP trail + proofs.

Do **not** promote: Lemonade SD image generation on this host (remains **blocked** — `haltCauseClass=sd_server`).

## Test matrix

| Probe | Command / artifact | Result |
|-------|-------------------|--------|
| 01 ShaderBridge units | `npm run test:shader-bridge` | PASS 6/6 |
| 02 Fixture registry | `npm run test:fixture-registry` | PASS 4/4 |
| 03 Lemonade adapter units | `node --test sovereign-x/tests/lemonadeSdAdapter.test.js` | PASS 5/5 |
| 04 Proof PNG | `docs/4d-engine/proofs/sx-arch-gaps-2026-07/shader-bridge-tonemap-proof.png` | present |
| 05 Fixture audit JSON | `fixture-face-registry-audit.json` | present |
| 06 Lemonade capability | `lemonade-sd-capability-report.json` | present |
| 07 Halt cause summary | `lemonade-halt-cause-summary.json` | `sd_server` |
| 08 Charter untouched | git scope review | PASS |

## Standards notes

- Determinism: tone-map + bridge unit-tested without wall-clock in hashes.
- MIT-safe; no new copyleft deps.
- Drive-G-1: provenance theory rejected by evidence; SD block retained.
- Drive-G-2: reference impl advanced; platform SD path still early/blocked.

## Remaining blockers

1. Lemonade `sd-server` start failure on this AMD/host stack.
2. Weight files not discovered under default cache roots (path discovery gap).
3. Soft-raster remains approximate — photoreal out of scope.
4. Biometric limb ratios for face-only fixtures remain unmeasurable (AABB proxies only) — full skeletal enforcement **declared**/out of scope.

## Gap-3 follow-on (2026-07-30)

See `07-gap3-biometric-patches.md`. Biometric catalog + inheritance + normalization audit promoted as **partial**. ESFR eligibility unchanged: **PROMOTE_WITH_GAPS**.

## Close

Crew run complete. Trail id: `sx-arch-gaps-shader-bridge-2026-07`.
