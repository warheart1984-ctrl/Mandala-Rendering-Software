# RT4D tuning notes — AMD FX-8350 (Bulldozer / Piledriver)

**Artifact:** `docs/sx-router/specs/rt4d-amd-fx8350-tuning.md`  
**Status:** **declared** — operator guidance only.  
**Drive-G-1:** Not enforced in PathTracer4D / Digital Printer. Do **not** treat this file as a change to print SoT behavior.

## Hardware snapshot (declared)

| Item | Value |
|------|-------|
| CPU | AMD FX-8350 |
| Modules / cores / threads | 4 modules · 8 cores · 8 threads |
| Shared FPU per module | Yes (pair contention under heavy FP) |
| Typical role | Local CPU RT4D / look-dev host — not GPU print SoT |

## Thread model (declared)

Recommended starting point for **CPU** PathTracer4D on FX-8350:

| Knob | Suggested | Rationale |
|------|-----------|-----------|
| `workerThreads` | `6`–`7` | Leave 1–2 threads for OS / Node event loop |
| Max workers | `8` | Hardware thread count; oversubscription usually hurts |
| Affinity | OS default | Pinning optional; not required for correctness |

Avoid claiming “8 workers always fastest” — module shared-FPU contention can make 6–7 better for path tracing.

## Integrator / sample params (declared)

| Param | Interactive assist | Print-quality guidance |
|-------|--------------------|------------------------|
| `spp` | 8–32 | Follow Digital Printer profiles (`print_hq` → …) |
| `maxDepth` | 4–6 | Printer profile SoT |
| `tileSize` | 16 or 32 | L2-friendly tiles on Bulldozer-class caches |
| Seed | mulberry32 / RT4D print seed | Print seed SoT remains CPU RT4D |

These numbers are **tuning hints**, not constitutional overrides.

## Cache / memory layout (declared)

- Prefer smaller tiles (`16`/`32`) to reduce thrash on per-module caches.
- Keep scene BVH + texture working set stable across tiles (no mid-frame realloc).
- Do not invent GPU VRAM layouts here — FX-8350 path is **CPU** RT4D.

## Determinism constraints (declared)

| Rule | Status |
|------|--------|
| Identical seed + params → identical print plate on same host | Print SoT (CPU RT4D) |
| GPU assist outputs | **assistOnly** — never print evidence |
| This tuning doc changing spp/depth defaults in code | **Forbidden** without tests + CECP trail |

Seed contract reference: `docs/governance/cecp/trails/gpu-determinism-2026-09/seed-contract.md` (**declared** for assist harness).

## What this does **not** authorize

- GPU print SoT
- Silent spp downgrade on Digital Printer profiles
- Claiming FX-8350 multi-host parity with NVIDIA/AMD GPU plates
- Changing `cpu.rt4d.print` behavior without Inspector/ESFR evidence

## Related

- Digital Printer profiles: `docs/governance/cecp/PRINTER_SERVICE_API.md`
- GPU assist charter: `docs/sx-router/specs/gpu-integration-charter.md`
- Parity harness: `sovereign-x/tests/gpuParitySuite.test.js` (SSIM cases skipped)
