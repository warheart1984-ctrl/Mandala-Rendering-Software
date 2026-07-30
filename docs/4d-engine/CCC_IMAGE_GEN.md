# CCC-ImageGen — Constitutional Capability Contract

| Field | Value |
|-------|-------|
| **Contract ID** | `CCC-ImageGen` |
| **Capability** | `image.gen.provider` |
| **Status** | **partial** (selection + fallback logging **enforced** in SX adapter tests; remote/CPU/photoreal execution **declared**/**partial**) |
| **Machine SoT** | `sovereign-x/governance/ccc-image-gen.json` |
| **Strategy** | `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` |
| **Date** | 2026-07-30 |

Drive-G-1: do not claim photoreal diffusion pixels unless a provider produced them.
Engine3D soft-raster beauty remains a **separate** local **layout** path — not this contract’s primary SoT.
On R9 380: true local photoreal will not land — see strategy doc.

---

## Rewrite (architecture law)

| Before | After |
|--------|--------|
| Image gen requires sd-server → GPU → **BLOCKED** | Image gen requires a **provider**; local GPU optional |
| Missing GPU halts capability | Fallback `local.cpu` / `remote.gpu` / `remote.service` / photoreal stubs → **NOT BLOCKED** |
| Status: architecture blocked on GPU | Capability still available; log fallback; pixels may be **degraded/partial** |

---

## Layout vs beauty

| Role | Providers | Notes |
|------|-----------|-------|
| **Layout** | `engine3d.soft` (governed-render), `opencl.gen` | Cinematic / structure film; CECP hashed |
| **Held local diffusion** | `local.gpu` (Lemonade) | Held until `pixelsProduced: true` |
| **Beauty (photoreal)** | `photoreal.remote.diffusion`, `photoreal.external.pbr` | remote: stub; external.pbr: GLB Held + Cycles if Blender |

---

## Providers (priority order)

1. `local.gpu` — Lemonade SD on local GPU / ROCm / Vulkan-GPU path (**hold** until `pixelsProduced:true` on this host)
2. `opencl.gen` — first-class OpenCL CL-Gen still (`image.gen.opencl`); prefer when Lemonade down. Not SDXL-in-OpenCL; not Engine3D soft-raster parity (**partial**)
3. `local.cpu` — Lemonade CPU / Vulkan-CPU path, or lawful deferred stub (no fake PNG)
4. `remote.gpu` — remote GPU endpoint (`IMAGE_GEN_REMOTE_GPU_URL`)
5. `remote.service` — remote managed service (`IMAGE_GEN_REMOTE_SERVICE_URL`)
6. `photoreal.remote.diffusion` — remote conditioned beauty (`PHOTOREAL_REMOTE_DIFFUSION_URL`) — **declared**/**partial** stub
7. `photoreal.external.pbr` — local GLB→Cycles (`externalPbrBeauty.js`); export **Held**, Cycles host-dependent — **partial** (optional `PHOTOREAL_EXTERNAL_PBR_URL` for remote stub when local export missing)

Selection: `selectImageGenProvider(env)` in
`sovereign-x/router/modules/gpu/amd/ImageGenProvider.js`.

Beauty (governed-render): `selectPhotorealBeautyProvider(mode, env)` via `--beauty remote|external-pbr`.

---

## Invariant

**At least one provider must be available** (configured and not explicitly disabled).

- Invariant failure → capability status `invariant_fail` (not “GPU blocked”).
- Local GPU down with `opencl.gen` / CPU / remote / photoreal URL configured → capability **available**; `fallbackUsed: true`.
- All providers fail to produce pixels → status **degraded** / **partial** + audit log — never “architecture blocked on GPU”.
- Photoreal stubs without verified pixels must not set `photorealClaim: true`.

---

## Constitutional log (required on select / attempt)

```json
{
  "imageGenProvider": "opencl.gen",
  "localGpuAvailable": false,
  "fallbackUsed": true,
  "reason": "pixels via opencl.gen"
}
```

---

## Honesty bounds

- Never claim GPU beauty plates if fallback did not produce pixels.
- Never invent a photoreal PNG from a deferred stub.
- Lemonade HTTP 500 / sd-server fail ≠ missing CCC; report provider + fallback.
- Soft-raster Engine3D stills are out of scope for `image.gen.provider` (layout via governed-render).
- `opencl.gen` is scene-aware OpenCL (**partial**), not SDXL and not soft-raster parity.
- `--beauty remote` without `PHOTOREAL_REMOTE_DIFFUSION_URL` → deferred stub only.
- `--beauty external-pbr` without Blender → GLB export may be Held; Cycles Blocked/deferred (no fake beauty PNG).
- With `BLENDER_PATH` / Blender on PATH → trail may show `exportStatus: held`, `cyclesStatus: complete`, `pixelsProduced: true` (see `docs/4d-engine/proofs/glb-cross-renderer/`).

---

## Invoke

```bash
# Unit tests (selection + fallback log + CL-Gen wrap + photoreal beauty select)
node --test sovereign-x/tests/ImageGenProvider.test.js sovereign-x/tests/openclGenProvider.test.js sovereign-x/tests/lemonadeSdAdapter.test.js

# CL-Gen still (R9 380 / Tonga)
npm run sx:legacy-efficient -- --intent cl-gen-proof --still --provider opencl.gen --width 512 --height 512
# proof PNG: docs/4d-engine/proofs/cl-gen/opencl-gen-dim-room.png

# Probe: force GPU unavailable → expect fallbackUsed true (opencl.gen preferred)
node sovereign-x/cli/sx-image-gen-provider-probe.mjs --force-gpu-down

# Governed layout + optional beauty select (deferred if remote unset)
npm run mrs:governed-render -- --prompt "dim room soft light" --beauty remote
```

Env knobs:

| Variable | Role |
|----------|------|
| `IMAGE_GEN_DISABLE_LOCAL_GPU=1` | Skip `local.gpu` |
| `IMAGE_GEN_DISABLE_OPENCL=1` | Skip `opencl.gen` |
| `IMAGE_GEN_DISABLE_LOCAL_CPU=1` | Skip `local.cpu` |
| `IMAGE_GEN_REMOTE_GPU_URL` | Enable `remote.gpu` |
| `IMAGE_GEN_REMOTE_SERVICE_URL` | Enable `remote.service` |
| `PHOTOREAL_REMOTE_DIFFUSION_URL` | Enable `photoreal.remote.diffusion` beauty |
| `PHOTOREAL_EXTERNAL_PBR_URL` | Optional remote stub when local GLB export missing |
| `PHOTOREAL_EXTERNAL_PBR_SPEC` | Override SceneSpecification path for GLB export |
| `BLENDER_PATH` | Absolute path to Blender binary for Cycles beauty |
| `PHOTOREAL_CYCLES_SAMPLES` | Cycles sample count (default 64 in provider) |
| `PHOTOREAL_DISABLE_REMOTE_DIFFUSION=1` | Skip remote photoreal |
| `PHOTOREAL_DISABLE_EXTERNAL_PBR=1` | Skip external PBR |
| `IMAGE_GEN_FORCE_PROVIDER` | Pin one provider id (tests) |
| `LEMONADE_BASE_URL` | Local Lemonade API base |
