# Mandala Independence Roadmap (4 phases)

**Status of this document:** **partial** — durable SoT that merges the aspirational 11-week plan with what already runs in-repo.
**Does not claim:** independence from Unreal/Unity/Blender achieved. That remains **declared / aspirational**.
**Does not invent:** AAIS-UL v20. Organ ABI stays `mandala-engine-organ.v1`.
**Extends:** [`MANDALA_ENGINE_ROADMAP.md`](./MANDALA_ENGINE_ROADMAP.md), [`GOVERNED_SYNTHETIC_WORLD_RUNTIME.md`](./GOVERNED_SYNTHETIC_WORLD_RUNTIME.md).
**Phase plan sources (ingested):** [`phases/`](./phases/) (copied from `/tmp/*-plan.md` + implementation roadmap).
**White paper (Claim A holography / constitutional graphics):** [`whitepapers/MANDALA_HOLOGRAPHIC_GRAPHICS.md`](./whitepapers/MANDALA_HOLOGRAPHIC_GRAPHICS.md) · index [`README.md`](./README.md).

Tags: **enforced** · **partial** · **skeleton** · **declared** · **blocked-with-evidence**.

---

## Organ Map (no new organs)

Story Forge · Mandala · Simulation Chamber · AI Painter · Mythar · AAIS · Movie Lane.

Renderer must not mutate certified state (proto proof 4).

---

## Already working (pre-phase baseline)

| Area | Status | Evidence |
|------|--------|----------|
| Proto four proofs | **enforced** | `mandala/proto/test/four-proofs.test.js` |
| Holographic bulk ↔ boundary (Claim A) | **partial** (toy encode/reconstruct; not AdS/CFT) | [`HOLOGRAPHIC_BULK_BOUNDARY.md`](./HOLOGRAPHIC_BULK_BOUNDARY.md), `mandala/holography/` |
| Certified state + AAIS gate (proto) | **partial** / working at tiny scale | `mandala/proto/certified-state.mjs`, `aais-gate.mjs` |
| H_gov / Hamiltonian organ hook | **partial** | `mandala/engine/hamiltonian/` |
| Engine e2e | **partial** | `mandala/engine/run-e2e.mjs`, `mandala/engine/test/e2e.test.js` |
| Scene graph | **skeleton** → **partial** | `mandala/engine/scenegraph.mjs` |
| Character shader contracts | **partial** (JSON + WGSL + CPU library) | `character/shaders/` |
| RT4D CPU path tracer | **partial** | `mrs/packages/renderer-core/src/render/rt4d/` |
| RT4D GPU / WebGPU shade | **partial** / often **blocked-with-evidence** in Node | `gpu/RT4DGPURenderer.js`, `gpu/shaders.js` |
| Dolphin / actor LLM cinematic path | **partial** | Simulation Chamber scripts (honesty: `--solver pose` = `notGradV`) |

---

## Phase status after this pass

| Phase | Goal | Status | Already exists | Gap |
|-------|------|--------|----------------|-----|
| **1** Shader wiring | Character materials selectable on shade path | **partial** | Registry, serializer hook, SHADE stand-in BRDF branches, CPU proof still | Full GPU beauty; character `*.wgsl` signatures not drop-in compatible with SHADE MaterialData; WebGPU often unavailable in Node/CI |
| **2** Certified state store | AAIS-signed immutable state API | **partial** (proto) / **skeleton** (rt4d parallel) | Proto certified hash + gate; `rt4d/state/state-store.js` aspirational twin | Do not treat rt4d store as SoT over proto; no production crypto; REST `/api/mandala/state` not the proto authority |
| **3** Post-processing | TAA / denoise / tonemap / bloom | **skeleton** | CPU `PostProcessor.js` stubs; proton tonemap helpers | GPU TAA absent; no &lt;15ms@1080p claim; AI denoise not wired |
| **4** Constitutional runtime loop | Story→Chamber→AAIS→render→Movie Lane | **partial** (proto e2e) / **skeleton** (rt4d runtime class) | Proto loop + proof 4; engine SDK `propose`/`project` | Closed production runtime API; GPU+CPU pixel identity; full organ orchestration |

**11-week timeline:** aspirational scheduling only. Do not stamp exit criteria as met.

