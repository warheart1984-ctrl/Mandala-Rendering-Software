# 05 — Inspector acceptance

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | One npm command exists | PASS | `package.json` `mrs:governed-render` |
| 2 | Prompt required | PASS | exits 2 without `--prompt` |
| 3 | Writes still under `tmp/governed-render/<runId>/` | PASS | invoke |
| 4 | Writes verification-trail.json | PASS | provider, policyOrder, hashes, lemonade held |
| 5 | Same prompt+flags → same runId | PASS | sha256 slice |
| 6 | Does not claim Lemonade pixels | PASS | `lemonade.status: held` |
| 7 | Quality log present | PASS | `docs/4d-engine/QUALITY_PROGRESS_LOG.md` |

**InspectorVerdict:** `PASS_WITH_GAPS`

Gaps: soft-raster fixture look; opencl.gen optional; prompt heuristics only.
