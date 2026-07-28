# 05 — Inspector acceptance

**Trail:** `sovereign-x-gpu-assist-2026-07`  
**Role:** Inspector (+ Testwright / Librarian)  
**Date:** 2026-07-28  
**InspectorVerdict:** **PASS_WITH_GAPS**

## Acceptance vs Architect criteria

| Criterion | Result |
|-----------|--------|
| Alias nim_flux ↔ flux | PASS |
| Reject `/printer/*` + evidence SoT | PASS |
| determinismRequired → CPU | PASS |
| auto cascade NVIDIA→AMD→CPU | PASS |
| assistProvenance only on routes | PASS (router surface) |
| LookDev Steps 1–4 CPU hand-off | PASS (skeleton) |
| Charter honest status | PASS |
| Unit tests green | PASS — **25/25** |

## Command evidence

```text
npm test --prefix mrs/packages/sovereign-x-router
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

## Gaps

- No live GPU backend invoke
- LookDev engine declared only
- assistProvenance not yet wired into host evidence recorders (must stay out of print SoT)

## Boundary spot-check

Assist routes with `route: "api/printer/run"` → `PRINTER_ROUTE_BANNED`.  
`gpu.print.beauty` capabilityClass → `PRINT_SOT_BANNED`.  
Prior vendor-router reject paths still PASS (10 prior cases retained in suite).
