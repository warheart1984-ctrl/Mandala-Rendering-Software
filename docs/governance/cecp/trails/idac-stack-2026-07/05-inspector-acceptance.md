# Inspector acceptance — IDAC stack E2E

**Trail:** idac-stack-2026-07  
**Inspector lens:** Testwright + Scientist

## Test matrix (2026-07-28)

Command:

```text
G:\.runtime\python-3.13.14\python.exe -m pytest ^
  mrs/apps/infinity-director/tests/test_idac_conformance.py ^
  mrs/apps/infinity-director/tests/test_accelerated_renderer.py ^
  mrs/apps/infinity-director/tests/test_render_accel_contract.py ^
  mrs/apps/infinity-director/tests/test_atcm.py ^
  mrs/apps/infinity-director/tests/test_direct_api.py -q
```

**Result:** 50 passed, 1 skipped (L2 multi-domain stub).

## L1

- `TestRouterHttpIntegrationL1::test_direct_api_uses_idac_router` — **PASS** (un-skipped)

## Live smoke

| Target | Result |
|--------|--------|
| `http://127.0.0.1:8787/health` | **200** (Director reachable) |
| `http://127.0.0.1:8791/health` | **down** (Genblaze not running — no live render smoke) |

## Inspector verdict

**ACCEPT_WITH_GAPS** — unit/API path proven; live Genblaze dispatch not exercised this run.
