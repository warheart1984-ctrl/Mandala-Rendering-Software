# RenderAccelContract (Draft v0.1)

**Scope:** Infinity Director CPU preview still path · named accelerator **ATCM**  
**Status:** **declared** contract prose with **partial** Director hooks (see table)  
**Not:** CKL policy · not Digital Printer SoT · not Genblaze per-tile shading

Schemas: `../schemas/render-plan.schema.json`, `complexity-evidence.schema.json`, `replay-record.schema.json`, `render-violation.schema.json`

Related: [RENDER_CONSTITUTION.md](./RENDER_CONSTITUTION.md) · [CPU_FAST_PATH.md](./CPU_FAST_PATH.md) · [ACCELERATED_RENDERER.md](./ACCELERATED_RENDERER.md) · [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md)

---

## Article I — Named accelerator

ATCM (Adaptive Tile Complexity Minimization) is the sole **RenderAccelContract** accelerator in Director v0.1. It classifies tiles (cheap vs full) and estimates work reduction using a dimensionless model (`estimate_not_measured`).

## Article II — Router authority

Only **Infinity Director** may route an accelerated plan into dispatch. Genblaze/Engine3D receive normal still payloads; they do not self-invoke ATCM.

## Article III — No self-activation

ATCM runs only when the operator or API client sets `speed_profile=atcm` (or aliases `adaptive`/`tiles`) or `atcm=true`. Auto/fast/beauty paths must not attach ATCM contract artifacts.

## Article IV — Invariants

| Invariant | Meaning |
|-----------|---------|
| `print_sot: false` | Preview still; CPU RT4D print remains separate SoT |
| Full-frame dispatch | Genblaze/Engine3D still APIs render whole frames today |
| Work-model speedup | Any ~2× / “100% faster” language is **estimate_not_measured**, not wall-clock |
| No invented Genblaze flags | Director does not send ao/gi/raster env flags that APIs do not support |

## Article V — Evidence artifacts

When ATCM activates, Director emits:

- **RenderPlan** — tile grid, decisions, suggested fast/beauty, work model, optional **`math_strategies`** (declared bindings from `C_i`; see [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md))  
- **ComplexityEvidence** — prepass cues, mean complexity, scene graph hash **proxy**  
- **ReplayRecord** (skeleton) — dispatch correlation; tile timings **not** collected yet  

## Article VI — Failure → RenderViolation

If ATCM is required but prerequisites or plan build fail, Director returns a **RenderViolation**-shaped error (HTTP 422) and does **not** silently drop acceleration evidence while pretending ATCM ran.

Non-ATCM fast/beauty/auto paths are unchanged.

## Article VII — Replay and determinism

ReplayRecord on this path is **declared** / skeleton: verdict `unverified`, no per-tile timing stream. Bit-identical replay remains a future Engine3D/cluster concern (see CROS / engine3d-core).

---

## Enforcement vs code (honest)

| Article | Runtime check today | Tag |
|---------|---------------------|-----|
| I Named ATCM | `accelerator: ATCM` on artifacts | **partial** |
| II Router authority | Plans built in Director; dispatch via existing router | **partial** |
| III No self-activation | Gate in `api_direct` / tests | **partial** |
| IV Invariants | `print_sot`, `execution_mode`, work_model label in artifacts | **partial** |
| V Evidence | `render_plan`, `complexity_evidence`, `replay_record` on `/api/direct` | **partial** |
| VI RenderViolation | `RenderViolationError` → 422 JSON body | **partial** |
| VII Replay skeleton | Post-dispatch `ReplayRecord` with `tile_timings: null` | **declared** |

Implementation: `app/atcm.py`, `app/render_accel.py`, `app/accelerated_renderer.py`, `app/main.py`
