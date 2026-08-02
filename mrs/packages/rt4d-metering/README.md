# `@mrs/rt4d-metering`

Usage metering + credit ledger scaffold for RT4D commercial layer.

| Concern | Status |
|---------|--------|
| Types / Zod + JSON schemas | **partial** |
| `deriveCreditsFromReceipt` | **partial** (formula **declared**) |
| In-memory / JSON-file ledger | **partial** |
| Plan limit gate | **partial** (fail-closed) |
| HTTP stub / soft emit | **partial** |
| Stripe / Chargebee / ChatGPT billing | **not live** |
| CIEMS / JCR commercial admission | **declared** (external) |

## Authority

```text
engine verified receipt → meter → credit ledger → plan gates
```

Plugin/gateway must not invent credit math from wall-clock alone.

## Tests

```bash
pnpm --filter @mrs/rt4d-metering test
```

## CECP trail

`docs/governance/cecp/trails/rt4d-priority6-accounts-metering-pricing-2026-08/`
