# Implementor notes — IDAC stack E2E wiring

**Trail:** idac-stack-2026-07  
**Mode:** Integrator + Constructor Implementor  
**ESFR:** PROMOTE_WITH_GAPS

## Intent

Close L1 gap: `POST /api/direct` for explicit ATCM/IDAC through `IdacRouter.handle_intent` without breaking auto/fast/beauty.

## Files touched

- `app/idac_direct_bridge.py` — new bridge
- `app/main.py` — IDAC branch; `POST /api/idac/intent`
- `app/models.py` — `idac` request flag + response bundle field
- `app/idac/core/router.py` — `prepass_png` passthrough
- `app/idac/domains/rendering/adapters.py` — store full `complexity_evidence`
- `app/idac/domains/rendering/runtime.py` — dispatch via `app.main.dispatch_render`
- `tests/test_idac_conformance.py` — L1 integration; patch targets updated

## Behavior

- `idac_path_requested`: `idac=true` **or** explicit ATCM (`atcm=true` / `speed_profile=atcm|adaptive|tiles`)
- IDAC path returns `DirectResponse` plus nested `idac.{intent,plan,evidence,validation,learning}`
- `/api/atcm/plan` still uses AcceleratedRenderer plan-only surface

## Verified

```text
50 passed, 1 skipped — pytest matrix (Inspector 2026-07-28)
```

## Anti-overclaim

- No measured 2× FPS
- Genblaze remains full-frame
- Validation/Learning skeleton

## Residual

- Circular coupling: RenderExecutor imports `app.main.dispatch_render` for test/mocks and single dispatch hook
- Live Genblaze smoke not run (8791 down)
