# CECP — Amendment VIII World-Profile Law (2026-07-30)

| Field | Value |
|-------|-------|
| **Trail** | `world-engine-probe-2026-07` |
| **Amendment** | **VIII** — `ckl-amendment-viii-world-profile` |
| **Status** | **partial** |
| **Split** | VII = human biometric/scale/organic; VIII = world profiles |

## Policy IDs (9)

| Order | ID | Role |
|------:|----|------|
| 10 | `world.biogeometric` | Umbrella / missing context |
| 11 | `world.terrain` | Domain |
| 12 | `world.architecture` | Domain |
| 13 | `world.water` | Domain |
| 14 | `world.plant` | Domain |
| 15 | `world.synthetic` | Domain |
| 16 | `world.material` | Cross-cut materialContext |
| 17 | `world.scaleContext` | Cross-cut scale + CIS SCAL verify |
| 18 | `world.variance` | Cross-cut environmental variance |

VII human gates remain orders 1–3 and evaluate first in `default.policies.json`.

## Wiring map

| Layer | Path |
|-------|------|
| Policies | `engine/governance/policies/default.policies.json` |
| Evaluator | `engine/governance/biometric/amendmentVIII.js` |
| Compat shim | `worldProfile.js` → VIII |
| CKL | `ConstitutionalKnowledgeLayer.js` condition `world_profile_ckl` |
| Bridge | `CklAmendmentVIIBridge.loadWorldProfile` (9 IDs) |
| Apply | `AmendmentVIIRenderApply` worldEntities / requireWorldContext |
| Engine3D | `WorldObject.entityContext` (+ materialContext, architectureContext) |
| Catalogs | `mrs/assets/world/profiles/world.*.json` |

## Honesty

| Concern | Status | Note |
|---------|--------|------|
| World-profile → CKL | **partial** | Lawful pass + missing-context HALT tested |
| Lemonade SD plates | **blocked** | Re-probe: SD HTTP 500 / sd-server — **not** auto-pass from VIII |
| CIS SCAL / Genblaze | **partial** helper (`verifyScalStep` ↔ `world.scaleContext`); Genblaze opcode **declared**/unbound |
| Full world engine | **not shipped** | |

## Tests

```text
node --test engine/governance/test/amendment-vii.test.js engine/governance/test/world-profile.test.js
npm run build --prefix mrs/packages/engine3d-core
node --test mrs/packages/engine3d-core/dist/test/face/amendment-vii-render-apply.test.js
```
