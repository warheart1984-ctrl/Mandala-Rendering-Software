# IDAC Reference Runtime — Certification Checklist

**Version:** 0.1.0 · **Runtime:** Infinity Director `app/idac/`  
**Certified:** **NO** (Cycle 7 — C-08b/C-10 partial; not all C-0x enforced)

| ID | Requirement | Required evidence | Current | Artifact / command |
|----|-------------|-------------------|---------|-------------------|
| C-01 | IntentContract wire matches schema | Verification | **partial** | `test_idac_conformance.py` L0 |
| C-02 | Optimizer must_not_execute | Verification | **partial** | Optimizer L0 tests |
| C-03 | Router sole initiator on IDAC HTTP paths | Operational | **partial** | Live E2E + mocked L1 |
| C-04 | Plan-faithful dispatch (drift → violation) | Verification | **partial** | `test_plan_drift_raises` |
| C-05 | PlanViolation paths covered | Verification | **enforced** | `TestPlanViolationL0` |
| C-06 | Validation beyond skeleton | Verification | **partial** | dispatch_result + trace checks |
| C-07 | Learning store (no invariant mutation) | Implementation + Verification | **partial** | JSONL + `GET /api/idac/learning/status` |
| C-08a | IDAC routes registered (non-404) | Verification | **enforced** | `test_idac_route_gate_ci.py` |
| C-08b | Live Genblaze dispatch | Operational | **partial** | Default CI: pytest; live: `IDAC_LIVE_AUTO=1` + `.github/workflows/idac-live-nightly.yml` |
| C-09 | Conformance waivers documented | Conformance | **enforced** | `IDAC_CONFORMANCE_WAIVERS.md` |
| C-10 | Performance provisional SLO (local) | Performance | **partial** | Cycle 7 JSONL + `IDAC_PERF_SLO=1` soft gate |
| C-11 | No fake tile-faithful / 2× claims | Conformance | **enforced** | `test_tile_faithful_dispatch.py` + waivers (perf-only W-TILE) |
| C-12 | Core freeze respected | Conformance | **enforced** | `docs/IDAC_CORE_FREEZE.md` |
| C-13 | IDAC-local charter gate | Verification | **enforced** | `charter_gate.py` + `test_idac_charter_gate.py` |

## Verdict

| Field | Value |
|-------|-------|
| **Certified reference runtime** | **false** |
| **ESFR** | **PROMOTE_WITH_GAPS** |
| **Blockers** | C-08b live matrix (nightly optional); C-10 provisional only; several C-0x **partial**; **W-TILE-FAITHFUL** performance-only |

## Ops enforcement (C-08b partial)

Run before claiming Operational maturity: `scripts/idac_route_gate.py` (`docs/IDAC_OPS.md`).

**2026-07-29 spot-check:** Genblaze `GET http://127.0.0.1:8787/health` → **200** when local service up; Director live matrix still requires Director on `:8791` (or configured port) for full C-08b pass.

## Performance provisional bar (C-10)

Local reference (not marketing 2×): plan p95 &lt; 1s; direct(atcm) p95 &lt; 30s. Enforced softly when `IDAC_PERF_SLO=1` (flaky without pinned hardware — optional CI job).
