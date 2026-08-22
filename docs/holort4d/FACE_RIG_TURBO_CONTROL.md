# Face Rig Turbo Control (HoloRT4D + SD-Turbo)

**Status:** `enforced` — 3-map CPU render + CPF-4D snapshot · `partial` — sd-server img2img · `declared` — ControlNet composite stack

## Honest prior state

The original `renderRigWithNumbers` output was a **2D orthographic debug plot**: `project(x,y)` with **z dropped**. That was topology visualization, **not** a rig.

This pass upgrades to a **3-map rig**:

| Output | Role | SD conditioning |
|--------|------|-----------------|
| `depth.png` | Restores dropped z as grayscale splats | ControlNet **Depth** |
| `topology.png` | Bone-colored edges + landmark IDs + blendshape bar | ControlNet **OpenPose** / **Tile** (or img2img init) |
| `flow.png` | Optical flow from temporal landmark velocity | HoloRT4D `PathSample.opticalLength` prior |

## Data structures

```javascript
// face-rig-state.js
Landmark3D = { id, x, y, z, bone, controls[], velocity? }
FaceRigState = {
  landmarks: Landmark3D[],   // 68 dlib-style
  blendshapes: Float32Array, // 52 ARKit
  bones: { name, pos, rot }[],
  temporal: { prevLandmarks, dt, opticalFlow },
  fieldId: string
}
```

`LANDMARK_TO_CONTROL` regions: jaw 0–16, brows 17–26, nose 27–35, eyes 36–47, mouth 48–67.

## Pipeline

```
FaceRig (blendshapes + headPos/headRot)
  → buildFaceRigState()
  → renderAllTurboControls()
       depth.png | topology.png | flow.png
  → buildFaceRigSnapshot() — CPF-4D 58 floats + metadata
  → buildCanonicalEnvelope() + control hashes in provenance
  → sd-server img2img (topology.png init) — partial
```

## Run

```bash
# Control maps only (no GPU SD)
node scripts/face-rig-turbo.mjs --skip-sd

# With sd-server @ :13306 (RX 580 demo path)
node scripts/face-rig-turbo.mjs

# Photoreal mode — lower img2img strength so control guides structure, not texture
node scripts/face-rig-turbo.mjs --photoreal --init depth --output photoreal-v1.png --sd-strength 0.55
node scripts/face-rig-turbo.mjs --photoreal --init depth --output photoreal-v2.png --sd-strength 0.65
node scripts/face-rig-turbo.mjs --photoreal --init depth --output photoreal-v3.png --sd-strength 0.72
# topology init at low strength tends toward B&W sketch on Polaris SD-Turbo — use depth instead
```

Output: `output/holort4d-human/face-rig-control/`

## SD-Turbo conditioning notes

- **sd-server** A1111 img2img accepts one init image. This script uses **`topology.png`** as init (bone topology + readable landmark bar).
- Default cinematic path: `denoising_strength=0.92`, 1 step (or `--sd-steps 4` for lighting). High strength bakes topology colors/edges into skin as a painterly texture (sepia, cellular bubbles).
- **Depth** and **flow** maps are emitted for HoloRT4D and documented ControlNet routing; full 3-map composite requires ComfyUI GGUF workflow (`declared`).
- Recommended ComfyUI stack when available:
  - Depth → ControlNet Depth (weight ~0.6)
  - Topology → ControlNet OpenPose or Tile (weight ~0.4)
  - Flow → feed `temporal.opticalFlow` into PathSample finalize (`declared`)

## Photoreal tuning (`--photoreal`)

**Status:** `partial` — improves over default img2img but SD-Turbo @ 512×512, 4 steps is not commercial photoreal.

### Why the default looks like an oil painting

| Symptom | Likely cause |
|---------|----------------|
| Sepia / warm wash | Topology init colors bleed through at high denoise |
| Cellular / bubbly skin | Landmark splats + bone edge colors interpreted as skin texture |
| Illustration edges | `strength≈0.92` preserves too much init pixel structure |
| Missing pore detail | 4-step SD-Turbo + img2img, not txt2img with photo prompts |

Reference: `output/holort4d-human/human.png` was pure SD-Turbo txt2img (no control init) — structure came from prompt only.

### `--photoreal` defaults

