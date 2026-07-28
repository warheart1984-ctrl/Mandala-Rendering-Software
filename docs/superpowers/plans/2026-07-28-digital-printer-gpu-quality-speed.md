# Digital Printer GPU Quality-Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver quality-then-speed for Digital Printer without free-lunch fiction: measure quality-per-sample on CPU SoT, then add a parity-gated WebGPU backend; keep Genblaze NVIDIA NIM as assist only.

**Architecture:** CPU print path remains SoT (`print_request.py` profiles + `pipeline.py`). A future `backend` selector may route to WebGPU RT4D only after CPU↔GPU parity receipts pass. NIM/FLUX never write print beauty SoT.

**Tech Stack:** Python printer adapter, Node `renderer-core` RT4D / WebGPU (partial), Genblaze NIM (assist), CECP trails.

## Global Constraints

- Drive-G-1: no claim stronger than evidence (`enforced` / `partial` / `declared` / `skeleton` / `absent`).
- Constitutional protected paths: do not modify without explicit auth.
- Determinism: seed-locked; no wall-clock in hash/receipt.
- MIT-safe deps only; no GPL.
- Do not install or pretend AMD/NVIDIA Cursor MCP exists.
- Do not implement CUDA/HIP stubs that imply support.
- Parent PR #83 / branch `feat/engine3d-genblaze-cinematic-plugin`.
- Spec SoT: `docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`.

---

## File map (future implementation)

| File | Responsibility |
|------|----------------|
| `mrs/adapters/storyforge-boundary/printer/print_request.py` | Optional `backend` field default `cpu` |
| `mrs/adapters/storyforge-boundary/printer/pipeline.py` | Route execute by backend; deny ungated webgpu |
| `mrs/packages/renderer-core/scripts/render-scene.mjs` | CPU path (existing) |
| `mrs/packages/renderer-core/src/render/rt4d/gpu/*` | WebGPU accel (existing partial) |
| `mrs/packages/renderer-core/scripts/compare-backends.mjs` | Parity harness (exists untracked / partial) |
| `mrs/adapters/storyforge-boundary/test_printer_mode.py` | Profile + backend contract tests |
| Genblaze `app/*.py` | No beauty-SoT wiring; assist labels only |

---

## Task 1: Quality-per-sample measurement (CPU)

**Deliverable:** Documented + tested metric for one print fixture (variance or MSE vs spp ladder).

- [x] Write failing test that records beauty stats at spp 8/24/48/64 for a fixed seed fixture
- [x] Run test — confirm fail (metric helper missing)
- [x] Add minimal metric helper (e.g. mean variance or proxy from adaptive sampler logs)
- [x] Run test — pass
- [x] Add short ops note to `CONTRACT_DIGITAL_PRINT.md` (quality ladder, not free lunch)
- [x] Commit: `test(printer): add quality-per-sample ladder fixture`

**Verify:** named test green; no profile param changes unless justified.

---

## Task 2: Operator guidance — quality then speed

**Deliverable:** Docs + optional CLI help text pointing operators to `print_hq` → `print_cinematic` → `print_reference`.

- [x] Update `PRINTER_SERVICE_API.md` with quality-then-speed section citing profiles table
- [x] Link design spec + this plan
- [x] Commit: `docs(printer): quality-then-speed operator guidance`

**Verify:** no code path silently lowers spp.

---

## Task 3: Backend field contract (default cpu)

**Deliverable:** PrintRequest accepts `backend: "cpu"` only for now; other values denied with clear error (**declared** gate).

- [x] Failing test: `backend: "webgpu"` raises PrintError until parity flag exists
- [x] Implement normalize + deny in `print_request.py` / sovereignty or pipeline
- [x] Tests pass
- [x] Commit: `feat(printer): reject ungated gpu backends`

**Verify:** `print_hq` default path unchanged.

---

## Task 4: CPU↔GPU parity harness wiring

**Deliverable:** Extend `compare-backends` / imageMetrics / replayReceipt so a Node (or browser) job can compare CPU vs WebGPU for a tiny scene; mark **partial** if WebGPU unavailable (skip ≠ pass).

- [x] Failing test when WebGPU mock present: receipt verifies
- [x] Wire existing `cpu-gpu-comparison.test.js` patterns to a print-sized fixture
- [x] Document skip behavior when `navigator.gpu` missing
- [x] Commit: `test(rt4d): print-oriented cpu-gpu parity harness`

**Verify:** CI does not false-PASS live WebGPU on Node without GPU.

---

## Task 5: Optional WebGPU print path (only after Task 4 budgets exist)

**Deliverable:** Capability-gated execute path; status **partial** until budgets enforced in CI.

- [x] Implement behind env `MRS_PRINT_WEBGPU=1` AND parity receipt present
- [x] Evidence bundle records `backend: webgpu`
- [x] Named tests for deny-without-parity and allow-with-parity (mock)
- [x] Commit: `feat(printer): optional webgpu backend behind parity gate`

**Verify:** default install still CPU SoT.

---

## Task 6: NVIDIA / Genblaze assist labeling (no SoT)

**Deliverable:** Docs + optional response field clarifying NIM stills are not Digital Printer beauty SoT.

- [x] Doc touch in Genblaze README or printer CONTRACT cross-link
- [x] Confirm sovereignty tests still ban GenAI body keys
- [x] Commit: `docs(genblaze): clarify NIM assist vs printer SoT`

**Verify:** no code path copies FLUX PNG into printer `beauty.png` SoT.

---

## Task 7: Re-trail ESFR

**Deliverable:** Update `printer-gpu-quality-speed-2026-07` Inspector + ESFR after Tasks 1–5 evidence exists.

- [x] Fill fresh test commands + outputs in 05/06
- [x] Only then consider `PROMOTE_WITH_GAPS` for GPU path
- [x] Commit: `docs(cecp): printer-gpu trail evidence after implementation`

---

## Out of scope (do not implement in this plan)

- AMD ROCm/HIP backends
- NVIDIA Cursor MCP / AMD Cursor MCP installation (user machine)
- GPU denoise as enforced
- Digital Printer v3 surface families (separate trail)
- Constitutional file edits

---

## Approval gate

**APPROVED** 2026-07-28 — Tasks 1–7 executed.
`docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`.
