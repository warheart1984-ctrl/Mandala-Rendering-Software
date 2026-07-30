# CECP — Exact world-profile CKL patch (2026-07-30)

| Field | Value |
|-------|-------|
| **Status** | **partial** |
| **Shape** | User patch: `amendmentVII.order` + `kind: world-profile` + `haltOn` + Apply sequence |

## Order

`biometric` → `adaptiveScale` → `organicVariance` → `world.biogeometric` → `world.scaleContext` → `world.architecture` → `world.terrain` → `world.water` → `world.plant` → `world.synthetic` → `world.material` → `world.variance`

## Wiring

| Piece | Location |
|-------|----------|
| Order file | `engine/governance/policies/amendmentVII.order.json` |
| Policies | `default.policies.json` (orders 1–3, 10–18) |
| Registration | `amendmentVII.policies` in `amendmentVII.js` |
| Evaluate | `amendmentVIII.js` (shared) |
| Bridge | `CklAmendmentVIIBridge` / `enablePolicy` / `loadPolicyOrder` |
| Apply | bio→scale→organic → scaleContext → biogeometric → remaining |
| Contexts | `Engine3DContext.ts` (Object/World/Render) |

## Honesty

| Lemonade plates | **Blocked** (SD HTTP 500) |
| CIS SCAL | **Partial** (`verifyScalStep` + `world.scaleContext`) |
| World engine | **Partial** (not complete) |
