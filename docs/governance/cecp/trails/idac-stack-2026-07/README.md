# CECP trail — IDAC Stack v0.1 (E2E crew pass)

**Trail id:** `idac-stack-2026-07`  
**ESFR:** PROMOTE_WITH_GAPS  
**Date:** 2026-07-28  
**Parent:** `director-atcm-2026-07`  
**Crew lenses:** Cartographer Architect · Blueprint Builder · Integrator Implementor · Conformance Reviewer · Testwright Inspector · ESFR Anchor

## Intent

Formalize Intent / Optimization / Execution / Evidence above RenderAccelContract; wire Infinity Director HTTP to IdacRouter for explicit ATCM/IDAC paths.

## Stage artifacts

| Stage | File |
|-------|------|
| 01 Architect | `01-architect-adr.md` |
| 02 Builder | `02-builder-scaffold-manifest.md` |
| 03 Implementor | `03-implementor-notes.md` |
| 04 Reviewer | `04-reviewer-conformance.md` |
| 05 Inspector | `05-inspector-acceptance.md` |
| 06 ESFR | `06-engineer-standards.md` |

## Delivered (this pass)

- `/api/direct` → `IdacRouter` when `speed_profile=atcm` (or aliases) / `atcm=true` / `idac=true`
- `POST /api/idac/intent` — clean IntentContract entry
- L1 HTTP test un-skipped; **50** targeted pytest passes

## E2E curl sequence (Director default `:8787`)

```bash
curl -s http://127.0.0.1:8787/health | jq .
curl -s -X POST http://127.0.0.1:8787/api/warmup | jq .
curl -s -X POST http://127.0.0.1:8787/api/atcm/plan \
  -H "Content-Type: application/json" \
  -d '{"width":256,"height":256,"prompt":"empty sky wall flat structure"}' | jq .
curl -s -X POST http://127.0.0.1:8787/api/direct \
  -H "Content-Type: application/json" \
  -d '{"prompt":"empty sky wall flat structure","speed_profile":"atcm"}' \
  | jq '{lane, context_used, atcm: .atcm.work_model, idac_verdict: .idac.validation.verdict, render_plan_id: .render_plan.id}'
```

Requires Genblaze for successful dispatch (502 if downstream down).

## Remaining gaps

- Per-tile Engine3D execution (declared only)
- CKL IDAC charter load
- ai/compile domains stub
- Live smoke blocked when Genblaze offline

## Cycle 4 (2026-07-28)

See `09-cycle4-esfr-pass.md` — verification-only.

## Cycle 3 (2026-07-28)

See `08-cycle3-esfr-pass.md` — killed stale `:8791`, fresh Director + route gate; live E2E on canonical ports.

## Cycle 6 (2026-07-28)

See `13-cycle6-performance-evidence.md`, `14-cycle6-esfr-pass.md` — multi-sample perf, C-08a CI, ops scripts, learning status API.

## Cycle 5 (2026-07-28)

See `11-cycle5-performance-evidence.md`, `12-cycle5-esfr-pass.md` — Performance samples, live L1 test, learning JSONL, waivers, certification checklist (**not certified**).

## Strategic freeze (2026-07-28)

See `10-idac-freeze-evidence-adr.md` — Core v0.1 frozen; evidence hierarchy; ESFR PROMOTE_WITH_GAPS until Performance + full Conformance.

## Cycle 2 (2026-07-28)

See `07-cycle2-esfr-pass.md` — live Genblaze smoke, validation/learning partial hardening, UI IDAC panel, **51** pytest passes.

## Related

- `mrs/apps/infinity-director/docs/IDAC_STACK.md`
- `mandala-agent-pack/docs/idac-stack-pointer.md`
- Mandala Mode: `.cursor/rules/mandala-mode.mdc` + `mrs-crew` / `mrs-implementor` skills
