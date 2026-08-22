# HoloRT4D — wave-optics compiler target

**This is not projection.** Collapse is not the point.  
**This is not bulk-boundary holography.** `EntanglementRenderer` / ρ / \(h_{ij}\) / COMPOSITE stay in `mandala/holography/`.  
**This is wave optics:** \(E = A e^{i\varphi}\), optical-path phase, SSBO Monte Carlo accumulation, phase-only encode.

Status tags follow AGENTS.md: **enforced** / **partial** / **declared** / **skeleton**.

SoT module: `mrs/packages/renderer-core/src/render/rt4d/holort4d/`  
Stub to ignore: `mrs/packages/renderer-core/src/render/rt4d/holographic/` (leftover; not this contract).

HoloRT4D is a **downstream Set4/Set5** of existing RT4D path buffers. It does not rewrite RT4D core, raygen, shade, or EntanglementRenderer.

## Frozen RT4D → HoloRT4D contract (locked)

`PathSample` is **64 bytes**, 4× vec4, 16-byte aligned. Do not change this layout.

```
struct PathSample {
    pos: vec3f,          // 0-11
    _pad0: f32,          // 12-15
    dir: vec3f,          // 16-27
    wl: f32,             // 28-31
    radiance: vec3f,     // 32-43
    weight: f32,         // 44-47
    opticalLength: f32,  // 48-51  FINALIZE ONLY
    pixelId: u32,        // 52-55  FINALIZE ONLY
    bounceId: u32,       // 56-59  FINALIZE ONLY
    _pad1: u32,          // 60-63
};
```

**PathFinalize** runs **once** after `for b in maxBounces { traceBounce() }`. It writes only the last 16-byte chunk. Per-bounce finalize races accumulation. CPU: **enforced**. GPU hook (adapter after RT4D shade loop, no BVH rewrite): **partial**.

**Bind groups:** RT4D owns sets 0–3. HoloRT4D uses its **own** `createPipelineLayout()` — it does not import RT4D layouts.

Logical names stay “Set 4 / Set 5” (downstream of RT4D). Physical WebGPU indices on Holo’s pipeline are **0 (tiles)** and **1 (phase)**. Empty 0–3 placeholders would need `maxBindGroups=6` and fail WebGPU’s default (and RT4D’s `requiredLimits.maxBindGroups: 4`).

- Logical Set 4 / physical 0: TileHeaders, TileEntries, complexField, pathSamples
- Logical Set 5 / physical 1: phaseTexture, params

**Gate:** missing `opticalLength` or `pixelId` is rejected **before** accumulation. **enforced**.

See [CONTRACT.md](./CONTRACT.md) (projection \(\mathcal{R}\)) and [ROSETTA.md](./ROSETTA.md) (shared \(X/t\)/camera/provenance only). Rosetta does not share \(\Pi\).

---

## Three holography contracts (do not fuse)

| # | Contract | SoT | What it does | Status |
|---|----------|-----|--------------|--------|
| 1 | **Projection (math4d)** | `CONTRACT.md` · `transformPipeline` | \(I=\mathcal{R}(\Pi_{3\to2}[\Pi_{4\to3}(R_4 X)])\). Collapse is the point. | JS/CPU stages 1–5 **enforced** |
| 2 | **Bulk-boundary** | `mandala/holography/` | EntanglementRenderer, ρ / \(h_{ij}\) / K, COMPOSITE, chamber `--holo` | **partial**. Not wave optics. |
| 3 | **Wave optics (HoloRT4D)** | this note + `holort4d/` | Frozen PathSample + Polar tiled accumulate. Optional `atomic<f32>` gated behind `shader-float32-atomic`. Polar Vulkan may compile float atomics; hardware does not guarantee true atomicity. | PathSample / finalize / gate **enforced**. Polar tiled GPU **partial** (workgroups/bind groups **enforced**). Snapshots CPU **enforced**, Vision Bridge **partial**. CIEMS hashes **enforced**. Physical validity **declared**. |

---

## Pipeline (Set4, after RT4D)

```
RT4D_RayGen          → pixelId = py * frameWidth + px   (adapter: idx already is this)
RT4D_Shade           → multi-bounce paths
RT4D_PathFinalize
HoloRT4D_BinPaths    → pixelId → holo pixel → tileId (camera-aligned, no world-to-plane)
HoloRT4D_Tiled              // Polar primary — no atomic<f32>, wg 16×16
HoloRT4D_AccumulateAtomic   // RX 7000+ only, gated by supportsFloatAtomic; off on Polar by default
HoloRT4D_Propagate          // optional, declared
HoloRT4D_PhaseEncode        // tiled: f32 reads; atomic path: atomicLoad. Polar uses f32.
HoloRT4D_DebugRealImag      // optional debug encode — Re/Im channels, NOT atan2. CPU enforced, GPU declared.
```

