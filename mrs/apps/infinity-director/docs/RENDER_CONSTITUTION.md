# Render Constitution (Director preview stills)

**Status: declared** — governance artifact for Infinity Director → Genblaze still lanes.  
Not a CKL runtime gate. Not Digital Printer law.

Accelerated CPU planning: [RENDER_ACCEL_CONTRACT.md](./RENDER_ACCEL_CONTRACT.md) (RenderAccelContract Draft v0.1 · **partial** hooks) · pipeline: [ACCELERATED_RENDERER.md](./ACCELERATED_RENDERER.md) (**partial**).  
Math program map: [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md) (**declared** five-part table + `math_strategies` metadata).

## Preamble

Preview rendering is a governed assist path. No Director dispatch should be mistaken for CPU RT4D Digital Printer SoT (`cpu.rt4d.print`).

## Article I — Authority

- **RenderIntent**: operator prompt + optional Jarvis memoryboard hints (read-only).
- **Speed profiles**: `fast` | `beauty` | `auto` | `atcm` (Director-side workload control).
- **Print authority**: remains outside this contract (RT4D print / printer services).
- **RenderAccelContract**: ATCM is the named accelerator; router authority stays on Director (**partial** — see accel contract table).

## Article II — Resource constraints (honest)

- Prefer Engine3D soft-raster for CPU demos.
- Fast: ≤256²; Beauty(CPU): ≤512²; Warmup: 128².
- Genblaze `quality=draft` for speed profiles (final is slower).
- Never send unsupported Engine3D `path_trace` for CPU demos.
- Genblaze/Engine3D stills are **full-frame** today (no per-tile shade execution).

## Article III — Quality modes

- **Fast**: minimal pixels, skip LLM when profile forced, AOVs optional off.
- **Beauty (CPU)**: larger soft-raster + AOVs; no claim of GPU photoreal or GI.
- **ATCM**: tile complexity plan → suggests fast/beauty; work-model speedup only (`estimate_not_measured`).
- Upscaling / ESRGAN / film grades: **declared** future post-process — not implemented here.

## Article IV — Evidence

Each `/api/direct` response includes `speed_profile` evidence (lane, dims, unsupported flags, `print_sot:false`).

When ATCM is explicitly requested, Director also attaches contract artifacts (`render_plan`, `complexity_evidence`, `replay_record` skeleton) per RenderAccelContract — **partial**, schema-validated structurally in tests.

## Article V — Safety

- No unbounded path-trace on CPU via Director.
- Lane health from Genblaze `/health` must be consulted before demos.
- Warmup recommended before stage demos.

## Article VI — Acceleration activation

- ATCM must not self-activate on `auto`, `fast`, or `beauty` alone.
- Activation requires `speed_profile=atcm` (or aliases) or `atcm=true`.
- **Enforced in code/tests:** **partial** (Director gate only; downstream lanes unaware).

## Article VII — Acceleration failure

- Missing intent or invalid frame for ATCM → **RenderViolation** (422), not silent fallback with fake ATCM evidence.
- **Enforced in code:** **partial** (Director prerequisites + empty plan check).

## Article VIII — Work-model claims

- Any “~2×” or “100% faster” wording maps to the ATCM work-unit model, not measured FPS.
- Status tag: **estimate_not_measured** until benchmarks exist.

## Article IX — GPU assist boundary

- Vendor GPU assist skills remain non-SoT; RenderAccelContract is CPU-first Director planning.
- GPU paths do not satisfy print SoT or replace RT4D constitutional gates.

## Article X — Promotion path

Promote articles **declared → partial → enforced** with schemas, tests, and optional CKL policies. Current Director implementation: **partial** for Articles IV, VI–VII; **declared** for IX–X.
