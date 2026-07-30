# 08 — CKL Amendment VII: Biometric and Organic Rendering Enforcement

**Trail:** `sx-arch-gaps-shader-bridge-2026-07`  
**Stage:** Implementor follow-on (wiring → **enforced** CKL gates)  
**Date:** 2026-07-30  
**Authorization:** User Amendment VII — `default.policies.json` + CKL wiring only  
**Protected paths not edited:** `AGENTS.md`, `constitution/CHARTER.md`, `engine/constitution/charter.js`

## Intent

Wire existing Gap-3 partial building blocks to constitutional CKL enforcement — no feature sprawl.

## Wiring map

| Policy ID | Halt code | Building block | CKL condition |
|-----------|-----------|----------------|---------------|
| `policy-biometric-conformance` | `HALT:BIOMETRIC-NONCONFORMANCE` | `BiometricProfile.ts` → `enforceBiometricConformance` | `biometric_amendment_vii` |
| `policy-adaptive-scale` | `HALT:MISSING-SCALE-CONTEXT` | `MetricInheritance.ts` → `requireScaleContext` | `biometric_amendment_vii` |
| `policy-organic-variance` | `HALT:ORGANIC-VARIANCE-VIOLATION` | `OrganicVariance.ts` → `enforceOrganicVarianceAtRender` / `EI-ORGANIC-VARIANCE` | `biometric_amendment_vii` |

**Evaluator:** `engine/governance/biometric/amendmentVII.js`  
**Policies:** `engine/governance/policies/default.policies.json` (order: biometric → adaptive-scale → organic-variance)  
**Kernel path:** `resolveDecision` in `ConstitutionalKnowledgeLayer.js` (RCK not present; CKL/GovernanceKernel path used)  
**Opt-in:** `evidence.biometricAmendment` or `enforceAmendmentVII` — legacy renders unchanged

## Status tags (Drive-G-1)

| Surface | Tag | Evidence |
|---------|-----|----------|
| CKL deny/halt when biometricAmendment present | **enforced** | `engine/governance/test/amendment-vii.test.js` |
| Catalog / AABB proxies / inheritance math | **partial** | existing unit tests |
| CIS `SCAL` / `ENRG-SCALE` Genblaze opcode | **declared** | `verifyScalStep` helper only |
| Soft-raster static audit | **partial** | unchanged |
| `default.conformance-profile.json` | untouched | preserves existing 16-check gate; Amendment VII covered by dedicated CKL tests |

## Tests

```bash
npm run test:governance
npm run test:biometric --prefix mrs/packages/engine3d-core
npm run test:conformance
```

Expected: Amendment VII HALT cases pass; existing CKL conformance checks unchanged.

## Next evolution (declared only)

World-Profile / Biogeometric Constitutional World Engine — **not enforced**:

- `docs/4d-engine/WORLD_PROFILE_BIOGEOMETRIC.md`
- Schema stub: `mrs/assets/world/schemas/biogeometric-profiles.schema.json` (**skeleton**)
- Promotion path: Substrate (Amendment VII) → Substration → Promotion
