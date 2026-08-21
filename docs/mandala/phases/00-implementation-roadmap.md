# Mandala 4D Renderer Implementation Roadmap

## Executive Summary

You have real math, real shaders, real governance. You need to close the implementation gap to be independent of Unreal/Unity/Blender.

**Current State:** 70% architecture, 30% implementation
**Target State:** Production-ready constitutional 4D renderer

---

## Phase 1: Shader Wiring (2 weeks)

**Goal:** Character materials render via GPU path tracer

### Deliverables
- `CharacterMaterialRegistry.js` — loads `character/shaders/*.wgsl`
- Material data extended with `characterType`, `sssRadius`, `sssScale`
- SHADE_WGSL modified to branch on character type
- RT4DGPURenderer loads character shaders

### Success Criteria
- Skin material renders with SSS effect
- Fur material renders with anisotropic highlights
- Metal material renders with conductor reflections
- All with provenance tracking

### Files
- `/character/shaders/*.wgsl` → GPU renderer
- `mrs/packages/renderer-core/src/render/rt4d/gpu/shaders.js`
- `mrs/packages/renderer-core/src/render/rt4d/material/CharacterMaterialRegistry.js`

---

## Phase 2: Certified State Store (3 weeks)

**Goal:** Every state transition is certified with AAIS signature

### Deliverables
- `state-store.ts` — immutable state certification
- `aais-validator.ts` — constitutional invariant validation
- `state-hash.ts` — deterministic SHA-256 hashing
- API: `POST /api/mandala/state`, `GET /api/mandala/state/{id}`

### Success Criteria
- State certification rejects invalid topology
- State certification rejects energy non-conservation
- Same input always produces same hash
- State verification detects tampering
- Provenance chain traceable

### Constitutional Guarantees
- P1: No execution without intent
- P2: No state change without evidence
- P3: No authority without contract
- P4: Replayable reality
- P5: Sovereign independence

---

## Phase 3: Post-Processing Chain (2 weeks)

**Goal:** Production-grade image quality

### Deliverables
- `PostProcessor.js` — main orchestrator
- `TAA.js` — temporal anti-aliasing
- `Denoiser.js` — SS denoising
- `ToneMapper.js` — ACES/Reinhard
- `Bloom.js` — bloom extraction + blur
- Integration with RT4DGPURenderer

### Success Criteria
- TAA reduces flickering < 2ms @ 1080p
- Denoise < 5ms @ 1080p
- Tone mapping preserves highlights
- Bloom adds cinematic glow
- Total post-processing < 15ms @ 1080p

---

## Phase 4: Constitutional Runtime Loop (4 weeks)

**Goal:** Self-governing simulation runtime

### Deliverables
- `ConstitutionalRuntime` class
- `SimulationChamber` organ
- `ConstitutionalGate` with AAIS validation
- `MandalaRendererOrgan` (pure function)
- `MovieLane` organ (observer)
- API: `/api/mandala/runtime/run`, `/api/mandala/runtime/replay`

### Success Criteria
- Simulation proposal → AAIS → certified state
- Renderer renders only certified states
- Same state produces identical pixels (CPU + GPU)
- Invalid transitions rejected with violations
- Full provenance chain for every frame
- Replayable and deterministic

### Architecture
```
Story Forge → Simulation Chamber → AAIS Gate → Certified State → Renderer → Movie Lane
     ↓              ↓                 ↓              ↓           ↓          ↓
   Intent     Proposal        Validation      Hash+Sig    Pure Func   Observer
```

---

## Timeline

| Phase | Duration | Start | End | Deliverable |
|-------|----------|-------|-----|-------------|
| Phase 1: Shader Wiring | 2 weeks | Week 1 | Week 2 | Character materials render via GPU |
| Phase 2: State Store | 3 weeks | Week 3 | Week 5 | Certified state with AAIS signatures |
| Phase 3: Post-Processing | 2 weeks | Week 6 | Week 7 | Production image quality |
| Phase 4: Runtime Loop | 4 weeks | Week 8 | Week 11 | Constitutional runtime closed |

**Total: 11 weeks**

---

## Resource Requirements

### Team
- 1 Senior Graphics Engineer (WebGPU/WGSL)
- 1 Systems Engineer (TypeScript/Constitutional)
- 1 Physics Engineer (RHFD simulation)
- 1 DevOps (CI/CD, testing)

### Infrastructure
- WebGPU-capable GPU (RTX 4080+ or RX 7900+)
- CI/CD pipeline with conformance tests
- Local Lemonade server for AI denoising

---

## Risk Mitigation

### Risk 1: WGSL Compilation
**Problem:** `glslc` not available in sandbox, shaders untested
**Mitigation:** Use `naga` for WGSL validation, test in browser

### Risk 2: Buffer Layout Mismatch
**Problem:** Adding fields to MaterialData changes GPU offsets
**Mitigation:** Version buffer layouts, write compatibility tests

### Risk 3: AAIS Signature Performance
**Problem:** Cryptographic signing on every state transition
**Mitigation:** Use deterministic HMAC for now, upgrade to real crypto later

### Risk 4: Memory Usage
**Problem:** 4D lattice with 512³ × 256 = 34B samples
**Mitigation:** Sparse bricks with temporal BVH, use `sparsity: 0.12`

---

## Success Metrics

### Technical
- ✅ Character materials render via GPU
- ✅ State certification rejects invalid transitions
- ✅ Post-processing < 15ms @ 1080p
- ✅ Same state produces identical pixels
- ✅ Full provenance chain for every frame

### Business
- ✅ Independent of Unreal/Unity/Blender
- ✅ Constitutional guarantees for clients
- ✅ Replayable reality for creators
- ✅ Mathematically provable physical base
- ✅ Procedural generation first-class

---

## Next Steps

1. **Review plans** — Confirm priorities with you
2. **Start Phase 1** — Wire character shaders
3. **Parallelize** — State store and post-processing can overlap
4. **Weekly demos** — Show working renders each week
5. **Conformance tests** — 16/16 checks must pass

---

## Documentation

All plans created:
- `/tmp/character-shader-wiring-plan.md`
- `/tmp/certified-state-store-plan.md`
- `/tmp/post-processing-chain-plan.md`
- `/tmp/constitutional-runtime-loop-plan.md`
- `/tmp/mandala-code-mapping.md`
- `/tmp/mandala-renderer-api-spec.md`

---

## Questions

1. Priority on character materials vs state store? Can parallelize with 2 engineers
2. WebGPU vs Vulkan first? WebGPU for browser demos, Vulkan for performance
3. AAIS crypto: HMAC for now, or full ECDSA from start?
4. Post-processing: AI denoise via Lemonade, or hand-coded SS denoiser?

Ready to start Phase 1.
