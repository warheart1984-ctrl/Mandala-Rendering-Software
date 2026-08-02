# 03 — Implementor notes — Priority #6

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority6-accounts-metering-pricing-2026-08` |
| `role` | Implementor |
| `status` | **partial** |

## 1. Intent fulfilled

Implemented `@mrs/rt4d-metering` with verified-receipt credit derivation, append-only idempotent ledger, fail-closed plan gates, optional soft emit from RT4D engine, package-local schemas, and unit tests. Billing providers remain **not live**.

## 2. Files touched

| Path | Change |
|------|--------|
| `mrs/packages/rt4d-metering/**` | new package |
| `mrs/package.json` | `test:rt4d-metering` + workspace test chain |
| `mrs/apps/rt4d-engine/package.json` | dep `@mrs/rt4d-metering` |
| `mrs/apps/rt4d-engine/src/meteringEmit.ts` | soft emit helper |
| `mrs/apps/rt4d-engine/src/index.ts` | call soft emit after successful render |
| `docs/4d-engine/rt4d/RT4D_ENGINE_EVIDENCE_SPEC.v1.md` | Priority #6 appendix (**declared**) |
| CECP trail `01`–`06` + README | crew artifacts |

**Not touched:** `constitution/`, `engine/constitution/`, `engine/governance/`, `engine/conformance/`, `AGENTS.md`, root protected `schemas/`, `mrs/packages/renderer-core/**`.

## 3. Unit / integration test inventory

| Test file | Enforces |
|-----------|----------|
| `deriveCredits.test.js` | Deterministic credits; declared formula; `ENGINE_EVIDENCE_INCOMPLETE` fail-closed; required join hashes |
| `ledger.idempotent.test.js` | Same `renderId` does not double-charge; JSON-file reload idempotency |
| `planGate.test.js` | Within-allotment allow; overflow deny; unknown plan deny; ledger deny |
| `joinRenderId.test.js` | Usage keyed by `renderId` with evidence join fields |

## 4. Commands run + results

```bash
pnpm install --filter @mrs/rt4d-metering --filter @mrs/rt4d-engine
node --test packages/rt4d-metering/test/*.test.js   # 12/12 pass
pnpm --filter @mrs/rt4d-engine test                 # 23/23 pass
```

See also `05-inspector-acceptance.md`.

## 5. Status tag updates

| Surface | Tag |
|---------|-----|
| Credit formula | **declared** |
| Ledger adapters | **partial** |
| Plan gate | **partial** |
| HTTP stub / soft emit | **partial** |
| Plans catalog | **declared** |
| Stripe / Chargebee / ChatGPT billing | **not live** |
| CIEMS/JCR commercial | **declared** (external) |

## 6. Remaining gaps

- No user-account service / auth IdP
- No Stripe/Chargebee integration
- Credit formula not cost-calibrated
- No hosted multi-tenant ledger store
- Soft emit requires identity headers (accounts layer not built)
- ChatGPT app paid access not wired

## 7. Handoff to Reviewer

Audit authority boundaries (no duplicated credit math), protected-path hygiene, honest tags, and P4 evidence join fail-closed behavior.
