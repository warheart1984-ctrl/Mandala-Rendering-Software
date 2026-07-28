# CECP Ω∞ — Constitutional Engineering Crew Pipeline (v2.0)

> **Status:** **partial** — diagram matches MRS six-role crew + ESFR stage 06.
> Not a CI gate. Does **not** amend the charter.
>
> **Home:** `docs/governance/esfr/` · Protocol: `docs/governance/CECP_OMEGA_PROTOCOL.md`

```text
CECP Ω∞ — Constitutional Engineering Crew Pipeline (v2.0)
┌──────────────────────────────────────────────────────────┐
│  01 — Architect                                          │
│  Defines the constitutional contract, invariants,        │
│  and governed design.                                    │
└──────────────────────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────────────────────┐
│  02 — Builder                                            │
│  Produces scaffolding, stubs, structure, and             │
│  constitutional placeholders.                            │
└──────────────────────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────────────────────┐
│  03 — Implementor                                        │
│  Implements governed logic, boundary tests, and          │
│  deterministic behavior.                                 │
└──────────────────────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────────────────────┐
│  04 — Reviewer                                           │
│  Performs constitutional audit, contract validation,     │
│  and invariant enforcement.                              │
└──────────────────────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────────────────────┐
│  05 — Inspector                                          │
│  Executes evidence probes, determinism checks,           │
│  replay validation, and produces the InspectorVerdict.   │
└──────────────────────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────────────────────┐
│  06 — ESFR (Engineer Standards Final-Reviewer)           │
│  Ensures engineering standards, ecosystem coherence,     │
│  constitutional legitimacy, and promotion readiness.     │
│  Produces ESFRVerdict + PromotionEligibility.            │
│  Runs test-matrix.esfr.md + probes.esfr.md.              │
└──────────────────────────────────────────────────────────┘
```

## Final outputs

| Output | Meaning |
|--------|---------|
| **CECP Trail (01–06)** | Permanent stage artifacts under `docs/governance/cecp/trails/<id>/` |
| **Lineage Record** | Trail `lineage.json` and/or `docs/governance/esfr/lineage.esfr.json` |
| **Promotion Decision** | `PromotionEligibility`: `PROMOTE` \| `PROMOTE_WITH_GAPS` \| `HOLD` \| `REJECT` |
| **Reference Implementation Eligibility** | Registry inclusion only after Inspector + ESFR allow promotion (`promotion.esfr.md`) |

## Related

- ESFR protocol: `docs/governance/esfr/protocol.esfr.md`
- Test matrix: `docs/governance/esfr/test-matrix.esfr.md`
- Evidence probes: `docs/governance/esfr/probes.esfr.md`
- Crew skill: `.cursor/skills/mrs-crew/SKILL.md`
