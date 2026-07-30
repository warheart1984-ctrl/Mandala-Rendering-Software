# 03 — Implementor notes: cinematic-quality-v2 (+ Genblaze SX / Lemonade)

**Trail:** `cinematic-quality-v2-2026-07`  
**Stage:** Implementor  
**mode:** Constructor + Artisan  
**Intent:** memorable first-10s visuals within Engine3D soft-raster honesty; probe Genblaze SX → Lemonade for optional beauty plates.

## What shipped (Engine3D soft-raster — primary)

| API / path | Status |
|------------|--------|
| DOF proxy, temporal MB, color grade, dust, contact shadow | **enforced** (unit tests) |
| `createDramaticCinematicLightRig` + micro-grain materials | **enforced** |
| `--cinematic-v2` showcase @ 24 fps | **partial** (proof artifacts) |
| First-10s MP4 | **enforced** (file present) |
| ~30s remaster | **enforced** (720 frames @ 24fps) |

### Proof paths

```
tmp/book-movie-ch1/showcase-cinematic-v2/
  archive-of-consent-ch1-first-10s.mp4
  stills/engine3d-02-dim-room-cinematic-v2.png
  stills/before-02-dim-room-upgrade.png
  stills/before-after-02-dim-room.png
```

Tests: `mrs/packages/engine3d-core` raster-upgrade **13/13 PASS**.

## Genblaze SX + Lemonade probe (this host, 2026-07-30)

| Probe | Result | Tag |
|-------|--------|-----|
| Lemonade `/api/v1/models` | HTTP 200; `SD-Turbo` **downloaded:true** | **enforced** (catalog) |
| Lemonade `images/generations` SD-Turbo | HTTP 500 `model_load_error`: **sd-server failed to start or become ready** | **blocked** (runtime) |
| SD-Turbo-GGUF same | same `sd-server` failure | **blocked** |
| Genblaze `18080` + `GENBLAZE_IMAGE_BACKEND=lemonade` `/health` | ok | **enforced** (service up) |
| Genblaze `/api/sx/schedule` lemonade | CIS `AUTH→CONT→ENRG→EXEC→HALT`; error mirrors Lemonade 500 | **enforced** (honest halt) |
| Simulated plates for showcase compose | **not used** — no real diffusion bytes | **declared** gap |

### Compose rule (when Lemonade works later)

1. Engine3D cinematic-v2 remains the **camera reel / structure** SoT.  
2. Genblaze SX CIS (AUTH…SYNC) may attach Lemonade stills as **beauty plates / grade refs** only — not as structure_source.  
3. `SX_DEMO_MODE=1` simulates images for CIS demos — **must not** be labeled GPU beauty in README.

## Gaps

- Full GI / SSR / optical DOF / true volumetrics — soft-raster approx only  
- Photoreal humans — fixture `HumanFaceRigged.glb`  
- Lemonade SD on R9 380 / this host — **still blocked** at sd-server start despite model pull  
- WebGPU — **skeleton**

## Conformance

None of the 16 CKL checks — Engine3D / tmp showcase / Genblaze app host only. No charter edits.