Buffers: `HoloCameraUBO`, `HoloFieldBuffer` (SSBO), `HoloTileBins` (optional), `PhaseImage`.

---

## A. Raygen-aligned tiles (locked)

RT4D raygen (`raygen.wgsl`): `idx = gid.x`, `px = idx % width`, `py = idx / width`. Frozen `PathSample` lives in `holort4d/path-sample.js` + WGSL. RT4D shade/BVH is not rewritten; PathFinalize is a post-loop adapter (`pixelId === idx` when one thread per pixel). GPU hook **partial**.

- Same-res: `holoX = px`, `holoY = py`
- Else integer scale: `holoX = px * holoResX / frameWidth` (truncating)
- `tileId = tileY * numTilesX + tileX`, `TILE_SIZE = 16`
- `HoloRT4D_BinPaths.comp`: `atomicAdd(headers[tileId].count, 1)` then `entries[offset+writeIndex].pathIndex = idx`
- Camera-aligned mode: **no** world-to-plane reprojection
- World-to-plane projection: separate **declared** mode

Wavefront `tileSize` 32/16/8 (`WAVEFRONT_QUALITY_DEFAULTS`) is a quality knob, not a TileBin SSBO. HoloRT4D **adapts** the 16×16 convention; it does not reuse a bin buffer that does not exist.

---

## Accumulator patterns

| Pattern | Contract | Polar | Status |
|---------|----------|-------|--------|
| **1. Direct SSBO `atomicAdd` on float** | Baseline. `atomicAdd(field[i].real, amp*c)` + imag. Canonical MC sum. | User-locked Polar pattern. Core GLSL/Vulkan 1.0 has no float `atomicAdd`; `VK_EXT_shader_atomic_float` / `shaderBufferFloat32AtomicAdd` is documented by AMD for RX 7000, **not** GCN4 Polar. Polar Vulkan **may compile**; hardware does **not** guarantee true atomicity. Off by default on Polar. | CPU linear sum **partial**. GPU dispatch **declared** (gated `supportsFloatAtomic`). Polar float-atomic: **declared hardware gap**. Integer/fixed-point: **declared fallback** — not a silent replacement. |
| **2. Shared-memory tiling** | 16×16, SoA + pad: `tileReal[16][16+1]`, `tileImag[16][16+1]`, stride 17, 32 Polar banks. CPU prefix-sum offsets. BinPaths: **u32 `atomicAdd` on count only**, workgroup **256**. TiledAccumulate: one writer per pixel, workgroup **16×16**, **no `atomic<f32>`**. Local coords use BinPaths map (`px = pixelId % frameWidth`, `holoX = px * holoResX / frameWidth`, `lx = holoX % 16`) — **not** `pixelId % 16` unless the frame is 16 px wide. | Polar primary. | CPU **enforced**. GPU dispatch **partial** (wired: Set 4/5, prefix-sum before BinPaths, workgroup sizes **enforced** in tests). Live Polar pass not claimed. |
| **3. Multi-pass reduction** | Per-path buffer, segmented reduce. 8K×8K. | Not needed unless IMAX. | **declared** |

**Do not** use `imageLoad`/`imageStore` RMW. That is a race, not an accumulator.

---

## RGB (cannot fake with one λ)

Three SSBOs: `fieldR`, `fieldG`, `fieldB`. Defaults λ = 650 / 530 / 450 nm. `path.wl` overrides the nearest channel. Six atomicAdds (Re/Im × RGB). CPU independent-wavelength sum: **partial**. Physical RGB SLM: **declared**.

---

## Invariant `HOLORT4D-MC-LINEAR`

A hologram is a Monte Carlo integral over complex amplitudes.  
The accumulator must be **linear, deterministic, and race-free**.  
SSBO atomic or shared-memory tile satisfies this. Physical validity remains **declared**.

---

## Debug suite (GPU **declared**)

