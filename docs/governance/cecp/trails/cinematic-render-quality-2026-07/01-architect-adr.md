# 01 — Architect ADR: Cinematic render quality ladder

**Trail:** `cinematic-render-quality-2026-07`  
**Trail path:** `docs/governance/cecp/trails/cinematic-render-quality-2026-07/`  
**Stage:** Architect (CECP 01)  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**cognitive-profile:** Scientist + Creator + Optimizer  
**mode / lens:** Artisan  
**actorMode:** Artisan-Logic  
**softwareCreationMode:** Render-Physicist + Optimizer  
**Predecessors:** `storyforge-4d-full-run-2026-07`, `proton-hq-2026-07`, `judge-wow-2026-07`

---

## 1. Intent

Raise **demo / cinematic** still quality so teal hypersphere lattice (and proton + Engine3D plates) read as **clean shaded 3D** — less noise, better AA, readable form — without claiming Unreal / V-Ray / GPU production path-trace.

**User framing (acknowledge):** GLB, SceneBridge, RT4D, materials, worldgen, provenance, tests, Docker are already the hard architecture. This trail focuses on **image-quality knobs + code paths** that make the teal lattice look like a 3D renderer — not more architecture.

**User priority order (attack list, highest first):**

1. **Noise reduction** — more spp; importance sampling; adaptive early-stop where converged  
2. **Lighting** — stronger indirect / better area-light sampling; softer contact shadows  
3. **Materials** — roughness / specular / metal-glass where UniversalMaterial / shadeRasterFragment exist  
4. **Anti-aliasing** — jittered / stratified camera rays; higher internal res if practical  
5. **Color pipeline** — tonemap; gamma; richer response  

**Evidence (before):** `output/cecp-full-run/scene/render-result.json` → `384² × 6 spp × depth 5`, objectCount 357 — grainy because pixel-sample budget is draft-adjacent. PathTracer already jittered AA via `generateRay(u1,u2)`.

| Goal | Tag target |
|------|------------|
| Quality ladder draft / high / cinematic | **enforced** |
| Opt-in cinematic floors + qualityOpts | **enforced** |
| Stratified AA + firefly clamp | **enforced** (tests) |
| Adaptive sampling (variance early-stop) | **enforced** when `qualityOpts.adaptiveSampling` + tests |
| Power-weighted NEE light pick | **enforced** |
| ACES-lite beauty encode (cinematic) | **enforced** |
| Soft contact / multi-sample soft shadows | **declared** / **partial** (larger area lights help; no penumbra sampler) |
| Engine3D material punch via worldDoc primitives | **partial** (shadeRasterFragment exists; still CLI may not expand fixture primitives) |
| Demo → `output/cecp-cinematic-quality/` | **enforced** |
| Draft CI unchanged | **enforced** |

---

## 2. ADR decision

### Context — what “looks like a 3D renderer” means in MRS

| Path | Look goal | Mechanism | Honest ceiling |
|------|-----------|-----------|----------------|
| **RT4D scene-spec** | Form + noise ↓ | PathTracer4D + stratified AA + adaptive spp + ACES + power NEE | CPU sphere-soup; not film VFX |
| **Proton soft-splat** | Dense luminous field | HQ preset (aces, SS, lighting-punch) | Soft blobs ≠ hard mesh |
| **Engine3D soft-raster** | Shaded mesh readability | HeadlessStill + shadeRasterFragment | Simple BRDF; no path GI |

### Decision

1. Three-rung ladder: `draft` | `high` | `cinematic` (opt-in).  
2. Cinematic floors: ≥512², spp∈[16,64], depth≥6; `qualityOpts`: adaptiveSampling, tonemap=aces-lite, fireflyMax.  
3. Attack list order above; architecture expansion out of scope.  
4. Evidence: 32 spp @ 512² timed out @ 600s → floor **16** spp with adaptive to spend samples where needed.  
5. Non-goals: Unreal/V-Ray claims; GPU default; charter edits; new packages.

### Consequences

+ Measurable noise ↓ / cleaner edges / better light pick.  
− CPU wall time; adaptive changes per-pixel sample counts (seeded deterministic).  
Risk: timeout — document `MRS_RENDER_TIMEOUT_SECONDS`.

---

## 3. Interface specification

`RenderRequest.payload.render.quality` includes `"cinematic"`.  
`SceneSpecification.output.qualityOpts`: `{ adaptiveSampling, tonemap, fireflyMax, varianceThreshold }`.

### Demo CLI

```text
python demo_full_run.py --quality cinematic --out-dir output/cecp-cinematic-quality
```

### Bans

No protected-path edits. No Unreal/V-Ray claims. Draft clamps preserved.

---

## 4. Constitutional boundary

**In:** storyforge-boundary, renderer-core render-scene / PathTracer / sceneQuality, CECP trail.  
**Out:** constitution/, AGENTS.md, policies.

---

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| trail `cinematic-render-quality-2026-07/*` | create | Architect→ESFR |
| `RenderRequest.schema.json` | +cinematic | Implementor |
| `execute.py` / `demo_full_run.py` / fixtures | cinematic floors | Implementor |
| `scripts/lib/sceneQuality.mjs` + tests | noise/AA/color | Implementor |
| `PathTracer4D.js` | power-weighted NEE | Implementor |
| `render-scene.mjs` | wire qualityOpts | Implementor |
| `output/cecp-cinematic-quality/**` | plates | Inspector |

---

## 6. Acceptance criteria

- [ ] draft clamps spp≤2 / small dims  
- [ ] cinematic floors ≥16 spp / ≥512 + qualityOpts  
- [ ] sceneQuality + render-scene tests pass  
- [ ] plates under `output/cecp-cinematic-quality/`  
- [ ] no Unreal/V-Ray claims; adaptive marked enforced only with tests  

---

## 7. Handoff

Builder → scaffold; Implementor → attack list 1→5; Reviewer/Inspector/ESFR.

## Anti-overclaim

Not film path-trace; not meshed PBR lattice; CHEA/CCR/CDGF **declared**. Soft shadows beyond larger area lights **declared**.
