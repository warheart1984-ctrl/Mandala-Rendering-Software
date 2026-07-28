# 01 — Architect ADR: Judge WOW composition (proton six-mod + Engine3D)

**Trail:** `judge-wow-2026-07`  
**Stage:** Architect  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**Predecessors:** `proton-raster-2026-07`, `engine3d-expand-2026-07`, `prompt-scene-adapter-2026-07`

---

## 1. Intent

Compose **existing** proton six-mod CECP reference + Engine3D paths into a
**judge-wow** package that produces a dense star→proton **triptych** suitable
for human/judge review (256–512 resolution), without re-implementing the six
mods or amending constitutional artifacts.

| Goal | Tag target |
|------|------------|
| Dense star→proton triptych (beauty + depth + normal AOVs), 256–512 | **enforced** (Implementor) |
| Genblaze HTTP wire for proton raster provider | **partial** → **enforced** when wired |
| Prompt→scene→proton one-shot CLI | **enforced** (shell → Implementor) |
| `shadeRasterFragment` hook in `HeadlessStillRenderer` | **skeleton** → Implementor |
| Optional pre-bake draft lattice plate | **declared** / **skeleton** CLI shell |

**Why:** prior trails proved six-mod proton and Prompt→Scene separately; this
trail packages a single “wow” evidence path for judges without claiming new
math or charter authority.

## 2. ADR decision

### Context

- Six-mod proton pipeline is **enforced** under
  `mrs/packages/renderer-core/src/render/rt4d/proton/`
  (`proton-raster-2026-07`).
- Genblaze `proton_raster_provider.py` exists but is **partial** (default off;
  `main.py` unwired).
- Engine3D still path uses `HeadlessStillRenderer` (triangle soft-raster sibling).
- Prompt→Scene bridge is available OOP for one-shot composition.

### Decision

1. **Compose, do not fork.** Reuse `runProtonPipeline` / six mods; add thin AOV
   encode helpers and CLI shells for triptych + prompt one-shot + optional bake.
2. **Triptych = beauty PNG + depth PNG + normal PNG** (or equivalent layout)
   at width/height in **[256, 512]**; denser star fields via existing scene
   specs / planned dense flags (Implementor; Builder may only TODO-mark CLI).
3. **Genblaze:** keep provider default-off; Implementor wires `main.py` health /
   HTTP when ready — Builder only scaffolds tests asserting default-off shape.
4. **`shadeRasterFragment`:** declared hook point on HeadlessStillRenderer for
   optional proton/star fragment shading — **not** scaffolded as deep logic;
   Implementor owns the hook.
5. **Pre-bake:** optional draft lattice plate script shell only; bake algorithm
   left **declared**.

### Consequences

- Positive: single CECP trail for judge-facing composition; honest status tags.
- Tradeoff: wow path depends on prior trails’ enforced mods; Genblaze remains
  partial until HTTP wire lands.
- Non-decision: charter edits; GPU splat; narrative-package imports in Genblaze
  `app/*.py`; new Scene type.

## 3. Interface specification

### Inputs

| Input | Source |
|-------|--------|
| SceneSpecification JSON / demo | proton CLI / prompt-scene bridge |
| Prompt string (one-shot) | `prompt-scene-to-proton.mjs` → bridge → proton |
| Width / height | 256–512 inclusive (Implementor clamp) |
| `intentId` / CIR overlay | required before raster (existing policy) |
| Env `PROTON_RASTER_ENABLED` | Genblaze; default **off** |

### Outputs

| Output | Notes |
|--------|-------|
| Beauty PNG | existing `rasterToImage` |
| Depth PNG / Normal PNG | via stub `aovEncode.js` (Implementor fills) |
| Evidence JSON | intentId, world/timeline when applicable, frame hash |
| Genblaze availability dict | `enabled`, `available`, `provider`, … |

### Schemas / env / bans

- Reuse SceneSpecification; no competing Scene type.
- Env: `PROTON_RASTER_ENABLED` (default 0), `PROTON_RASTER_SCRIPT` (declared).
- Ban: no `story_forge` / narrative-package imports under Genblaze `app/*.py`.
- No secrets in trail or scripts.

## 4. Constitutional boundary analysis

| In-scope | Out-of-scope / protected |
|----------|---------------------------|
| `rt4d/proton/*` stubs & CLIs | `constitution/`, `engine/constitution/` |
| Genblaze provider tests / future main.py wire | `AGENTS.md`, `default.policies.json` |
| Engine3D HeadlessStillRenderer hook (Implementor) | Charter / policy mutation |
| CECP trail `judge-wow-2026-07` | Claiming six-mod re-proof as new math |

## 5. File manifest (path × action × owner)

| Path | Action | Owner |
|------|--------|-------|
| `docs/governance/cecp/trails/judge-wow-2026-07/*` | create trail | Architect / Builder |
| `proton/aovEncode.js` | stub exports | Builder → Implementor |
| `proton/judgeWow.test.js` | placeholder tests | Builder → Implementor |
| `scripts/judge-wow-proton-triptych.mjs` | USAGE shell | Builder → Implementor |
| `scripts/prompt-scene-to-proton.mjs` | USAGE shell | Builder → Implementor |
| `scripts/bake-draft-lattice-plate.mjs` | USAGE shell | Builder → Implementor |
| `scripts/render-proton-splat.mjs` | TODO markers only (dense flags) | Builder (low-risk) |
| `genblaze-media/tests/test_proton_raster.py` | placeholder | Builder → Implementor |
| Genblaze `main.py` wire | **not this Builder pass** | Implementor |
| `shadeRasterFragment` in HeadlessStillRenderer | **not this Builder pass** | Implementor |
| Dense CLI flags on splat script | **not this Builder pass** | Implementor |

## 6. Acceptance criteria

- [ ] Triptych CLI writes beauty + depth + normal (or documented layout) at 256–512
- [ ] Deterministic frame hash for same scene + seed (excludes wall-clock)
- [ ] `intentId` present in evidence before/with raster outputs
- [ ] Genblaze: `PROTON_RASTER_ENABLED` default off; availability shape stable
- [ ] Prompt→scene→proton one-shot exits 0 with PNG + evidence when Implementor fills
- [ ] Optional bake script remains honest **skeleton** until bake lands
- [ ] No charter / AGENTS / policy edits
- [ ] Drive-G-1: status tags match evidence (`skeleton` / `partial` / `enforced`)

## 7. Handoff to Builder

Scaffold trail `01`–`06`, README, lineage; create stub modules and USAGE-only
CLIs listed above; label stubs **skeleton** / **declared**; do **not**
implement Genblaze `main.py`, `shadeRasterFragment`, or dense CLI flags.
Write `02-builder-scaffold-manifest.md` fully.
