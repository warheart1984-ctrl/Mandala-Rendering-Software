# 01 — Architect ADR — RT4D Priority #6 Accounts / Metering / Pricing

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority6-accounts-metering-pricing-2026-08` |
| `feature` | Commercial layer boundaries: metering + credits + plan gates |
| `role` | Architect |
| `softwareCreationMode` | Modularist + Boundary-Guardian |
| `status` | **partial** (scaffold design; billing **declared**) |
| `started` | 2026-08-02 |

## 1. Intent

Land an honest commercial-layer scaffold so RT4D can grow from hosted runtime (P5 **partial**) into accounts → metering → credits → pricing → billing → ChatGPT access — without inventing a second usage authority outside the engine receipt chain.

## 2. ADR decision

### Context

- Priority #4: engine is sole hash/evidence authority; plugin fail-closed on `ENGINE_EVIDENCE_INCOMPLETE`.
- Priority #5: CDK synth + docker green; gateway fronts engine HTTP; **no live deploy**.
- User pricing tiers: Free / Creator / Pro / Studio — **no unlimited** early.
- CIEMS/JCR remain Drive-G external (**declared**).

### Decision

1. **Package, not app-first:** `@mrs/rt4d-metering` under `mrs/packages/rt4d-metering` owns pure ledger + credit derivation + plan gates. Thin HTTP stub may exist as **partial**; a future `mrs/apps/rt4d-billing` can host Stripe later without relocating authority.
2. **Authority diagram (non-negotiable):**

```text
┌─────────────────────────────┐
│ RT4D Engine (sole render ID │
│ + layered evidence hashes)  │
└──────────────┬──────────────┘
               │ verified receipt
               ▼
┌─────────────────────────────┐
│ deriveCreditsFromReceipt()  │  formula: declared until calibrated
└──────────────┬──────────────┘
               │ creditsUsed
               ▼
┌─────────────────────────────┐
│ Usage / Credit Ledger       │  append-only, idempotent on renderId
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ assertWithinPlanLimits()    │  fail-closed
└─────────────────────────────┘
```

3. **Plans catalog** declares Free/Creator/Pro/Studio allotments for gates; Stripe/Chargebee/ChatGPT billing remain **not live**.
4. **Engine soft emit** optional behind `RT4D_METERING_EMIT=1` + identity headers — never breaks render ACs.
5. **Schemas** live package-local (`schemas/` under the package + Zod). Do **not** touch root protected `schemas/` or constitutional paths.
6. **CIEMS/JCR:** commercial admission **declared** external — this package does not claim JCR enforcement.

### Consequences

- Commercial ops maturity stays **skeleton/partial** until accounts + billing providers ship with evidence.
- Credit formula must be labeled **declared** until unit-economics calibration.
- Plugin/gateway must pass through receipts — no wall-clock credit invention.

## 3. Interface specification

| Surface | Contract |
|---------|----------|
| `EngineReceipt` | `renderId`, `pixelHash`, `pngHash`, `projectionHash`, `runtimeFingerprint`, `evidenceStatus`, optional compute/storage/work dims |
| `UsageRecord` | `userId`, `planId`, `renderId`, `creditsUsed`, `computeSeconds`, `storageBytes`, `status` |
| `CreditLedgerEntry` | `entryId`, `userId`, `planId`, `renderId`, `creditsDelta`, `kind`, `recordedAt` |
| `PlanId` | `free` \| `creator` \| `pro` \| `studio` |
| Soft emit env | `RT4D_METERING_EMIT=1`; headers `x-rt4d-user-id`, `x-rt4d-plan-id` |
| Ban | No Stripe claims; no root `schemas/` edits; no `renderer-core` edits; no constitutional path edits |

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| `mrs/packages/rt4d-metering/**` | `constitution/`, `engine/constitution/`, policies, `AGENTS.md` |
| Soft emit helper in `mrs/apps/rt4d-engine` | `mrs/packages/renderer-core/**` |
| Evidence-spec appendix (declared) | Live Stripe/Chargebee/ChatGPT billing |
| CECP trail | AWS deploy / fake JCR commercial enforcement |

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/rt4d-metering/**` | create package | Builder/Implementor |
| `mrs/pnpm-workspace.yaml` | already covers `packages/*` | — |
| `mrs/package.json` | add `test:rt4d-metering` | Implementor |
| `mrs/apps/rt4d-engine/src/meteringEmit.ts` | soft emit | Implementor |
| `docs/4d-engine/rt4d/RT4D_ENGINE_EVIDENCE_SPEC.v1.md` | metering appendix | Implementor |
| CECP `01`–`06` + README | trail | Crew |

## 6. Acceptance criteria

- [ ] Package registered; unit tests for idempotent meter, credit stability, plan deny, renderId join
- [ ] Credit formula documented as **declared**
- [ ] Plan gate fail-closed
- [ ] Soft emit behind flag does not break engine tests when flag off
- [ ] No Stripe/billing live claims
- [ ] Protected paths untouched

## 7. Handoff to Builder

Scaffold `@mrs/rt4d-metering` layout (schemas, src stubs, test placeholders, README). Label HTTP stub and billing surfaces **partial**/**declared**. Leave derivation + ledger logic to Implementor.

## Anti-overclaim

- Do not claim production billing, ChatGPT paid access, or calibrated unit economics.
- CIEMS/JCR: **declared** only.
- Drive-G-2: commercial operations ≠ constitutional maturity.

## Cross-reference ledger

| CECP §9 / trail | Relevance |
|-----------------|-----------|
| `rt4d-priority5-hosted-mcp-2026-08` | Hosted runtime prerequisite (partial) |
| Priority #4 layered evidence | Receipt join fields / fail-closed incomplete evidence |
| `RT4D_ENGINE_EVIDENCE_SPEC.v1.md` | Evidence SoT + metering appendix |
