# 01 — Architect ADR: Digital Printer Renderer Initiative

**Trail:** `printer-mode-renderer-2026-07`  
**Trail path:** `docs/governance/cecp/trails/printer-mode-renderer-2026-07/`  
**Stage:** Architect (CECP 01)  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**cognitive-profile:** Scientist + Creator + Optimizer  
**mode / lens:** Artisan  
**actorMode:** Artisan-Logic  
**softwareCreationMode:** Render-Physicist + Protocol + Constructor  
**Related:** `cinematic-render-quality-2026-07` (quality knobs folded into print stages)

---

## 1. Intent

Make MRS rendering explicit as a **governed digital printer**: deterministic printing of **declared surfaces** under a RenderRequest / SceneSpecification — no hallucination, no SF Story→PromptSpec inside MRS.

Fold prior cinematic quality priorities into print stages:

| Print stage | Quality concern | Tag target |
|-------------|-----------------|------------|
| Sampling / convergence | spp, stratified AA, adaptive | **enforced** (opt-in print/cinematic) |
| Reconstruction / denoise | bilateral / edge-aware | **partial** / **declared** if too heavy for CI |
| Tonemap | aces-lite / reinhard | **enforced** |
| Color | gamma 2.2 | **enforced** |
| Encode | PNG | **enforced** |
| Hash + provenance | evidence.json + sha256 | **enforced** |

**Why not `/mrs/renderer` root:** Prefer `mrs/adapters/storyforge-boundary/printer/` — RenderRequest intake, SF boundary, and execute already live here. Avoid inventing a parallel root.

## 2. ADR decision

### Governing invariant

> Rendering = **deterministic printing of declared surfaces**. Faithful print of the scene under declared PrintRequest / RenderSpecification. Fail loudly on surface gaps.

### Decision

1. **Print Surface Contract** JSON lists required surfaces + AOVs + error codes.  
2. **Error state machine** (fail loudly): `OK | SURFACE_MISSING | SURFACE_INVALID | AOV_MISMATCH | SCENESPEC_GAP | ENGINE3D_BOUNDARY_FAIL | GENBLAZE_SMOKE_FAIL`.  
3. **Sovereignty checks** before deep execute.  
4. **Evidence Printer** writes beauty (+ optional depth/normal) + evidence.json + lineage + hashes.  
5. **printer_mode pipeline** normalizes PrintRequest (dims/spp/variance/tonemap/seed/format) → cinematic-quality scene execute → evidence.  
6. Draft CI stays fast; print mode is opt-in (`--print` / `quality=cinematic` / demo script).  
7. No nondeterministic GPU magic; no SF Story→PromptSpec.

### Consequences

+ Honest printer metaphor + fail-loud errors + evidence chain.  
− Denoise may ship as **partial**/off-by-default.  
Risk: conflating “print” with commercial RIP software — docs must say MRS scene printer, not Prepress RIP.

## 3. Interface

### PrintRequest (normalized)

```json
{
  "width": 512, "height": 512, "samples": 24,
  "variance_threshold": 0.0008, "color_space": "srgb",
  "tone_mapper": "aces-lite", "denoise": false,
  "seed": 42, "format": "png", "aovs": ["beauty"]
}
```

### Module paths

| Path | Role |
|------|------|
| `governance/surface_contract.json` | Contract |
| `printer/errors.py` | State machine |
| `printer/sovereignty.py` | Pre-print checks |
| `printer/print_request.py` | Normalize PrintRequest |
| `printer/evidence.py` | Evidence printer |
| `printer/pipeline.py` | Print pipeline |
| `demo_digital_print.py` | Demo → `output/cecp-digital-print/` |
| `CONTRACT_DIGITAL_PRINT.md` | Operator contract |

## 4. Constitutional boundary

**In:** storyforge-boundary printer + governance; reuse execute/render-scene qualityOpts.  
**Out:** constitution/, AGENTS.md, SF PromptComposer, inventing GPU denoise as enforced.

## 5. File manifest

See §3 + trail 01–06 + tests `test_printer_mode.py`.

## 6. Acceptance

- [ ] Same PrintRequest → same beauty sha256 (determinism test)  
- [ ] Error states fail loudly with codes  
- [ ] Evidence completeness (hashes + lineage)  
- [ ] Demo plate under `output/cecp-digital-print/`  
- [ ] Draft CI not slowed  

## 7. Handoff

Builder scaffolds packages; Implementor fills; Reviewer/Inspector/ESFR.

## Anti-overclaim

Denoise **partial**/declared unless tests prove. Adaptive **enforced** only when qualityOpts on (already tested in cinematic trail). Not Unreal/V-Ray.
