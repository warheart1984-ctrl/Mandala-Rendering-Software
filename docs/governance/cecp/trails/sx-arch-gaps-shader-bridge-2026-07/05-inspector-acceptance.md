# 05 — Inspector acceptance

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** Inspector (CECP 05)  
**mode:** Testwright + Librarian  
**actorMode:** Anchor

## Acceptance matrix

| Criterion | Result | Evidence |
|-----------|--------|----------|
| ShaderBridge maps → finite PBR | **PASS** | `test:shader-bridge` 6/6 |
| Soft-raster uses bridge path | **PASS** | `bridgeConstitutionalMaterial` → RasterMaterial |
| ACES-approx tone-map | **PASS** | unit + proof PNG |
| Proof still written | **PASS** | `shader-bridge-tonemap-proof.png` |
| Lemonade checksum/provenance API | **PASS** | unit + adapter exports |
| Live haltCauseClass honest | **PASS** | `sd_server` in halt summary |
| SD generate unblocked? | **FAIL / blocked** | sd-server will not start |
| Fixture HumanFaceRigged evidence+AABB | **PASS** | fixture-registry 4/4 + audit JSON |
| No charter edits | **PASS** | review |

## Gap 2 specific finding

User theory (provenance halt) is **not supported** by this probe. Catalog shows SD downloaded; generate fails with `sd-server failed to start`. Provenance layer is **partial** and useful as a gate, but SD remains **blocked** for hardware/runtime reasons.

## Overall inspector verdict

**PASS_WITH_GAPS**

## Handoff to ESFR

PromotionEligibility should be `PROMOTE_WITH_GAPS` — ship bridge/registry/provenance gate; do not promote Lemonade SD as operational on this host.
