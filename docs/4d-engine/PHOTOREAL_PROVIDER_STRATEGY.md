# Photoreal Provider Strategy

| Field | Value |
|-------|-------|
| **Status** | **partial** (layout Held; remote beauty stub; external PBR export **Held** / Cycles **complete** when Blender available) |
| **Date** | 2026-07-30 |
| **Drive-G-1** | Claims must not exceed evidence. Soft-raster ≠ photoreal. |
| **Machine footing** | `sovereign-x/governance/ccc-image-gen.json` · `ImageGenProvider.js` · `externalPbrBeauty.js` |
| **CCC** | `docs/4d-engine/CCC_IMAGE_GEN.md` |
| **CECP** | `docs/governance/cecp/trails/photoreal-provider-strategy-2026-07/` |
| **Photoreal evidence (Phase 2)** | `docs/4d-engine/evidence/` · `schemas/ciems/` · trail `photoreal-evidence-pep-spr-2026-07` (**partial**) |
| **Cross-renderer proof** | `docs/4d-engine/proofs/glb-cross-renderer/` · `tmp/glb-repro/` |

---

## Durable separation (architecture)

| Layer | Owns | Artifact |
|-------|------|----------|
| Constitutional pipeline | Scene generation + provenance | Deterministic GLB + provenance JSON |
| Blender/Cycles (or other GLB consumer) | Photoreal execution | Beauty PNG / film plate |

Same GLB + provenance = compatible execution target for any GLB-capable renderer. Soft-raster Engine3D layout remains separate from Cycles beauty plates.

---

## Honest bound (R9 380 / current host)

**True photoreal will not land locally on R9 380-class hardware** via Lemonade/diffusion in this repo’s present stack.

Missing for local *diffusion* photoreal:

- Heavy global illumination (path-traced GI at film quality on local diffusion)
- Hi-res PBR texture / material libraries at production fidelity
- Modern diffusion (SDXL-class) running with consistent `pixelsProduced: true`

**External PBR (Cycles)** is a separate path: SceneSpecification → GLB export is **Held**; Cycles beauty runs when Blender is on PATH or `BLENDER_PATH` is set. Soft-raster Engine3D / held Lemonade remain **not** photoreal beauty plates by themselves.

**Honest path today:** keep Engine3D / CL-Gen as **governed layout + cinematic base**; optional photoreal beauty via remote diffusion **or** local GLB→Cycles when Blender is available.

---

## Three realistic paths

### 1. Hybrid (preferred near-term) — **declared** / **partial**

| Stage | Role | Status |
|-------|------|--------|
| Engine3D soft / CL-Gen (`opencl.gen`) | Governed **layout** + cinematic base; CECP trail + content hashes | **partial** (pixels exist) |
| External photoreal (SDXL etc.) | Conditioned **beauty transform** on layout / constraints | **declared** (stub: `photoreal.remote.diffusion`) |
| Trail | Layout hashes + beauty provider selection + verification record | **partial** |

Photoreal = governed beauty pass, not a replacement for constitutional layout.

```text
prompt → VII/VIII soft wrap → layout (engine3d.soft | opencl.gen)
       → [optional] photoreal.remote.diffusion beauty
       → verification trail (hashes, provider ids, deferred flags)
```

### 2. Hardware upgrade — **declared**

| Requirement | Role |
|-------------|------|
| Lemonade on RTX / ROCm-capable GPU | Local `lemonade.diffusion` / `local.gpu` with real pixels |
| One-command | `engine3d.soft` layout + `lemonade.diffusion` photoreal under governed-render |

Lemonade remains **held** on this host until `pixelsProduced: true` consistently. Do not promote held Lemonade to production beauty.

### 3. External PBR — **partial** (export **Held**; Cycles **complete** with Blender)

| Stage | Role | Status |
|-------|------|--------|
| Export | SceneSpecification → GLB (`render-glb.mjs` / `glbExporter.js`) | **Held** (valid GLB; same seed → identical SHA-256) |
| Cycles | Blender Cycles via `render-glb-cycles.py` (+ `.bat` / `.sh`) | **complete** when `BLENDER_PATH` / PATH provides Blender; else Blocked |
| Provider | `photoreal.external.pbr` via `externalPbrBeauty.js` | **partial** (export Held; Cycles pixels verified on host) |
| Return | Pixels + verification record when Cycles writes PNG | trail: `exportStatus: held`, `cyclesStatus: complete` |

