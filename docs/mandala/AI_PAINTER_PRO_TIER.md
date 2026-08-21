# AI Painter — open local + pro-tier (declared billing)

**Organ:** AI Painter (emotion/appearance). Separate from the Dolphin actor LLM (`scripts/actor-decision-engine.mjs`).

**Status:**
- **Open local golden path** — **working** (`node scripts/golden-painter.mjs`, no dual pro env).
- Dual pro+uncensored env — **declared for future SaaS billing** (`MANDALA_BILLING_ENFORCE=1`). Helpers kept; not required locally.
- Live Anything-V5 synthesis — **partial** (Lemonade model list / load; sd-cli fallback).

## Legal scope

- Legal **adult** fiction / film themes only (consenting adults 18+).
- Sexual / exploitative content involving **minors is refused** (hard deny).
- Weapons / CSAM paths remain disallowed per agent policy.

## Default (free / non-open)

| Setting | Behavior |
|---------|----------|
| Env unset | Safer path only |
| Models | CPU field-tint and/or **SD-Turbo** (Lemonade `:13307`, then sd-server `:13306`) |
| Anything-V5 | **OFF** |
| Prompts | Certified constrained lattice prompt — no uncensored adult system language |
| Resolution | **64×64**, 4 steps (never 512/1024) |

```bash
node mandala/engine/run-e2e.mjs
# receipt: painter.tier=free|pro, painter.uncensored=false, painter.backend=cpu-field-tint|sd-turbo
```

## Open local golden path (working)

Copy-paste — **no pro exports**:

```bash
node scripts/golden-painter.mjs
```

See [`GOLDEN_PATH_PRO_PAINTER.md`](./GOLDEN_PATH_PRO_PAINTER.md).

When Lemonade `:13307` cannot load Anything-V5 because sd-server already owns `:13306`, the golden path uses **sd-cli** Anything-V5 Q4 (CPU-safe) and records `via=sd-cli` / `backend=anything-v5` honestly. It does **not** spawn a second sd-server.

## Local single opt-in (e2e / paint)

Without billing enforce, unlock Anything-V5 / adult dramatic with **one** of:

1. `AI_PAINTER_UNCENSORED=1` (single opt-in — **no** pro key), or
2. `AI_PAINTER_OPEN=1`, or
3. `node scripts/golden-painter.mjs` (`localOpen`)

```bash
export AI_PAINTER_UNCENSORED=1
node mandala/engine/run-e2e.mjs --pro-uncensored-painter --theme "adult dramatic novel confrontation"
```

Receipt `painter.tier` is `open` (local) or `pro` when dual pro+uncensored env is also set.

## Declared: future billing dual key

Set `MANDALA_BILLING_ENFORCE=1` to require both:

1. Pro entitlement: `MANDALA_PRO_TIER=1` **or** `AI_PAINTER_PRO=1`
2. Explicit opt-in: `AI_PAINTER_UNCENSORED=1`

CLI `--pro-uncensored-painter` alone is **never** enough. Golden `localOpen` does **not** bypass billing enforce.

## Request without entitlement

If uncensored is requested without local unlock (and without billing dual key when enforce is on), the path is **denied**. Free safer painting may still proceed. Anything-V5 is not silently enabled.

## Receipt fields

| Field | Meaning |
|-------|---------|
| `painter.tier` | `open` \| `pro` \| `free` |
| `painter.uncensored` | `true` when unlocked and path engaged |
| `painter.backend` | `cpu-field-tint` \| `sd-turbo` \| `anything-v5` \| `sd-turbo-fallback` \| … |
| `painter.uncensoredDenied` | set when uncensored was requested without entitlement |

## Implementation

- `mandala/engine/painter/pro-tier.mjs` — `isProPainterUnlocked()`, `resolvePainterBackend()`, `isBillingEnforce()`
- `scripts/golden-painter.mjs` — open local golden path
- `scripts/golden-pro-painter.mjs` — thin deprecated local wrapper (warns)
- `mandala/engine/painter/index.mjs` — organ paint path
- `mandala/engine/run-e2e.mjs` — CLI + receipt

## Gap (declared)

Real billing / Stripe subscription verification is **not** wired. `MANDALA_BILLING_ENFORCE` + dual env is the stub until a paid product gate is implemented.
