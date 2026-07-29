# Architect ADR — IDAC stack E2E wiring

**Trail:** `idac-stack-2026-07`  
**Lens:** Cartographer Architect + Pipeline-Conductor  
**Status:** partial

## Intent

Place IDAC above AcceleratedRenderer/ATCM for explicit governed paths; keep legacy `/api/direct` for auto/fast/beauty.

## Layer map

```text
HTTP (/api/direct, /api/idac/intent)
  → IdacRouter.handle_intent (render domain)
    → Optimizer (request_plan) + RenderOptimizerAdapter (ATCM + RenderPlan)
    → RenderExecutor → app.main.dispatch_render → Genblaze (full-frame)
  Legacy /api/direct (auto|fast|beauty): planner → dispatch (no IDAC bundle)
POST /api/atcm/plan → AcceleratedRenderer.request_plan_only (estimate-only)
```

## Decision

- **ATCM / explicit `idac=true`** on `POST /api/direct` routes through `IdacRouter`; response adds `idac` bundle plus existing RenderAccel fields.
- **auto/fast/beauty** unchanged (no self-activated ATCM).

## Acceptance

- L1 conformance: direct + atcm uses IdacRouter (test un-skipped).
- Drive-G-1: full-frame Genblaze; `estimate_not_measured`; no fake AO/GI flags.

## Handoff

Builder inventory + Implementor bridge (`app/idac_direct_bridge.py`).
