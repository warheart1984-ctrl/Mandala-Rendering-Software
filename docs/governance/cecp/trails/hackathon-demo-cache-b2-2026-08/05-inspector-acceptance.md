# 05 Inspector acceptance

## Probes

| Probe | Command / evidence | Result |
|-------|-------------------|--------|
| Unit | `pytest tests/test_demo_cache.py` | **18 passed** (2026-08-01) |
| Cascade order | DEFAULT_CASCADE gmi→…→hfspace | PASS |
| Claim labels | `source` ∈ {b2-cache, live-generate, structure-only} | PASS |
| Live GMI | Requires `GMI_API_KEY` + SDK | **GAP** (not run) |
| Live B2 fetch | Requires B2 creds + objects | **GAP** (not run) |

## Verdict

**PASS_WITH_GAPS** — unit evidence green; live credit/B2 paths operator-gated.
