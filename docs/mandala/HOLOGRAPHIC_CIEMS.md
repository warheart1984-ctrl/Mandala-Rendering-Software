# Holographic module as CIEMS / Sovereign lens (Claim A)

**Status:** **partial**  
**Claim A only** — synthetic holographic dual as a governance *lens*, not AdS/CFT, not charter edits.  
**Does not modify** `constitution/`, `engine/constitution/`, or `AGENTS.md`.

Reuses existing organs: **BulkSpacetimeEngine**, **HolographicEncoder**, **EGT**, **EntanglementRenderer**, **CIEMS** (Engine3D overlay / promotion checklist naming), **Sovereign X** / Mandala Sovereign stack vocabulary.

Companion bulk/boundary contract: [`HOLOGRAPHIC_BULK_BOUNDARY.md`](./HOLOGRAPHIC_BULK_BOUNDARY.md).

---

## Lens mapping

| Holography organ | Path | CIEMS-style layer | Role |
|------------------|------|-------------------|------|
| **BulkSpacetimeEngine** | `mandala/holography/bulk-spacetime-engine.mjs` | Implementation | Physical **substrate** (certified proto wrap; `stepBulk`) |
| **BoundaryProjection** / projector \(P\) | `boundary-projection.mjs`, `projector.mjs` | Specification | How bulk projects to boundary screen |
| **HolographicEncoder** + **EGT** | `holographic-encoder.mjs`, `egt.mjs` | Specification → Conformance | Informational dual \(\{EGT_t\}\); time-as-relationships |
| **EntanglementRenderer** / EFR | `entanglement-renderer.mjs`, `efr.mjs` | Stewardship | Audit visualization (ρ / \(w_{ij}\) / \(K\)) |
| **reconstruct** | `reconstruct.mjs` | Stewardship | Reconstruction error metrics (**partial/toy**) |
| Soft lab checks | `ciems-lab.mjs` | Conformance (soft) | Receipt invariants — **not** root CHARTER enforcement |

**Bulk = substrate.** **Boundary / EGT = information / audit layer.**

Declared CIEMS stack prose (lens only): Constitution → Specification → Conformance → Implementation → Deployment → Stewardship. This doc maps holography modules into that vocabulary; it does **not** promote holography into Engine3D CIEMS constitution files.

---

## Soft invariant (lab loop)

> **No bulk state change without corresponding boundary EGT update.**

In the holographic lab:

```
stepBulk(dt)  →  encoder.updateEGT(egt, bulk)
```

| Tag | Meaning |
|-----|---------|
| **partial** | Soft check in `ciems-lab.mjs` (`checkBulkEgtCoupling`, `runGovernedLabStep`) |
| **not enforced** | Does not block proto chamber / AAIS; receipt `ok: false` only |

Tiny plane scene analogue: each worldline frame advance must deposit/update EGT (already paired in `runTinyHolographicScene`).

Evidence: `mandala/holography/test/ciems-lab.test.js`.

---

## Sovereign console modes (optional)

Tiny HTML console: [`mandala/holography/console/holography-console.html`](../../mandala/holography/console/holography-console.html)

| View | Source metrics (from receipt) |
|------|--------------------------------|
| **Spacetime** | frames, \(v_x\), track / bulk notes, certifiedProto untouched |
| **Holographic** | maxRho, edgeSum, maxK, egtHash, EFR modes |
| **Governance** | reconstructionError, bulk↔EGT coupling, entanglement health (`governance` block) |

Open after generating a receipt:

```bash
node mandala/holography/test-scene.mjs
# then open holography-console.html (paste or load receipt.json fields)
```

---

## Substrate → Substration → Promotion (declared)

| Stage | Holography meaning | Status |
|-------|--------------------|--------|
| Substrate experiment | Tiny scene / interference lab | **partial** |
| Substration | Stable receipt patterns + tests | **partial** |
| Promotion | Engine3D / RT4D CIEMS checklist rows | **declared** — see `docs/4d-engine/engine3d/CIEMS_ENGINE3D_RT4D_PROMOTION_CHECKLIST.md`; holography **not** auto-promoted |

---

## Honesty

- Reconstruct = **partial/toy**; position error in receipt ≠ certified bulk hash recovery.
- CIEMS names reused from Engine3D / Sovereign stack — **homonym-safe** with hamiltonian CPE notes elsewhere.
- No constitution file edits for this lens.