| Param | Cinematic default | Photoreal |
|-------|-------------------|-----------|
| `--sd-strength` | 0.92 | **0.65** (override 0.55–0.72) |
| `--sd-steps` | 1 (use 4 for faces) | **4** |
| `--sd-cfg` | 1.0 | 1.0 |
| Init | `topology.png` | same — structure only at lower strength |
| `--init depth` | — | optional: z grayscale init avoids landmark number/color bleed |
| Prompt | cinematic key/fill | RAW photo, 35mm, skin pores, f/2.8 |
| Negative | deformations | oil painting, sepia, illustration, plastic |

Tune strength: **lower (0.55)** = softer form lock; **higher (0.72)** = tighter depth adherence, more z-splat texture risk.

**Polaris finding (2026-08):** `topology.png` @ strength 0.55–0.72 + photo prompts → B&W ink bust (landmark numbers/lines dominate). **`depth.png` init** @ 0.65 → sculptural grayscale portrait, least painterly of variants; still not color photoreal.

**Color portrait finding (2026-08):** `photoreal-v3-fixed.png` prior @ 0.45–0.72 keeps ink sketch lines — does not colorize. **`depth.png` init @ 0.75–0.85** → warm freckled color skin, photographic; best = `color-portrait-depth-0.80.png`.

### Honest limits

- SD-Turbo 512×512 4-step img2img: **`partial` photoreal** — good demo, not production portrait.
- Full commercial photoreal needs: more steps (20+), SDXL/Flux-class model, ControlNet Depth+OpenPose stack (not single init), or path-traced HoloRT4D radiance second pass (`declared`).
- Do not claim `enforced` photoreal from this script alone.

### Outputs

Variants: `output/holort4d-human/face-rig-control/photoreal-v*.png`

## Color portrait tuning (`--color-portrait`)

**Status:** `partial` — adds warm skin color + freckle prompts over grayscale bust prior; not the sepia close-up target.

Transforms the sculptural grayscale bust (`photoreal-v3-fixed.png`) or `depth.png` into a **color photographic portrait** while preserving face geometry.

### `--color-portrait` defaults

| Param | Value |
|-------|-------|
| `--sd-strength` | **0.55** (override 0.45–0.60) |
| `--sd-steps` | **4** |
| `--init` | **`prior`** → `photoreal-v3-fixed.png`; fallback `depth.png` |
| `--init depth` | z-grayscale init (skip prior bust) |
| Prompt | RAW photo, freckles, warm skin, cream/beige, dark brows, shallow DOF |
| Negative | grayscale, sketch, pencil, ink, illustration, monochrome, plastic |

```bash
# Best path: depth init @ high strength (prior sketch resists colorization)
node scripts/face-rig-turbo.mjs --color-portrait --init depth --output color-portrait-best.png --sd-strength 0.80
# Prior bust sketch → mostly stays sketch even with color prompts
node scripts/face-rig-turbo.mjs --color-portrait --output color-portrait-v1.png --sd-strength 0.55
node scripts/face-rig-turbo.mjs --color-portrait --init depth --output color-portrait-depth.png --sd-strength 0.55
```

Reference style target: warm sepia/cream close-up with freckles and natural skin texture (photographic, not sketch).

### Honest limits

- SD-Turbo 512×512 4-step img2img from bust sketch: **`partial` color photoreal** — geometry lock good; freckle/warm-skin match incomplete vs style target.
- `human.png` txt2img reference had no control init; color-portrait must img2img from rig prior.
- Full match to sepia freckle close-up needs SDXL/Flux or inpaint face refine pass (`declared`).

Variants: `output/holort4d-human/face-rig-control/color-portrait-v*.png`

## Tests

```bash
node --test mrs/packages/renderer-core/src/render/rt4d/holort4d/holort4d.test.js
```

Covers: Landmark3D z non-zero, LANDMARK_TO_CONTROL coverage, depth map varies with z.

## Partial vs enforced

| Component | Tag |
|-----------|-----|
| `buildFaceRigState` | enforced |
| `renderDepthMap` / `renderColoredByBone` / `renderFlow` | enforced |
| `buildFaceRigSnapshot` + canonical envelope | enforced |
| Bone IK from mesh | declared (head cluster stub) |
| sd-server img2img | partial |
| ControlNet 3-map composite | declared |
| secondPass PathSample from turbo radiance | declared |
