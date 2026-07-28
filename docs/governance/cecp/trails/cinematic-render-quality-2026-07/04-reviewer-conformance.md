# 04 — Reviewer conformance

**Trail:** `cinematic-render-quality-2026-07`  
**Stage:** Reviewer (read-only)  
**mode:** Artisan-Logic  
**cognitive-profile:** Scientist  

## Verdict

**PASS_WITH_GAPS** — opt-in cinematic quality path is constitutionally scoped; draft clamps preserved; claims match evidence tags.

## Checks

| Check | Result |
|-------|--------|
| P1 intent declared | PASS |
| P2 evidence (timeout → 24 spp floor) | PASS |
| P3 no charter/policy edits | PASS |
| P4 determinism (seeded rng, adaptive seeded) | PASS |
| Draft CI clamps | PASS (test) |
| Adaptive tagged enforced with tests | PASS |
| Soft penumbra / meshed PBR | correctly **declared** / **partial** |
| Unreal/V-Ray claims | none |

## Gaps (honest)

- RT4D materials remain Lambertian (specular/metal **partial** deferred).  
- Soft contact shadows beyond larger area lights **declared**.  
- Engine3D worldDoc primitive→mesh path **partial**.
