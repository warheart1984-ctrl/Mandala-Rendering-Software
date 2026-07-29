# Builder scaffold — IDAC stack

**Trail:** idac-stack-2026-07

## E2E file inventory

| Path | Role |
|------|------|
| `app/idac/core/*` | Intent, Optimizer, Router, Validation, Learning |
| `app/idac/domains/rendering/*` | Render adapters + RenderExecutor |
| `app/idac_direct_bridge.py` | DirectRequest ↔ IntentContract ↔ DirectResponse |
| `app/accelerated_renderer.py` | Plan-only facade (`/api/atcm/plan`) |
| `app/atcm.py`, `app/render_accel.py` | Tile model + contract artifacts |
| `app/main.py` | `/health`, `/api/warmup`, `/api/atcm/plan`, `/api/direct`, `/api/idac/intent` |
| `schemas/idac-*.json`, `render-*.json` | CIEMS wire shapes |
| `tests/test_idac_conformance.py` | L0 + L1 HTTP integration |
| `tests/test_*atcm*`, `test_render_accel_contract.py`, `test_direct_api.py` | Regression |

## Runnable E2E path (API)

1. `GET /health`
2. `POST /api/warmup` (optional)
3. `POST /api/atcm/plan` `{ "width": 256, "height": 256, "prompt": "..." }`
4. `POST /api/direct` `{ "prompt": "...", "speed_profile": "atcm" }` **or** `{ "idac": true, ... }`
5. Inspect `idac.intent`, `idac.plan`, `idac.evidence`, `idac.validation`, plus `render_plan`, `atcm.work_model.label`

Clean IDAC wire: `POST /api/idac/intent` with full `IntentContract` JSON.
