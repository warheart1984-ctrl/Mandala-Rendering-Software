# 01 — Architect ADR

**Trail:** `e2e-close-gaps-2026-07`  
**Role:** Architect (+ Sage / Anchor / Pipeline-Conductor)  
**Date:** 2026-07-28

## Intent

Close all **closable** residuals from prior E2E / P0 audits across GPU renderer-core,
Genblaze BYOK/security, CI provenance wiring, and provenance hashing — without editing
protected constitutional paths.

## ADR decision

**Context:** P0 CI unblock left PostProcessor sampleType debt; EnvironmentMapper /
ShadowMapper BGL mismatches; empty Preview catches; package `files` incomplete;
BYOK polish route gap; XSS via innerHTML; provenance hash / replay lineage missing;
CI lacked `engine/runtime/test`.

**Decision:** Implement fixes in non-protected paths; wire tests into CI; produce CECP
trail; leave ISL residuals (protected auth, live WebGPU adapter, Unity/Unreal skeleton)
explicit.

**Consequences:** ESFR may reach `PROMOTE` if zero closable gaps remain; otherwise
`PROMOTE_WITH_GAPS` with irreducible list only.

## Scope

### In
- GPU: PostProcessor, ShadowMapper, EnvironmentMapper, GPUPreviewClient, package.json, `./node`
- CI: Provenance+Replay in ci.yml + mandala-agent-ci.yml
- Security: SECURITY.md Genblaze/BYOK; byok.rules.md; XSS; polish 400; soft model warn
- Provenance: SHA-256 frame hash + replay lineage receipt + tests
- Docs: CECP trail; honest index claim

### Out / skipped (needs auth or irreducible)
- Protected constitutional artifacts
- Live WebGPU adapter validation on CI runners
- Unity / Unreal host maturity beyond skeleton
- Promoting CUDA/HIP to Digital Printer SoT

## File manifest (planned)

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/renderer-core/src/gpu/PostProcessor.js` | modify | Implementor |
| `mrs/packages/renderer-core/src/gpu/ShadowMapper.js` | modify | Implementor |
| `mrs/packages/renderer-core/src/gpu/EnvironmentMapper.js` | modify | Implementor |
| `mrs/packages/renderer-core/src/gpu/GPUPreviewClient.js` | modify | Implementor |
| `mrs/packages/renderer-core/src/node.js` | create | Implementor |
| `mrs/packages/renderer-core/package.json` | modify | Implementor |
| `engine/runtime/ProvenanceRecorder.js` | modify | Implementor |
| `engine/runtime/ReplayService.js` | modify | Implementor |
| `.github/workflows/ci.yml` | modify | Implementor |
| `SECURITY.md` | modify | Implementor |
| `mandala-agent-pack/agents/GenblazeAgent/byok.rules.md` | modify | Implementor |
| `mrs/apps/genblaze-media/app/*` | modify | Implementor |

## Acceptance criteria

- [ ] gpu-core mock BGL tests pass (float sampleType, shadow consumer, env mips)
- [ ] `npm run test:conformance` 16/16
- [ ] `npm run test:runtime-provenance` green
- [ ] BYOK polish rejects headers with 400
- [ ] No closable gap left without ALIGNED or BLOCKED:auth/hardware label
