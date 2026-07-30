# Engine3D soft-raster — behavior, invariants (Amendment VII + world-profile)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-30 (CCC-ImageGen non-blocking providers) |
| **Status** | Evidence-bound (**partial**) |
| **Order SoT** | `amendmentVII.order.json` + `default.policies.json` orders 1–3 then 10–18 |
| **Image gen SoT** | `docs/4d-engine/CCC_IMAGE_GEN.md` · `sovereign-x/governance/ccc-image-gen.json` |

Drive-G-1: **Held** only with real tests. Lemonade / CIS SCAL not Held without probe evidence.
Engine3D soft-raster beauty is a **separate** local path from CCC-ImageGen diffusion/plate providers.

---

## Invariants

| Invariant | Result | Evidence |
|-----------|--------|----------|
| CKL `policy-biometric-conformance` | **Held** | `amendment-vii.test.js` |
| CKL `policy-adaptive-scale` | **Held** | same |
| CKL `policy-organic-variance` | **Held** | same |
| CKL `world.biogeometric` | **Held** | `world-profile.test.js` (registration + lawful/HALT) |
| CKL `world.scaleContext` | **Held** | same + `verifyScalStep` ↔ scaleContext |
| CKL `world.architecture` / `world.terrain` | **Held** | order + domain HALT/pass in world-profile tests |
| CKL `world.water` / `world.plant` | **Held** | plant lawful pass; domain skip/mismatch tested |
| CKL `world.synthetic` / `world.material` / `world.variance` | **Held** | registration + variance HALT test |
| Soft Apply flow: bio→scale→organic→scaleContext→biogeometric→remaining | **Held** | `amendment-vii-render-apply.test.ts` |
| Missing world context HALTs | **Held** | `HALT:MISSING-WORLD-CONTEXT` |
| World engine / full biogeometric ecology | **Partial** | CKL path wired; not full world engine |
| CCC-ImageGen `image.gen.provider` | **Partial** | `ImageGenProvider.test.js` — GPU optional; fallback logged |
| Lemonade / diffusion beauty plates | **Degraded / partial** | When GPU/sd-server fail: **Provided via fallback …** if cascade continues; never “architecture blocked on GPU”. No GPU beauty claim without pixels. |
| CIS SCAL Genblaze opcode | **Partial** | `verifyScalStep` status **partial** via `world.scaleContext`; Genblaze bind **not shipped** |

---

## Policy order (canonical)

```
biometric → adaptiveScale → organicVariance →
world.biogeometric → world.scaleContext → world.architecture →
world.terrain → world.water → world.plant → world.synthetic →
world.material → world.variance
```

Apply soft-path evaluates world gates as: **scaleContext → biogeometric → remaining** after human triad.

---

## Honesty

World-profile CKL does **not** auto-pass Lemonade plates or Genblaze SCAL.

**CCC-ImageGen (2026-07-30):** Image generation requires a **provider**, not a local GPU. If `local.gpu` fails, fall through `local.cpu` → `remote.gpu` → `remote.service` and log `{ imageGenProvider, localGpuAvailable, fallbackUsed, reason }`. When fallback is used without pixels, status is **degraded/partial** with audit log — not “blocked on GPU”. Only claim plate pixels when a provider produced them. Soft-raster Engine3D stills remain out of scope for this contract.