| Tool | What | CPU | GPU |
|------|------|-----|-----|
| `Debug_HoloTiles.frag` | Cornell `rt4dColorTex` + grid / \|E\| heat mix 0.3 / phase hue; neon borders on top | tile border, \|E\|, phaseNorm **tested** | **declared** |
| `Debug_PhaseWheel.frag` | 128×128 HUD, hue → phase | phaseNorm **tested** | **declared** |
| `Debug_TileInspector.comp` | `energy=sum\|E\|`, `avgPhase=atan(sumIm,sumRe)`, `coherence=\|sum(E)\|/sum(\|E\|)` (0 if sumMag=0) | **partial** | **declared** |
| Wavefield movie | `historyIndex = bounceId * (W*H) + pixelIndex` | index math **tested** | **declared** |
| `Debug_WSlice` | `wNorm=clamp((w-wMin)/(wMax-wMin),0,1)`; their shader uses `pixelId % holoResX` — valid only when `frameWidth==holoResX`. Scaled mode must use BinPaths `holoX/Y`. | wNorm **tested** | **declared** |
| `DebugRealImag` | Debug encode, **not** SLM `atan2` PhaseEncode. `R/G = 0.5 + 0.5*tanh(real/imag)`, `B = 0.5 + 0.5*tanh(\|E\|)` (or 0). Confirms Polar SoA pad `tileReal/Imag[16][17]` flattened to 272 (column 16 never written). CPU PNG dump is a field viz, not photoreal. | pad + Re/Im match **enforced** | WGSL sketch **declared** (plain f32; not dispatched) |

Cornell sanity scene (exists): `mrs/demo/scene-configs/cornell4d.json`. No live Polar screenshot. No GPU fps claim.

---

## Honest non-claims

- No SLM hardware, no RGB hologram on Polar, no Fresnel/FFT (propagation **declared**).
- No quilt (**declared**).
- Physical wave validity **declared**.
- Live GPU is AMD RX 580 Polar / Vulkan.

## Polar / RX 580 GPU dispatch

Live demo GPU is AMD RX 580 Polar / Vulkan. Polar tiled path has **zero `atomic<f32>`**.

1. Vulkan ICD for the RX 580 (`radv` or `amdvlk`).
2. Create a `GPUDevice` **without** `shader-float32-atomic`.
3. CPU prefix-sum `TileHeaders.offset`, upload with `count = 0`.
4. `new HoloRT4DGPURenderer(device).dispatch(encoder, rt4d, { paths })`
5. Kernels: BinPaths `@workgroup_size(256)` → TiledAccumulate `@workgroup_size(16, 16)` (one writer/pixel) → PhaseEncode `@workgroup_size(16, 16)` (plain f32 reads). Bind groups are physical 0 (tiles, logical Set 4) and 1 (phase, logical Set 5) so `maxBindGroups=4` works.

If no device is present, `dispatch(null)` returns the same plan (`describePolarDispatch`) and status stays **partial**. Do not enable the RX 7000+ atomic path on Polar by default.

## Snapshots (CPO / SPO / CPF-4D)

`getSnapshot('CPO'|'SPO'|'CPF-4D')` downsamples the hologram field (not empty stubs):

- **CPO** 64×64 tile energy
- **SPO** 256×256 intensity + phase coherence
- **CPF-4D** 512×512 bounce-wise strips if `history` exists, else \|E\| at native res downsampled

CPU tensors **enforced**. `visionBridge.publish(snapshot)` piggybacks chamber / MCP Vision Bridge — live roundtrip **partial**.

## CIEMS

Each pass can attach Authority → Validation → Decision → Evidence → Verification → Replay → Audit. Evidence is SHA-256 of TileHeaders + complexField (**enforced** when those buffers exist). Path gate still rejects missing `pixelId` / `opticalLength`. Jarvis POST to `http://127.0.0.1:8001` is skipped if the service is down.

## Related docs

- [`docs/holort4d/ART_DIRECTION_BRIEF.md`](../holort4d/ART_DIRECTION_BRIEF.md) — lighting doctrine, shadow grammar, SD vs HoloRT4D separation, shot checklist
- [`docs/holort4d/FACE_RIG_TURBO_CONTROL.md`](../holort4d/FACE_RIG_TURBO_CONTROL.md) — 3-map rig (depth/topology/flow) for Turbo GGUF
- [`output/holort4d-debug/depth-lock/README.md`](../../output/holort4d-debug/depth-lock/README.md) — pixelId / opticalLength depth lock (tunnel reconstruction)

## Tests

```bash
cd mrs/packages/renderer-core
node --test src/render/rt4d/holort4d/holort4d.test.js
```
