# CECP note — world-profile → CKL (2026-07-30)

| Field | Value |
|-------|-------|
| **Trail** | `world-engine-probe-2026-07` (+ sx-arch-gaps lineage) |
| **Status** | **partial** |
| **Intent** | Soft-gate Apply is constitutional for humans/scale/organic; wire missing **world-profile → CKL** so world objects are governed |

## Delivered

1. Six CKL policies: `world.biogeometric`, `world.terrain`, `world.architecture`, `world.water`, `world.plant`, `world.synthetic`
2. `engine/governance/biometric/worldProfile.js` + CKL `resolveDecision` condition `world_profile_ckl`
3. `CklAmendmentVIIBridge.loadWorldProfile` + Apply world-entity soft correct / HALT
4. `WorldObject.entityContext` (object type, world/parent/terrain/architectural context)
5. Minimal catalogs under `mrs/assets/world/profiles/`
6. Tests: lawful pass + missing-context HALT

## Explicit non-claims

| Concern | Status |
|---------|--------|
| Lemonade SD beauty plates | **blocked** (sd-server / SD HTTP 500 on re-probe) — world-profile IDs do not imply PASS |
| CIS SCAL / Genblaze | **declared** — `verifyScalStep` only |
| Full constitutional world engine | **not shipped** |

## Evidence

- `docs/4d-engine/proofs/world-engine/RENDERER_BEHAVIOR_INVARIANTS.md`
- `docs/4d-engine/WORLD_PROFILE_BIOGEOMETRIC.md`
- `engine/governance/test/world-profile.test.js`
- `mrs/packages/engine3d-core/test/face/amendment-vii-render-apply.test.ts`
