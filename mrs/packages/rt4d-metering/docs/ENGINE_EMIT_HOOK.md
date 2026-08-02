# Engine → metering emit hook

| Field | Value |
|-------|-------|
| Status | **partial** |
| Package | `@mrs/rt4d-metering` |
| Authority | Engine owns render identity + layered evidence; metering only translates verified receipts |

## Rule

Pricing must consume **verified usage records**. Never estimate credits from wall-clock alone in the plugin/gateway.

```text
engine receipt (renderId + hashes + evidenceStatus)
        │
        ▼
deriveCreditsFromReceipt()   ← declared formula until cost-calibrated
        │
        ▼
append-only ledger (idempotent on renderId)
        │
        ▼
assertWithinPlanLimits()     ← fail-closed
```

## Soft emit (opt-in)

Set `RT4D_METERING_EMIT=1` on the RT4D engine process. When enabled, after a successful render the engine may call `softEmitUsage()` with:

- `userId` from `x-rt4d-user-id` (required to emit)
- `planId` from `x-rt4d-plan-id` (default `free`)
- engine receipt fields: `renderId`, `pixelHash`, `pngHash`/`sha256`, `projectionHash`, `runtimeFingerprint`, `evidenceStatus`

If the flag is off, identity headers are missing, or evidence is incomplete, emit is a no-op and **must not** fail the render response.

## What is not live

- Stripe / Chargebee / ChatGPT billing
- Hosted multi-tenant account service
- Cost-calibrated credit economics (formula remains **declared**)
- CIEMS/JCR admission of commercial usage (**declared** external)
