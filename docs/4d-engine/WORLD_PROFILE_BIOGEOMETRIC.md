# World-Profile / Biogeometric — Amendment VIII foundation

| Field | Value |
|-------|-------|
| **Status** | **partial** (Amendment VIII world-profile → CKL); full world engine **not shipped** |
| **Amendment** | **VIII** — `ckl-amendment-viii-world-profile` (VII stays human biometric) |
| **Not claimed** | Full ecology sim; Lemonade SD plates PASS; Genblaze CIS SCAL opcode bind |

## CKL policy IDs (9)

| # | Policy ID | Severity | Role |
|---|-----------|----------|------|
| 10 | `world.biogeometric` | critical | Umbrella |
| 11 | `world.terrain` | critical | Domain |
| 12 | `world.architecture` | high | Domain |
| 13 | `world.water` | high | Domain |
| 14 | `world.plant` | critical | Domain |
| 15 | `world.synthetic` | high | Domain |
| 16 | `world.material` | high | Cross-cut |
| 17 | `world.scaleContext` | critical | Cross-cut + SCAL verify |
| 18 | `world.variance` | critical | Cross-cut |

SoT: `default.policies.json`. Evaluator: `amendmentVIII.js`. Opt-in: `worldProfileAmendment` / `enforceWorldProfile`.

## Honesty

- **Lemonade plates:** VIII does **not** auto-pass plates. Re-probe separately; SD failure ≠ missing world law alone.
- **CIS SCAL:** `verifyScalStep` wired to `world.scaleContext` (**partial**); Genblaze bind still unbound.
- **World engine:** path **partial**, not complete.

See `docs/4d-engine/proofs/world-engine/RENDERER_BEHAVIOR_INVARIANTS.md` and CECP `10-amendment-viii-world-profile.md`.
