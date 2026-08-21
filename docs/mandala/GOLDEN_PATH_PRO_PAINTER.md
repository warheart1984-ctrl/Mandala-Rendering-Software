# Golden path — open local AI Painter (Anything-V5)

Legal adult fiction only (*A Map Drawn in Salt* / salt-atlas). **No pro exports required** for local runs.

```bash
# 1) Services (Lemonade :13307 + optional sd-server :13306). Do not start a second sd-server.
# 2) Paint (open local — no MANDALA_PRO_TIER / AI_PAINTER_UNCENSORED needed)
node scripts/golden-painter.mjs
# 3) Optional overlay
node scripts/golden-painter.mjs --with-e2e
# 4) CPU last resort if SD unavailable
node scripts/golden-painter.mjs --allow-cpu
```

**Expected:** `output/mandala-painter-open/frame.png` + `receipt.json` with `tier=open`, `uncensored=true`, real `model` (prefer **Anything-V5** via `sd-cli` when Lemonade cannot load images because `:13306` is owned).

Alias (warns; same path): `node scripts/golden-pro-painter.mjs` — pro gate optional / deprecated for local.

### When dual pro keys still matter

Only if `MANDALA_BILLING_ENFORCE=1` (future SaaS stub): then require `MANDALA_PRO_TIER=1|AI_PAINTER_PRO=1` **and** `AI_PAINTER_UNCENSORED=1`. Local default does **not** set this.

E2e / default Mandala stays SD-Turbo/CPU unless you set `AI_PAINTER_UNCENSORED=1` (single opt-in) or use this golden script.

If Anything GGUF is missing: place `runtime/models/image/anything-v5-q4_0.gguf` (see `runtime/check-models.sh`). Lemonade `pull` of Anything-V5 alone is not enough while sd-server owns `:13306` — golden path uses **sd-cli** one-shot instead.
