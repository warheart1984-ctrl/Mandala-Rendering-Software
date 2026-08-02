# 02 — Builder scaffold manifest — Priority #6

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority6-accounts-metering-pricing-2026-08` |
| `role` | Builder |
| `cites` | `01-architect-adr.md` |
| `status` | **partial** |

## 1. Intent

Scaffold `@mrs/rt4d-metering` from Architect ADR: package layout, schemas, stubs, test placeholders — no deep billing logic.

## 2. Scaffold manifest

| Path | Kind | Status tag |
|------|------|------------|
| `mrs/packages/rt4d-metering/package.json` | package meta | **partial** |
| `mrs/packages/rt4d-metering/README.md` | docs | **partial** |
| `mrs/packages/rt4d-metering/schemas/usage-record.schema.json` | schema | **partial** |
| `mrs/packages/rt4d-metering/schemas/credit-ledger-entry.schema.json` | schema | **partial** |
| `mrs/packages/rt4d-metering/src/types.js` | Zod types | **partial** |
| `mrs/packages/rt4d-metering/src/deriveCredits.js` | pure fn | **partial** (formula **declared**) |
| `mrs/packages/rt4d-metering/src/plans.js` | catalog | **declared** allotments |
| `mrs/packages/rt4d-metering/src/planGate.js` | gate | **partial** |
| `mrs/packages/rt4d-metering/src/ledger.js` | adapters | **partial** |
| `mrs/packages/rt4d-metering/src/softEmit.js` | hook | **partial** |
| `mrs/packages/rt4d-metering/src/httpStub.js` | HTTP stub | **partial** |
| `mrs/packages/rt4d-metering/src/index.js` | exports | **partial** |
| `mrs/packages/rt4d-metering/docs/ENGINE_EMIT_HOOK.md` | hook docs | **partial** |
| `mrs/packages/rt4d-metering/test/*.test.js` | unit tests | **partial** |

## 3. Dependency graph

```text
@mrs/rt4d-engine  --optional soft emit-->  @mrs/rt4d-metering
                                              │
                                              ├── zod (MIT, already in monorepo)
                                              └── node:fs / node:http (stdlib)

Future (declared): mrs/apps/rt4d-billing → @mrs/rt4d-metering
Plugin/gateway: pass-through only (no credit invention)
```

Workspace: `mrs/pnpm-workspace.yaml` already includes `packages/*`.

## 4. Build artifacts inventory

- Pure library package preferred over billing app (Architect decision).
- HTTP stub labeled **partial**.
- No Stripe SDK introduced.
- Root protected `schemas/` untouched.

## 5. Test placeholders

- `deriveCredits.test.js` — stability + fail-closed incomplete evidence
- `ledger.idempotent.test.js` — renderId idempotency + JSON file adapter
- `planGate.test.js` — deny overflow / unknown plan
- `joinRenderId.test.js` — evidence join fields persisted

## 6. Handoff to Implementor

Fill derivation formula constants (declared), ledger idempotency, plan gate fail-closed, soft emit wiring in engine behind flag, register `test:rt4d-metering` in `mrs/package.json`, append evidence-spec metering section.
