# HoloRT4D Spatial Tokens — SDK & pricing

## Install (scaffold)

```bash
# Workspace package
cd mrs/packages/spatial-tokens-sdk
npm install
```

Package: `@mrs/spatial-tokens-sdk` (**skeleton** client + re-exports of math).

## Local math (preferred)

```ts
import {
  tokenizeFromDepthGrid,
  hashSpatialToken,
  SPATIAL_TOKEN_STATUS,
} from "@mrs/spatial-tokens-sdk";

const token = tokenizeFromDepthGrid(depthF32, { width: 64, height: 64, resolution: 16 });
const hash = hashSpatialToken(token);
```

Local tokenize from Float32 depth is **enforced** (renderer-core math).

## API client (skeleton)

```ts
import { HoloRT4DClient } from "@mrs/spatial-tokens-sdk";

const client = new HoloRT4DClient({ baseUrl: "http://localhost:8792" });
const res = await client.tokenize({
  depth_f32: Array.from(depthF32),
  width: 64,
  height: 64,
  resolution: 16,
});
// res.hash, res.token, res.price_usd (declared)
```

## Pricing tiers (product brief — declared)

| Tier | Price | Notes |
|------|-------|-------|
| Per call | **$1** | Documented stub; not charged in scaffold |
| Pack 10 | **$10** | Brief parity with holo-depth credits — **declared** |
| Self-host CLI | **$0** | Local depth grids via `holort4d-tokenize.mjs` |

No Stripe keys. No real metering in this scaffold.

## Status

| Piece | Tag |
|-------|-----|
| `tokenize()` local | enforced |
| `HoloRT4DClient` | skeleton |
| Billing | declared |