---

## Phase 1 — Character shader wiring (**partial**)

### Intent
Wire `character/shaders/*.json` (+ WGSL paths) into RT4D material selection so a material id (`skin` / `fur` / `metal` / `fabric` / `leather`) reaches the shade path. Full film beauty is **not** required for **partial**.

### Delivered this pass

| Deliverable | Path | Status |
|-------------|------|--------|
| Material registry | `mrs/packages/renderer-core/src/render/rt4d/material/CharacterMaterialRegistry.js` | **partial** |
| GPU pack hook | `mrs/packages/renderer-core/src/render/rt4d/gpu/sceneSerializer.js` (`packMaterials`) | **partial** |
| Shade branches (stand-in BRDFs) | `mrs/packages/renderer-core/src/render/rt4d/gpu/shaders.js` (`SHADE_WGSL`) | **partial** — stand-ins, not verbatim `character/shaders/*.wgsl` |
| CPU BRDF stub by material id | registry `evaluateCharacterBrdfCpu` | **partial** |
| Proof still (64×64) | `docs/mandala/evidence/phase1-character-material/` | **partial** |
| Tests | `CharacterMaterialRegistry.test.js`, integration + round-trip | **partial** |

### Honest blockers

1. **WGSL contract mismatch:** `character/shaders/skin.wgsl` uses `SkinMaterial` + `vec3` args; SHADE uses `MaterialData` + `vec4`. Stand-in BRDFs live in `SHADE_WGSL`; registry still loads WGSL for provenance/hash.
2. **CPU RT4D does not execute WGSL.** Proof uses CPU stub keyed by character enum.
3. **WebGPU / VulkanRhi:** Node proof does not require live GPU; full beauty remains **blocked-with-evidence** without a WebGPU device (or Vulkan compute path).
4. **Hardware:** prefer ≤128×128 on FX-8350 / 15GB / RX 580.

### Commands

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/material/CharacterMaterialRegistry.test.js
node --test mrs/packages/renderer-core/src/render/rt4d/material/CharacterMaterialIntegration.test.js
node mrs/packages/renderer-core/scripts/prove-character-material.mjs --material skin --width 64 --height 64
```

---

## Phase 2 — Certified state (**partial** proto / do not re-implement)

**Already exists:** `mandala/proto/certified-state.mjs`, `aais-gate.mjs`, mass-conservation reject, deterministic hash, proof 4 (render does not mutate certified buffers).

**Gap vs `/tmp` plan:** dedicated `state-store.ts` under chatgpt-plugin, ECDSA signatures, REST certify API as product surface. `rt4d/state/*` is a parallel sketch — prefer proto + `mandala/engine/aais/` as authority. **Do not fully implement in this pass.**

---

## Phase 3 — Post-processing (**skeleton**)

**Already exists:** CPU orchestrator stubs under `rt4d/postprocess/`; proton tonemap helpers.

**Gap:** GPU TAA / SS denoise / bloom chain; performance targets unmet and unmeasured on this box. **Do not fully implement in this pass.**

---

## Phase 4 — Constitutional runtime loop (**partial** proto)

**Already exists:** proto Chamber → AAIS → certified → Mandala project → Movie Lane observer; engine e2e/SDK; organ map.

**Gap:** single production `ConstitutionalRuntime` product API with GPU renderer + Movie Lane assembly; `rt4d/runtime/constitutional-runtime.js` is skeleton relative to proto. **Do not fully implement in this pass.**

---

## Success metrics (honest)

| Metric | Claim allowed now? |
|--------|--------------------|
| Character material id selects shade branch / CPU stub | **partial** yes |
| Skin SSS / fur anisotropic film-quality | **no** (stand-in) |
| Independence from Unreal/Unity/Blender | **no** — aspirational |
| Proto four proofs still pass | required regression |
| Post &lt; 15ms @ 1080p | **no** |
| Full AAIS crypto + REST state store | **no** |

---

## Next steps

1. Keep Phase 1 advancing toward signature-compatible WGSL include or SPIR-V modules.
2. Prefer proto certified state over duplicating stores.
3. Post-process only after a stable GPU frame buffer exists.
4. Close runtime loop on proto/engine organs, not a third parallel runtime.
