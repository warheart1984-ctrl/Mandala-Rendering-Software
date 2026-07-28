# 02 — Builder scaffold manifest (judge-wow)

**Trail:** `judge-wow-2026-07`  
**Stage:** Builder  
**Predecessor:** `01-architect-adr.md`  
**Date:** 2026-07-27

---

## 1. Intent

Scaffold the **judge-wow** composition package from Architect ADR
`01-architect-adr.md`: CECP trail layout, thin AOV encode stub, USAGE-only CLI
shells, proton placeholder tests, and Genblaze provider test placeholder.

**Cite:** Compose existing proton six-mod + Engine3D into judge-wow (dense
star→proton triptych 256–512, Genblaze HTTP wire later, prompt→scene→proton
one-shot, `shadeRasterFragment` later, optional pre-bake).

**Not in this pass:** Genblaze `main.py` wire, `shadeRasterFragment` hook,
dense CLI flag implementation (TODO markers only on splat USAGE).

## 2. Scaffold manifest (created paths)

| Path | Kind | Status tag |
|------|------|------------|
| `docs/governance/cecp/trails/judge-wow-2026-07/01-architect-adr.md` | ADR (persisted) | **declared** (design SoT) |
| `docs/governance/cecp/trails/judge-wow-2026-07/02-builder-scaffold-manifest.md` | this file | **partial** (scaffold evidence) |
| `docs/governance/cecp/trails/judge-wow-2026-07/03-implementor-notes.md` | placeholder | awaiting Implementor |
| `docs/governance/cecp/trails/judge-wow-2026-07/04-reviewer-conformance.md` | placeholder | awaiting Reviewer |
| `docs/governance/cecp/trails/judge-wow-2026-07/05-inspector-acceptance.md` | placeholder | awaiting Inspector |
| `docs/governance/cecp/trails/judge-wow-2026-07/06-engineer-standards.md` | placeholder | awaiting Engineer Standards |
| `docs/governance/cecp/trails/judge-wow-2026-07/README.md` | trail index | **partial** |
| `docs/governance/cecp/trails/judge-wow-2026-07/lineage.json` | machine lineage | **partial** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/aovEncode.js` | stub module | **skeleton** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/judgeWow.test.js` | placeholder test | **skeleton** |
| `mrs/packages/renderer-core/scripts/judge-wow-proton-triptych.mjs` | CLI shell | **skeleton** |
| `mrs/packages/renderer-core/scripts/prompt-scene-to-proton.mjs` | CLI shell | **skeleton** |
| `mrs/packages/renderer-core/scripts/bake-draft-lattice-plate.mjs` | CLI shell | **skeleton** / **declared** |
| `mrs/apps/genblaze-media/tests/test_proton_raster.py` | placeholder test | **skeleton** |
| `mrs/packages/renderer-core/scripts/render-proton-splat.mjs` | USAGE TODO markers only | existing **enforced**; planned flags **declared** |

## 3. Dependency graph

```text
[declared] Prompt string
    → prompt-scene-bridge (OOP, existing)
    → SceneSpecification
    → runProtonPipeline (six mods, existing enforced)
    → beauty PNG (rasterToImage)
    → aovEncode.js [skeleton] → depth PNG + normal PNG
    → judge-wow-proton-triptych.mjs [skeleton]

[declared] Optional bake-draft-lattice-plate.mjs
    → draft lattice plate artifact (Implementor)

[partial] Genblaze proton_raster_provider.py (existing)
    → PROTON_RASTER_ENABLED default off
    → main.py HTTP wire [Implementor — not scaffolded]
    → test_proton_raster.py [skeleton]

[declared] HeadlessStillRenderer.shadeRasterFragment
    → Implementor only (no Builder stub file)
```

**Package / subprocess boundaries**

| Boundary | Notes |
|----------|-------|
| `renderer-core` proton SoT | Node ESM; no Genblaze imports |
| Genblaze provider | Python; out-of-process Node CLI when enabled |
| Prompt→Scene bridge | Existing adapter; one-shot script shells only |
| Engine3D still | Sibling path; fragment hook deferred |

## 4. Build artifacts inventory

| Artifact | Label | Behavior now |
|----------|-------|--------------|
| `aovEncode.js` | **skeleton** | Exports `encodeDepthPng`, `encodeNormalPng`, `writeTriptychAovs`; throw `not implemented` |
| `judge-wow-proton-triptych.mjs` | **skeleton** | Prints USAGE; exit 1 |
| `prompt-scene-to-proton.mjs` | **skeleton** | Prints USAGE; exit 1 |
| `bake-draft-lattice-plate.mjs` | **skeleton** / **declared** | Prints USAGE; exit 1 |
| Dense flags on `render-proton-splat.mjs` | **declared** | Commented TODO in USAGE only |
| Genblaze `main.py` wire | **declared** (out of Builder) | untouched |
| `shadeRasterFragment` | **declared** (out of Builder) | untouched |

## 5. Test placeholders created

| Test | What it asserts today | Later (Implementor) |
|------|----------------------|---------------------|
| `proton/judgeWow.test.js` | Stub exports exist; encode calls throw / skip deep logic | Triptych AOV bytes, hash, 256–512 clamp |
| `genblaze-media/tests/test_proton_raster.py` | Import provider; default enabled off; availability shape keys | HTTP health + subprocess when wired |

## 6. Handoff to Implementor

Fill next, in order:

1. **`aovEncode.js`** — real depth/normal PNG encode from existing DepthField /
   NormalField (or raster float buffers); `writeTriptychAovs` layout for judge.
2. **`judge-wow-proton-triptych.mjs`** — call `runProtonPipeline` + AOV encode;
   clamp 256–512; write evidence with `intentId`.
3. **`prompt-scene-to-proton.mjs`** — invoke prompt-scene bridge then proton
   triptych path (subprocess or shared helpers).
4. **`bake-draft-lattice-plate.mjs`** — optional pre-bake; keep tag honest until
   bake exists.
5. **Genblaze `main.py`** — wire health / endpoint using existing provider;
   expand `test_proton_raster.py`.
6. **`shadeRasterFragment`** on `HeadlessStillRenderer` — optional star/proton
   fragment path; do not break triangle soft-raster.
7. **Dense CLI flags** on `render-proton-splat.mjs` (replace TODO markers).
8. Fill trail `03-implementor-notes.md` with real paths + commands.

**Owner of remaining gaps:** Implementor.  
**Protected paths:** not touched (constitution, AGENTS, policies).