```text
prompt → VII/VIII soft wrap → layout (engine3d.soft)
       → [optional] --beauty external-pbr
            → GLB export (Held) under run/external-pbr/
            → Cycles beauty PNG if blender available
       → verification trail
```

CLI (renderer-core):

```bash
cd mrs/packages/renderer-core
node scripts/render-glb.mjs --spec examples/scene-spec-tesseract.json --output scene.glb --provenance provenance.json
# Windows:
set BLENDER_PATH=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe
scripts\render-glb-cycles.bat scene.glb cycles.png 32 256 256
```

Treat the external renderer as a **constitutional provider**, not an ad-hoc side script.

**Verified host evidence (2026-07-30):**

| Gate | Result |
|------|--------|
| Blender | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |
| GLB SHA-256 | `3ebe5d8fc4ac41d7cdba80bb65994d8e2d164ae6defae2bf4bfd1ede7fefbf1e` (12 622 660 bytes) |
| Dual GLB | byte-identical |
| Dual Cycles | PNG **file** hashes differ; decoded RGBA **pixel** hashes identical (`seed=0`) |
| Governed-render `--beauty external-pbr` | `exportStatus: held`, `cyclesStatus: complete`, `pixelsProduced: true` |
| Proof pack | `tmp/glb-repro/` · `docs/4d-engine/proofs/glb-cross-renderer/` |

---

## Provider map (constitutional)

| Provider id | Role | Status | Enable |
|-------------|------|--------|--------|
| `engine3d.soft` | Layout / cinematic base (governed-render primary) | **partial** | `--provider engine3d.soft` / `auto` |
| `opencl.gen` | Layout assist (CL-Gen OpenCL) | **partial** | CCC cascade / `--provider opencl.gen` |
| `local.gpu` / Lemonade | Local diffusion | **held** until `pixelsProduced: true` | CCC; not beauty SoT while held |
| `photoreal.remote.diffusion` | Remote / conditioned beauty diffusion | **declared** / **partial** stub | `PHOTOREAL_REMOTE_DIFFUSION_URL` |
| `photoreal.external.pbr` | External PBR (local GLB→Cycles) | **partial** (export Held; Cycles when Blender) | `--beauty external-pbr`; `BLENDER_PATH`, `PHOTOREAL_CYCLES_SAMPLES` |

Layout providers produce structure film. Photoreal providers are optional beauty; stubs / deferred paths must **not** emit a PNG labeled as photoreal beauty without real Cycles/remote pixels.

---

## Governed-render beauty flag

```bash
npm run mrs:governed-render -- --prompt "dim room soft light" --beauty remote
npm run mrs:governed-render -- --prompt "dim room soft light" --beauty external-pbr
```

| `--beauty` | Behavior |
|------------|----------|
| `none` (default) | Layout only (`engine3d.soft`); trail `photoreal: false` |
| `remote` | Select `photoreal.remote.diffusion`; if URL unset → **deferred stub** (no fake beauty PNG) |
| `external-pbr` | Select `photoreal.external.pbr`; run GLB export into `<run>/external-pbr/`; Cycles beauty PNG when Blender available — else export **Held**, Cycles **Blocked/deferred** |

Selection helper: `selectPhotorealBeautyProvider(mode, env)` in
`sovereign-x/router/modules/gpu/amd/ImageGenProvider.js`.
Implementation: `externalPbrBeauty.js`.

---

## What is not claimed

- Soft-raster Engine3D stills are not photoreal.
- CL-Gen / `opencl.gen` is not SDXL and not soft-raster parity with Engine3D.
- Lemonade HTTP failures or deferred stubs are not missing architecture — they are held / partial providers.
- Configuring `--beauty remote` without a remote URL does **not** invent beauty pixels.
- GLB export alone is **not** a photoreal beauty plate — Cycles (or equivalent) must write verified PNG bytes.
- Cycles PNG **file** SHA-256 may differ across identical settings (encoder); compare **pixel** hashes for reproducibility.
- Overall photoreal status remains **partial** (not production-certified film pipeline).

---

## Next evidence gates (roadmap — not present capability)

1. Remote diffusion endpoint returns bytes + hash recorded as `beautySha256` with `photoreal: true` only when provider id is a photoreal.* producer.
2. Hardware path: Lemonade `pixelsProduced: true` on capable GPU under one-command.
3. Second GLB consumer (Godot / three.js) renders the same `tmp/glb-repro/scene.glb` with recorded pixel hashes.

Until a second renderer (or remote beauty) is verified, cross-renderer status is **started** (Cycles proved; others declared).
