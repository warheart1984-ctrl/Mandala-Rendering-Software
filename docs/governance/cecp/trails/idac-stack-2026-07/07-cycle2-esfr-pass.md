# Cycle 2 — IDAC stack crew + vendor skills pass

**Date:** 2026-07-28  
**Trail:** `idac-stack-2026-07` (append)  
**ESFR:** PROMOTE_WITH_GAPS (unchanged — no new overclaims)

## vs Cycle 1

| Area | Cycle 1 | Cycle 2 |
|------|---------|---------|
| `/api/direct` IDAC wiring | Done | Verified live on **fresh** Director |
| Live Genblaze | Down | **Up** `:8787` |
| Live full E2E | Blocked | **Pass** on `:8792` (workspace code) |
| Validation | skeleton checks | **partial** (+plan_ref, render_accel when ATCM) |
| Learning | recorded=false always on pass | **partial** in-memory candidate (`recorded=true`, no policy write) |
| UI | ATCM toggle only | **ATCM/IDAC panel**, plan button, idac summary |
| Tests | 50 passed | **51 passed**, 1 skipped |

## Crew notes (short)

- **Architect:** Port layout documented — Genblaze `:8787`, Director `:8791` per README; stale `:8791` process lacked Cycle 1 routes.
- **Builder:** Live smoke script + curl sequence in README trail section below.
- **Implementor:** validation/learning/UI hardening; no constitution edits.
- **Reviewer:** Drive-G-1 — learning `recorded=true` is **not** persistence; still partial.
- **Inspector:** pytest green; live E2E on `:8792` with Genblaze `:8787`.
- **ESFR:** Vendor boundaries checked (see matrix in parent report).

## Live smoke evidence

**Detected (2026-07-28):**

- `8787` → `mrs-genblaze-media` (200)
- `8791` → `mrs-infinity-director` (200) — **stale**: `/api/warmup`, `/api/atcm/plan` → 404; `/api/direct` atcm **without** `idac` bundle

**Fresh workspace Director** (`8792`, `DIRECTOR_GENBLAZE_BASE_URL=http://127.0.0.1:8787`):

| Step | HTTP | Key fields |
|------|------|------------|
| `GET /health` | 200 | `downstream.reachable=true` |
| `POST /api/warmup` | 200 | `status=ok` |
| `POST /api/atcm/plan` | 200 | `work_model.label=estimate_not_measured` |
| `POST /api/direct` atcm | 200 | `idac.validation.verdict=pass`, `learning.recorded=true`, preview run_id set |

Preview path: `/api/preview/{run_id}` on Genblaze base.

**Operator action:** restart Director on `:8791` (or use `:8792`) after pulling workspace code to pick up IDAC routes + UI.

## Vendor / platform checks

- **Render platform:** bind `0.0.0.0:$PORT`; ephemeral FS — no reliance on local preview cache for production (Director dispatches to Genblaze).
- **Genblaze BYOK / assist:** NIM/FLUX assist ≠ print SoT; Director does not send invented AO/GI/raster_mode flags (`render_profiles.unsupported_flags` honesty).
- **GPU assist skill:** IDAC/ATCM remain **CPU-first** planning; full-frame Engine3D dispatch — no GPU tile shader claim.
- **Mandala Mode / mrs-crew:** trail pointers updated; checklist gap closed for L1 live path (with restart caveat).

## Test command

```text
G:\.runtime\python-3.13.14\python.exe -m pytest ^
  mrs/apps/infinity-director/tests/test_idac_conformance.py ^
  mrs/apps/infinity-director/tests/test_accelerated_renderer.py ^
  mrs/apps/infinity-director/tests/test_render_accel_contract.py ^
  mrs/apps/infinity-director/tests/test_atcm.py ^
  mrs/apps/infinity-director/tests/test_direct_api.py -q
```

**Result:** 51 passed, 1 skipped.

## Remaining gaps

- Restart/long-running Director may lag workspace (ops, not code)
- Per-tile execution, CKL IDAC charter, bit-identical replay
- Learning has no storage/adaptation loop
