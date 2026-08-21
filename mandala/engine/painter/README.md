# AI Painter organ

Appearance under certified Mandala constraints. Does not commit physics.

| Mode | Status |
|------|--------|
| CPU field-tint | **working** |
| Free SD-Turbo (64×64 / 4 steps) | **partial** (Lemonade `:13307` → sd-server `:13306`) |
| Open local Anything-V5 | **working** golden — see [`docs/mandala/GOLDEN_PATH_PRO_PAINTER.md`](../../docs/mandala/GOLDEN_PATH_PRO_PAINTER.md) |
| Pro dual-key billing | **declared** — see [`docs/mandala/AI_PAINTER_PRO_TIER.md`](../../docs/mandala/AI_PAINTER_PRO_TIER.md) |

## Quick enable (open local)

```bash
node scripts/golden-painter.mjs
# → output/mandala-painter-open/frame.png + receipt.json
```

No `MANDALA_PRO_TIER` / dual key required locally. Optional e2e opt-in: `AI_PAINTER_UNCENSORED=1`. Legal adult fiction only; minors refused.
