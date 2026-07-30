# 01 — Architect ADR: SX Architectural Gaps (Shader Bridge)

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** Architect (CECP 01) · **mode:** sage · **actorMode:** Anchor + Architect-Shadow  
**softwareCreationMode:** Boundary-Guardian + Runtime-Sage  
**cognitive-profile:** Scientist + Skeptic  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`

---

## Intent

Close three Sovereign-X honesty gaps without overclaiming photoreal or inventing crypto:

1. Soft-raster lacks an explicit **constitutional → PBR** translation layer and a named tone-map.
2. Lemonade SD weights may be downloaded while generation still fails — user theory blamed provenance; prior evidence points to **sd-server / AVX2 / Tonga ROCm**.
3. Fixture faces / box sets need governed **evidence records** (contentHash + provenance fields already in Engine3D) and AABB integrity checks — not fake signatures.

## ADR decision

### Context

- Engine3D already has `UniversalMaterial`, `rasterMaterialFromUniversal`, cinematic grade (not ACES), `GovernedAssetManifest` / `AssetProvenanceRecord` / `AssetRegistry`.
- Lemonade adapter (`lemonadeSdAdapter.js`) is **partial**; cinematic-v2 trail recorded `sd-server failed to start`.
- Face fixtures live under `mrs/assets/human/` with operator override.

### Decision

| Gap | Decision | Status tag allowed |
|-----|----------|-------------------|
| 1 | Add `ShaderBridge` module: `ConstitutionalMaterialDescriptor` → `{ albedo, roughness, metallic, emissive, … }` → wire into UniversalMaterial / soft-raster. Add **ACES-approx** tone-map post (distinct from cinematic grade). | bridge **partial**; tone-map **partial**; never claim photoreal **enforced** |
| 2 | Extend Lemonade SD adapter with weight **checksum + provenance evidence** gate before generate. Probe live halt cause. Mark weights lawful only when checksum verifies; do **not** claim provenance was root cause unless probe proves it. | provenance gate **partial**; SD runtime **blocked** if hardware still fails |
| 3 | Add `FixtureFaceRegistry` building `GovernedAssetManifest` + mesh AABB from GLB/rig; gate rasterization when stack supports evidence attach. Fix real AABB bugs only. | registry **partial**; “signature” = contentHash + provenance fields (**not** PKI) |

### Consequences

+ Explicit translation contract between constitutional materials and soft-raster PBR.  
+ Honest Lemonade evidence layer without false unblock.  
+ Fixture integrity visible in structure/evidence records.  
− Soft-raster remains approximate.  
− Hardware may still block Lemonade SD after lawful marking.

## Interface specification

### Gap 1 — ShaderBridge

**Inputs:** descriptor `{ id, type|semantic, baseColor?, roughness?, metallic?, emissive?, intentId?, worldId? }`  
**Outputs:** `PbrParams { albedo, roughness, metallic, emissive }` + `UniversalMaterial` + `RasterMaterial`  
**Tone-map:** `applyAcesApproxToneMap(beauty, w, h, { exposure? })` → sRGB-ish bytes  
**Bans:** claim Cycles/RTX/photoreal; edit protected charter files

### Gap 2 — Lemonade provenance

**Inputs:** model id, optional weight path / expected sha256 map  
**Outputs:** `{ lawful: boolean, checksumOk, provenanceRecord, blockers[], haltCauseClass }`  
**haltCauseClass:** `provenance` | `sd_server` | `avx2` | `rocm_unsupported` | `unreachable` | `unknown`  
**Bans:** claiming provenance fixed SD without generate HTTP 200

### Gap 3 — Fixture registry

**Inputs:** logical face name / GLB path  
**Outputs:** `GovernedAssetManifest` with `contentHash`, bounds `{min,max}`, `AssetProvenanceRecord`  
**Constitutional signature (honest definition):** contentHash + provenance.source + optional integrityHash — **evidence fields**, not cryptographic signatures unless a future design adds them.

## Constitutional boundary analysis

| In-scope | Out-of-scope |
|----------|--------------|
| `mrs/packages/engine3d-core/**` adapters, posts, tests | `constitution/CHARTER.md`, `engine/constitution/*`, `default.policies.json`, `AGENTS.md` |
| `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js` + tests | Fake PKI / inventing charter policies |
| CECP trail + proofs under `docs/` / `tmp/` | Claiming photoreal enforced |

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/engine3d-core/src/renderer/raster/ShaderBridge.ts` | create | Implementor |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterPostProcess.ts` | add ACES approx | Implementor |
| `mrs/packages/engine3d-core/src/renderer/raster/RasterMaterial.ts` | wire bridge | Implementor |
| `mrs/packages/engine3d-core/src/face/FixtureFaceRegistry.ts` | create | Implementor |
| `mrs/packages/engine3d-core/src/index.ts` | exports | Implementor |
| `mrs/packages/engine3d-core/test/renderer/shader-bridge.test.ts` | create | Implementor |
| `mrs/packages/engine3d-core/test/face/fixture-registry.test.ts` | create | Implementor |
| `sovereign-x/router/modules/gpu/amd/lemonadeSdAdapter.js` | provenance gate | Implementor |
| `sovereign-x/tests/lemonadeSdAdapter.test.js` | extend | Implementor |
| `docs/4d-engine/proofs/sx-arch-gaps-2026-07/**` | proof artifacts | Implementor |
| `docs/governance/cecp/trails/sx-arch-gaps-shader-bridge-2026-07/*` | CECP 01–06 | Crew |

## Acceptance criteria

- [ ] ShaderBridge maps type/semantic → finite albedo/roughness/metallic in [0,1]
- [ ] Soft-raster path uses bridge (via `rasterMaterialFromUniversal` or explicit call)
- [ ] ACES-approx tone-map changes HDR-ish values measurably; unit test PASS
- [ ] One proof still under proofs/tmp
- [ ] Lemonade: checksum/provenance API + tests; live probe records haltCauseClass honestly
- [ ] Fixture registry registers HumanFaceRigged with contentHash + AABB; invalid bounds rejected
- [ ] No protected constitutional file edits
- [ ] Status tags: bridge **partial**; SD **blocked** or **partial** only with evidence

## Anti-overclaim

| Claim | Tag |
|-------|-----|
| Constitutional→PBR bridge | **partial** |
| Soft-raster photoreal | **not claimed** |
| ACES filmic tone-map | **partial** (approx, not full ACES 1.3) |
| Lemonade SD generate on this host | probe-driven; default **blocked** if sd-server fails |
| Provenance was root cause of SD halt | **only if** probe classifies as provenance |
| Constitutional signature | evidence/contentHash — **not** PKI |

## Sage counsel

1. Prove tone-map + bridge unit tests first (deterministic, no GPU).  
2. Lemonade: implement gate, then probe — separate “lawful weights” from “sd-server starts”.  
3. Fixture: reuse AssetRegistry patterns; do not invent crypto.  
4. ESFR should prefer `PROMOTE_WITH_GAPS` / `PASS_WITH_GAPS` if SD remains hardware-blocked.

## Cross-reference ledger

| Ref | Relevance |
|-----|-----------|
| `cinematic-quality-v2-2026-07` | soft-raster posts; Lemonade sd-server block evidence |
| `sx-legacy-efficient-3layer-2026-07` | Lemonade adapter lineage |
| `ENGINE3D_WORLD_OBJECT_MATERIAL_SPEC_v1.0` | UniversalMaterial contract |
| Drive-G-1 / Drive-G-2 | evidence-bound claims; maturity dimensions |

## Handoff to Builder

Scaffold ShaderBridge + FixtureFaceRegistry stubs, test placeholders, tone-map export shell, Lemonade provenance function stubs — then Implementor fills logic.
