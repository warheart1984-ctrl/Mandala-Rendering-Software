# 05 — Inspector acceptance

**Trail:** `proton-raster-2026-07`  
**Stage:** Inspector  
**Predecessor:** `04-reviewer-conformance.md`  
**Date:** 2026-07-27

## Probes run

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/proton/*.test.js
# → 24 pass / 0 fail

node mrs/packages/renderer-core/scripts/render-proton-splat.mjs --demo \
  --width 64 --height 64 --output output/proton-cecp-demo.png
# → ok:true; mods.* = enforced; intentId present; PNG written
```

## Claim ↔ evidence

| Claim | Evidence | Tag |
|-------|----------|-----|
| Mod1 entity→≥1 proton, no orphans | `mods.six.test.js` Mod1 | **enforced** |
| Mod2 no silent loss | Mod2 test + dropped accounting | **enforced** |
| Mod3 soft splat + intent gate + hash | Mod3 tests | **enforced** |
| Mod4 depth ≥0 | Mod4 + assertDepthFieldInvariants | **enforced** |
| Mod5 normals no NaN | Mod5 + assertNormalFieldInvariants | **enforced** |
| Mod6 lighting deterministic | Mod6 test | **enforced** |
| PNG export | E2E + CLI | **enforced** |
| Genblaze host wire | provider stub only | **partial** |
| MaterialMap4D… Scene→Camera4D | ADR list only | **declared** |
| Soft splat = PathTracer / triangle soft-raster | — | **false** / not claimed |

## Replay notes

Same `demoSceneSpec` + intent seed path → identical `frameSha256` /
`pngSha256` across two `runProtonPipeline` calls (test enforced).

## Verdict

**PASS_WITH_GAPS**

Gaps (non-blocking for this CECP reference):

1. Genblaze HTTP/`main.py` not wired (**partial**)
2. Roadmap mods explicitly **declared** (out of run)
3. Prompt→Scene bridge not re-executed inside proton CLI (SceneSpecification
   fixture / file input — reuse path **declared**/manual; Prompt→Scene remains
   its own **enforced** reference trail)

## Acceptance

Six-mod CPU proton raster CECP reference is accepted as a second Ω∞ trail peer
to Prompt→Scene. Operator can run CLI + tests today. Commercial/self-serve and
platform packaging are out of scope (Drive-G-2).

## Docker crew handoff

**None required.** No Docker coupling; image packaging owned by other crew.
