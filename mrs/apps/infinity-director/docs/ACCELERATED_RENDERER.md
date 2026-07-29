# AcceleratedRenderer (Draft v0.1)

**Identity:** CPU-centric governed render pipeline for Sovereign X / Infinity Director.  
**Applies to:** SX Router (Director dispatch), Engine3D stills, Genblaze lanes, ATCM tile planner.  
**Status:** **partial** — `request` + contract artifacts are implemented; `execute` is full-frame dispatch only.

**Implementation facade:** `app/accelerated_renderer.py`  
**Named accelerator (v0.1):** ATCM via [RenderAccelContract](./RENDER_ACCEL_CONTRACT.md)

Related:

- [RENDER_CONSTITUTION.md](./RENDER_CONSTITUTION.md)
- [RENDER_ACCEL_CONTRACT.md](./RENDER_ACCEL_CONTRACT.md)
- [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md)
- [CPU_FAST_PATH.md](./CPU_FAST_PATH.md)
- CECP trail: `docs/governance/cecp/trails/director-atcm-2026-07/`
- Crew foreman: `.cursor/skills/mrs-crew/SKILL.md` (Director acceleration workstreams)

Schemas: `../schemas/render-plan.schema.json`, `complexity-evidence.schema.json`, `replay-record.schema.json`, `render-violation.schema.json`

---

## 1. Purpose

AcceleratedRenderer (AR) is the **governed pipeline name** for how Director turns render intent into:

1. A **RenderPlan** + **ComplexityEvidence** (planning / prepass / complexity), and  
2. A **FinalFrame** (downstream still result) + **ReplayRecord** skeleton (correlation only today).

RenderAccelContract defines the artifact shapes; AR defines the **stage graph** and module boundaries. Drive-G-1: tags below match **code evidence**, not roadmap wish.

---

## 2. Pipeline stages (1–5)

| Step | Name | Director behavior today | Tag |
|------|------|-------------------------|-----|
| 1 | Intent | `validate_atcm_prerequisites` (prompt or `scene_spec`, positive frame) | **partial** |
| 2 | Prepass / complexity | `plan_atcm` — optional PNG prepass, prompt cues, per-tile complexity | **partial** |
| 3 | RenderPlan | `build_render_plan` + `build_complexity_evidence` (RenderAccelContract) | **partial** |
| 4 | Execute | `execute()` → existing `build_plan` + `build_dispatch_target` + `dispatch_render` (**full frame**) | **partial** |
| 5 | ReplayRecord | `build_replay_record_skeleton` post-dispatch; no tile timings | **declared** |

**API entrypoints**

- `POST /api/atcm/plan` — steps 1–3 only (`request_plan_only`)
- `POST /api/direct` with `speed_profile=atcm` or `atcm=true` — steps 1–5 when AR enabled

---

## 3. Modules

### AR.Geometry — hierarchical Z, BVH reuse → visibility map per tile

| Claim | Evidence | Tag |
|-------|----------|-----|
| Tile grid over frame | `atcm.make_tiles`, `plan_atcm` | **partial** |
| BVH / hierarchical Z visibility map | Not in Director | **declared** |
| Per-tile visibility evidence on RenderPlan | Tile rects + complexity only | **partial** |

### AR.Materials — clustering, BRDF approx → per-tile shading config

| Claim | Evidence | Tag |
|-------|----------|-----|
| Material complexity proxy | `prompt_complexity_cues` in `atcm.py` | **partial** |
| BRDF cluster / per-tile shading config | Not emitted to Genblaze | **declared** |

### AR.Lighting — ATCM scoring, adaptive spp, probes/AO hints

| Claim | Evidence | Tag |
|-------|----------|-----|
| Per-tile cheap vs full classification | `TileDecision.mode`, work units | **partial** |
| Adaptive spp / probe / AO hints to downstream | Not sent (no invented flags) | **declared** |
| ComplexityEvidence + sampling plan proxy | `work_model`, `prepass` on artifacts | **partial** |

### AR.PostFX — low-res + upscale, tile-aware post → FinalFrame

| Claim | Evidence | Tag |
|-------|----------|-----|
| Tile-aware post | Not implemented | **declared** |
| Final frame | Genblaze still JSON in `DirectResponse.result` | **partial** |

Math substrate index: [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md).

---

## 4. Invariants

| Invariant | Meaning | Enforcement today | Tag |
|-----------|---------|-------------------|-----|
| No tile without evidence | RenderPlan must carry tile decisions when executing AR path | `validate_render_plan_for_execute`, `build_render_plan` empty-tile check | **partial** |
| No render without plan | `execute` requires RenderPlan + ComplexityEvidence | `accelerated_renderer.execute` | **partial** |
| Plan-faithful execution | Downstream should honor tile modes | **Not** — full-frame dispatch only; noted on ReplayRecord | **declared** |
| Replay determinism | Bit-identical replay | Skeleton only; `verdict: unverified` | **declared** |
| Router authority | Only Director routes accelerated plans | `routerAuthority: infinity-director`; AR enabled only via client flags | **partial** |
| No self-activation | `auto` / `fast` / `beauty` alone must not run AR | `pipeline_explicitly_enabled` + tests | **partial** |

Failures on the accelerated path use **RenderViolation** (HTTP 422): `RenderViolationError` → JSON body per schema.

---

## 5. Public interfaces (facade)

```text
request  → (RenderPlan, ComplexityEvidence)   # + internal atcm_report
execute  → (FinalFrame proxy, ReplayRecord)   # FinalFrame = dispatch result dict
```

Python (`app/accelerated_renderer.py`):

- `request_for_direct(body, prepass_png?)` → `AcceleratedRequestResult | None`
- `request_plan_only(...)` → `AcceleratedRequestResult`
- `execute(settings, body, render_plan, complexity_evidence, ...)` → `AcceleratedExecuteResult`

**Execute gap (explicit):** Step 4 does **not** iterate tiles or pass cheap/full modes to Genblaze. It validates contract invariants, picks lane via existing planner, and dispatches one still payload. Tile decisions are **evidence** for future tile-aware soft-raster / cluster paths.

---

## 6. Router authority & activation

- Genblaze / Engine3D do **not** invoke ATCM or AR.
- Activation requires `atcm=true` or `speed_profile` in `{atcm, adaptive, tiles}` (`render_accel.atcm_explicitly_requested`).
- `/api/atcm/plan` is treated as explicit operator intent (plan-only).

---

## 7. Work-model / speed claims

Any ~2× or “100% faster” language maps to ATCM **work units** (`WORK_CHEAP=0.25`, `WORK_FULL=1.0`) with label `estimate_not_measured`. Not wall-clock FPS. See CECP trail README.

---

## 8. Promotion checklist

| Target | Needs |
|--------|--------|
| AR.Geometry **partial→enforced** | BVH-backed visibility feed into tile evidence + tests |
| Plan-faithful execute **declared→partial** | Downstream tile API or Director-side compositor |
| Replay **declared→partial** | Per-tile timing stream + replay verifier |
| CKL binding | Policy hooks for RenderViolation (not present) |

Current code map: `app/accelerated_renderer.py`, `app/atcm.py`, `app/render_accel.py`, `app/main.py`, `app/dispatch.py`.
