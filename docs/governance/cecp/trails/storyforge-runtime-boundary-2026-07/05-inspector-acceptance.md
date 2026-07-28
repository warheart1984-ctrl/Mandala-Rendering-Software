# 05 — Inspector acceptance

| Field | Value |
|-------|-------|
| Trail | `storyforge-runtime-boundary-2026-07` |
| Stage | Inspector |
| Mode | Researcher + Cartographer · Sage light |
| Predecessor | `04-reviewer-conformance.md` |
| Date | 2026-07-27 |
| Verdict | **PASS_WITH_GAPS** |

## Summary

Claimed boundary freeze is evidenced by schemas, validator refuse paths, and 14
passing unit tests. End-to-end StoryForge Runtime Spec v1.0 execution in MRS is
**not** evidenced — correctly tagged **partial** / SF stages **declared**.
Gaps are expected and listed.

## Commands cited

```text
G:\.runtime\python-3.13.14\python.exe -m pytest mrs/adapters/storyforge-boundary/test_boundary.py -q
14 passed in 0.15s
```

## Claim ↔ evidence ledger

| Claim | Tag | Evidence | Result |
|-------|-----|----------|--------|
| RenderRequest schema exists (MRS intake) | **partial** | `schemas/RenderRequest.schema.json` | **PASS** |
| RenderResult schema exists (MRS output) | **partial** | `schemas/RenderResult.schema.json` | **PASS** |
| Ownership freeze documented | **partial** | `BOUNDARY.md` | **PASS** |
| Validate requires intentId/worldId | **enforced** | refuse tests | **PASS** |
| Smuggled SF bodies refused | **enforced** | parametrized smuggle tests | **PASS** |
| scene-spec route echoes SceneSpecification | **partial** | `test_route_scene_spec_echoes_specification` | **PASS** |
| proton/rt4d/engine3d deep execute | **skeleton** | route mapping notes; no pipeline run | **PASS** (as skeleton) |
| PromptComposer / IModelBackend in MRS | **declared** (not present) | code review + no SF imports test | **PASS** (absent) |
| Genblaze app ban | **enforced** | ban test | **PASS** |
| SF Runtime Spec v1.0 end-to-end in MRS | would be overclaim | not claimed in CONTRACT | **N/A** — not asserted |
| Prompt→Scene ≡ RenderRequest | would be overclaim | ADR maps as **partial** precursor | **PASS** (honest) |

## Gaps (PASS_WITH_GAPS)

| Gap | Tag | Needed for stronger claim |
|-----|-----|---------------------------|
| Deep proton/RT4D/Engine3D execution from RenderRequest | **skeleton** | Implementor follow-on + replay hashes |
| Genblaze HTTP RenderRequest surface | not in scope | optional host trail |
| Repo-wide CI schema validation suite | **partial** | wire schemas into CI |
| SF RenderIntentBuilder / PromptComposer / IModelBackend | **declared** | StoryForge-owned — out of MRS |
| Live multi-run artifact hashes from boundary render | not evidenced | only when deep routes ship |

## Replay / determinism

Fixture validate is deterministic. No frame/png hash probe for deep render
(skeleton routes). Not a FAIL — gap noted.

## Multi-mode lens (Inspector — light)

| Mode | Note |
|------|------|
| Researcher | Hypothesis “missing intentId refuses” falsified by green test |
| Cartographer | Precursor Prompt→Scene remains side path on map |
| Bard | Judge line: handshake frozen; novel not rewritten |
| Historian | Lineage after §9 #1/#2 — does not rewrite them as SF |

## Handoff to ESFR

Inspector verdict **PASS_WITH_GAPS**. Promotion counsel should stay
**PROMOTE_WITH_GAPS** if standards matrix agrees; CHEA/CCR/CDGF **declared** only.
