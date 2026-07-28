# Proton raster bridge (MRS adapter)

Out-of-process / local adapter for:

**Prompt → CIR (thin IntentRecord overlay) → Scene/World → RT4D protons → CPU isotropic soft splat**

STATUS: **enforced** (CLI MVP). Genblaze host wiring remains **partial**. Soft splat is a **new sibling path** — not Engine3D triangle soft-raster.

## Why CIR is thin

CIR maps IntentRecord fields only: `id`, `actor`, `timestamp`, `purpose` (← goal/type). No parallel CKL or second authority plane.

## Run

```bash
# Help
node mrs/adapters/proton-raster-bridge/run_proton_pipeline.mjs --help

# Demo hyperspheres → PNG + evidence
node mrs/adapters/proton-raster-bridge/run_proton_pipeline.mjs --demo --width 256 --height 256 --output output/proton-pipeline.png

# Optional scene-spec
node mrs/adapters/proton-raster-bridge/run_proton_pipeline.mjs --scene-spec path.json --output out.png

# renderer-core CLI
node mrs/packages/renderer-core/scripts/render-proton-splat.mjs --demo --width 256 --height 256 --output output/proton-splat.png
```

## Package layout

| Path | Role |
|------|------|
| `mintCir.js` | `mintCir()` → CirOverlay (**enforced**) |
| `run_proton_pipeline.mjs` | End-to-end pipeline (**enforced**) |
| `schemas/proton-raster-request.schema.json` | Request shape (**declared**) |
| `schemas/proton-raster-evidence.schema.json` | Evidence shape (**declared**) |
| `CONTRACT.md` | Honest status tags |

Core algorithms live in:

`mrs/packages/renderer-core/src/render/rt4d/proton/`

## Genblaze (optional)

`mrs/apps/genblaze-media/app/proton_raster_provider.py` is **disabled by default** (**partial**). `main.py` left unwired on purpose. Env: `PROTON_RASTER_ENABLED=0`.

Hard edge: Genblaze `app/*.py` must not contain banned narrative-package strings.

## Protected paths (do not touch)

- HeadlessStillRenderer / triangle soft-raster
- `constitution/`, `engine/constitution/`, `AGENTS.md`, `default.policies.json`
