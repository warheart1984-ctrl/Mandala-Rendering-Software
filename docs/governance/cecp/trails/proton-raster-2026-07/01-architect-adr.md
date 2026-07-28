# 01 — Architect ADR: CECP Ω∞ Proton Raster Reference (Six Mods)

**Trail:** `proton-raster-2026-07`  
**Stage:** Architect (refined north star — supersedes vague single-splat MVP framing)  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**Role:** Second CECP reference package (peer to `prompt-scene-adapter-2026-07`)

---

## 1. Intent

Prove constitutional engineering is **repeatable**: ship a governed
Prompt→Scene→4D-ProtonRaster chain as a CECP Ω∞ reference implementation with
**six runnable modules**, each carrying design → scaffold → tests → review →
probe evidence in this trail.

SoT package: `mrs/packages/renderer-core/src/render/rt4d/proton/` (reuses
SceneSpecification + Projector4D). Thin CLI/adapter:
`mrs/adapters/proton-raster-bridge/`. Scene input = existing SceneSpecification
(no competing Scene type).

## 2. ADR

### Context

Prior crew pass shipped isotropic soft splat helpers (**partial** CECP fit).
User refined scope: six named mods must be first-class, testable, deterministic
CPU MVP — not a one-off splat demo.

### Decision

| # | Module | Contract | Tag target |
|---|--------|----------|------------|
| 1 | **Scene→ProtonField** | `Proton { id, center∈R⁴, radius, density, color, metadata }`; every `entities[]` → ≥1 proton; no orphan protons; deterministic | **enforced** |
| 2 | **ProtonField→4DProjection** | `Camera4D { origin∈R⁴, basis 4×3, params }` → `ProjectedProtonField`; no silent loss | **enforced** |
| 3 | **ProjectedProtonField→ProtonRaster** | Soft Gaussian splat; associative-stable accumulate (fixed id order) | **enforced** |
| 4 | **ProtonRaster→DepthField** | Monotonic depth; no negatives | **enforced** |
| 5 | **ProtonRaster→NormalField** | Unit normals; no NaNs | **enforced** |
| 6 | **ProtonField→Lighting4D** | Deterministic 4D falloff → `LitProtonField` | **enforced** |
| — | **ProtonRaster→Image** | Thin PNG export (visibility) | **enforced** |

CIR remains a thin IntentRecord overlay (`intentId` required before raster).
No parallel governance. No charter edits. Soft splat stays sibling to triangle
soft-raster / PathTracer4D.

### Declared roadmap (NOT this run)

| Module | Status |
|--------|--------|
| MaterialMap4D | **declared** |
| SpatialLayout4D | **declared** |
| ForceField4D | **declared** |
| ProtonDynamics | **declared** |
| SemanticTagging | **declared** |
| ToneMap | **declared** |
| Scene→Camera4D (auto-framing) | **declared** |
| Anisotropic Σ∈R⁴ˣ⁴ / GPU splat | **declared** |
| Genblaze HTTP host wire | **partial** / **declared** (provider stub only) |

### Consequences

- Positive: second CECP reference with six probeable mods; honest tags.
- Tradeoff: CPU approximate splat ≠ PathTracer; Camera4D here is projection
  params for protons, not full path-trace Camera4D ray API (adapter may wrap
  Projector4D params).
- Non-decision: Docker packaging; charter amend; StoryForge in Genblaze.

## 3. Interface specification

```text
SceneSpecification
  → [1] sceneToProtonField → ProtonField
  → [6] applyLighting4D    → LitProtonField
  → [2] projectProtonField → ProjectedProtonField
  → [3] rasterizeProtons   → ProtonRaster (+ float beauty)
  → [4] depthFromRaster    → DepthField
  → [5] normalsFromRaster  → NormalField
  → [ ] rasterToImage      → PNG + evidence JSON
```

**Determinism:** seed only for CIR id mint when requested; accumulate sorts by
`proton.id`; `frameSha256` excludes wall-clock.

**No silent loss (mod 2):** every input proton appears in
`ProjectedProtonField.protons[]` or `dropped[]` with explicit `reason`.

## 4. Constitutional boundary

| In | Out |
|----|-----|
| `rt4d/proton/*`, bridge CLI, CECP trail | charter / AGENTS / policies |
| SceneSpecification reuse | new conflicting Scene type |
| intentId before raster | ungoverned render |
| CPU Node ESM | GPU stack this run |

## 5. File manifest (owner: Implementor)

| Path | Role |
|------|------|
| `proton/sceneToProtonField.js` | Mod 1 |
| `proton/projectProtonField.js` | Mod 2 |
| `proton/rasterizeProtons.js` | Mod 3 |
| `proton/depthField.js` | Mod 4 |
| `proton/normalField.js` | Mod 5 |
| `proton/lighting4d.js` | Mod 6 |
| `proton/rasterToImage.js` | PNG thin |
| `proton/pipeline.js` | E2E orchestration |
| `proton/mods.*.test.js` + `pipeline.test.js` | Acceptance |
| `scripts/render-proton-splat.mjs` | Demo CLI |
| Trail `02`–`05` | CECP evidence |

## 6. Acceptance criteria

- [ ] Mod1: entity count ≤ proton source-entity coverage; no orphan `sourceEntityId`
- [ ] Mod2: silent-loss impossible (length + dropped reasons)
- [ ] Mod3: same input → same `frameSha256`
- [ ] Mod4: all depth ≥ 0; order consistent with projected depth
- [ ] Mod5: ‖n‖≈1 or zero-mask; no NaN
- [ ] Mod6: same lights+field → same lit colors hash
- [ ] E2E CLI writes PNG + evidence with intentId
- [ ] Declared roadmap modules absent from runtime claims

## 7. Handoff

Builder scaffolds (if missing) → Implementor fills six mods + tests →
Reviewer boundary → Inspector PASS / PASS_WITH_GAPS.
