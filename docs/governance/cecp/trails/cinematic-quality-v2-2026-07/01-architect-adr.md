# 01 — Architect ADR: Cinematic quality v2 (memorable first 10s)

**Trail:** `cinematic-quality-v2-2026-07`  
**Stage:** Architect (CECP 01)  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**cognitive-profile:** Artist + Scientist  
**mode / lens:** Artisan + Visionary (anti-overclaim)  
**actorMode:** Mythweaver  
**softwareCreationMode:** Render-Physicist + Constructor  
**Lineage:** `cinematic-render-quality-2026-07` · `tmp/book-movie-ch1/showcase-30s` · Engine3D soft-raster upgrade

---

## Intent

User feedback: camera motion improved the film; next focus is **memorable visuals**. The first **10 seconds** must make someone want to keep watching — Archive of Consent Chapter One continuity — **quality iteration, not feature sprawl**.

Implement only what Engine3D **CPU soft-raster** can deliver; declare gaps (no photoreal GI / Cycles / RTX).

## ADR decision

### Context

Prior showcase (`showcase-30s`, 12 fps, `--upgrade`: 3-light + 2× AA + SSAO + fog) raised form readability. Remaining soft-raster limits: flat materials, weak atmosphere, limited DOF/motion language, fixture faces, box architecture.

### Decision

1. **New trail** (this) — do not rewrite `cinematic-render-quality-2026-07`.  
2. **Soft-raster post ladder (enforced by unit tests):** depth-of-field proxy, temporal motion blur, cinematic color grade, volumetric dust motes, stronger contact darkening.  
3. **Material punch (partial→enforced):** procedural micro-grain on wood/stone/cloth; dramatic light-rig option (lower fill → stronger shadows); specular lift on metal/glass — still approximate PBR.  
4. **Showcase path:** `render_ch1_cinematic.mjs --cinematic-v2` → `tmp/book-movie-ch1/showcase-cinematic-v2/` at **24 fps**; first-10s clip + ~30s remaster; lived-in room props; expressive cameras (slow push-in, subtle handheld, rack-focus via DOF focus plane); face blendshape tracks when `HumanFaceRigged.glb` loads.  
5. **Non-goals:** charter/policy edits; WebGPU path; true GI/SSR/volumetrics; photoreal humans.  
6. **Optional Genblaze SX / Lemonade:** CIS wrapper may attach local diffusion plates when `sd-server` works; if Lemonade catalog shows SD-Turbo downloaded but generate fails, keep tag **blocked** and do not mux simulated `SX_DEMO_MODE` checkerboards as beauty.

### Consequences

+ Opening emotional punch within soft-raster honesty.  
− Wall time ↑ (~2× AA + posts + 24 fps).  
Risk: overclaiming “cinematic GI” — forbid in README.

## Contracts

| Input | Output |
|-------|--------|
| `--cinematic-v2` (+ optional `--max-seconds 10\|30`) | MP4 + stills + README under `showcase-cinematic-v2/` |
| `RasterPostProcess` new APIs | Deterministic CPU RGBA transforms |
| Face rig present | Blink/frown/mouth tracks; else sphere heads |

**Bans:** protected constitutional paths; photoreal claims; Genblaze as structure source.

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/engine3d-core/src/renderer/raster/RasterPostProcess.ts` | extend | Implementor |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterMaterial.ts` | micro-grain + dramatic rig | Implementor |
| `mrs/packages/engine3d-core/test/renderer/raster-upgrade.test.ts` | post tests | Implementor |
| `mrs/packages/engine3d-core/src/index.ts` | export new posts | Implementor |
| `tmp/book-movie-ch1/render_ch1_cinematic.mjs` | cinematic-v2 path | Implementor |
| `tmp/book-movie-ch1/showcase-cinematic-v2/**` | proof artifacts | Implementor |
| `docs/governance/cecp/trails/cinematic-quality-v2-2026-07/*` | CECP 01–06 | Crew |

## Acceptance tests

- [ ] Unit: DOF proxy blurs far/near differently from focus plane  
- [ ] Unit: temporal blur differs from identity when previous frame differs  
- [ ] Unit: color grade changes luma/chroma measurably  
- [ ] Unit: dust overlay changes some pixels  
- [ ] `npm run test:raster-upgrade` PASS  
- [ ] First-10s MP4 + ~30s remaster exist under showcase-cinematic-v2  
- [ ] README lists shipped vs soft-raster limits (Drive-G-1)

## Anti-overclaim

| Claim | Tag |
|-------|-----|
| DOF / motion blur / dust / grade | **enforced** (CPU approx) |
| Soft GI feel | **partial** (fill+SSAO+fog — not irradiance) |
| Facial animation | **partial** (fixture blendshapes) |
| Photoreal / full GI / volumetrics | **not claimed** |

## Handoff order

1. Builder → stubs/exports/test placeholders  
2. Implementor → posts + showcase path + proofs  
3. Reviewer → Drive-G-1 / scope  
4. Inspector → acceptance against artifacts  
5. ESFR → PromotionEligibility
