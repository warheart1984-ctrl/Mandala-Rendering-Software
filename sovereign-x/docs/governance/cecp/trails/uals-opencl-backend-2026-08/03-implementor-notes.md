# 03 — Implementor notes

**Trail:** `uals-opencl-backend-2026-08`
**Status:** **enforced** for Axiom X sampler parity — G1–G8 pass on AMD Ellesmere;
GPU↔JS `cpu.rt4d.print` parity byte-exact for sampler **and** integrator
(2026-08-13). Engine replay wiring recorded as AXIOM-X-003.

## What landed

| Artifact | Status |
|----------|--------|
| `axiom-native/include/axiom/uals.h` | enforced (ABI v0, compiled clean) |
| `axiom-native/src/uals/backends/opencl/{icd,context,program,determinism,map,meta}.c` | enforced (G2–G5 pass) |
| `axiom-native/src/uals/kernel-registry/{registry.c,sx.kernels.json}` | enforced (G7 pass; integrator registered) |
| `axiom-native/src/uals/orchestrator/{uals_internal.h,dispatch.c}` | enforced (gate pipeline; integrator routed) |
| `axiom-native/include/CL/{cl.h,cl_platform.h,cl_version.h}` | Khronos OpenCL-Headers (Apache-2.0), pinned via raw.githubusercontent main |
| `axiom-native/build_vs.bat` | fixed stale `G:\` absolute paths → `%~dp0`-relative; builds `uals.dll` + `run_gates.exe` + both dumpers with MSVC BuildTools 2022 |
| `uals/tests/gate_{probe,dispatch,determinism,provenance,registry,parity,integrator}.c` + `run_gates.c` | G1–G8 harness |
| `uals/abi/uals.h` | copy of canonical header (manifest item) |
| `router/registry/gpuSkillsRegistry.json` | capability registry seed (integrator + wiring evidence recorded) |
| `mrs/packages/renderer-core/src/render/rt4d/print/AxiomXIntegrator.js` | JS BigInt mirror (`cpu.rt4d.print/integrator`) |
| `sovereign-x/docs/governance/cecp/specs/mrk-axiomx-integrator-spec-v0.md` | integrator spec (enforced) |

## Gate results (2026-08-13, AMD Ellesmere via OpenCL)

```
G1 header/sources /W4-clean build          PASS
G2 probe 1 device (Ellesmere 0x1002, 4GB, wg 256)  PASS
G3 dispatch path_trace 64x64 spp=4        PASS
G4 determinism byte-identical, seed+1 diverges     PASS
G5 missing intent_id denied               PASS
G6 bit-exact vs C reference               PASS
G7 unknown kernel id denied               PASS
G8 integrator bit-exact vs C reference    PASS
```

## Design deltas vs spec (recorded honestly)

1. **Stratified sample table (spec §5) → per-pixel mulberry32** (kernel
   `path_trace`). Same guarantee — output is a pure function of
   `(seed, x, y, spp)` with no atomics/reductions — with no host-side upload.
   G4/G6 prove it. The table upload path stays available for kernels that need
   it (e.g., Axiom X integration).
2. **G6 parity target**: C reference, not `cpu.rt4d.print` (the JS rt4d path).
   Bit-exact vs C reference PASS; parity vs JS `cpu.rt4d.print` is **not yet
   tested** — therefore GPU remains **assist-only**, print-SoT stays with
   `cpu.rt4d.print`. This is the gap that blocks G6 → print-authoritative.
3. `-cl-std=CL2.0` preferred, falls back to default if the driver rejects it.

## Axiom X plug-in point

Axiom X v0 = `sx.kernel.axiom.x.sample` (deterministic mulberry32 sampler,
kernel name `axiom_x_sample`) and `sx.kernel.axiom.x.integrator` (single-bounce
4D diffuse NEE, kernel name `axiom_x_integrator`, spec
`mrk-axiomx-integrator-spec-v0.md`). The registry contract is kernel-agnostic:
any math kernel registers as `sx.kernel.<domain>.<name>` with `deterministic` +
`provenance_required` fields and binds through the same
`registry → provenance → determinism → backend` pipeline in `dispatch.c`.

## Integrator parity (vs cpu.rt4d.print mirror, 2026-08-13)

- GPU dump: `uals/tests/parity/dump_integrator.c` → `dump_integrator.exe <seed> <spp> <w> <h> <out.bin>`
- JS mirror: `mrs/packages/renderer-core/src/render/rt4d/print/AxiomXIntegrator.js`
- Compare: `node uals/tests/parity/check_integrator.mjs <w> <h> <spp> <seed> <gpu.bin>`

| w x h | spp | seed | sha256 | result |
|-------|-----|------|--------|--------|
| 64x64 | 4 | 0x5EED | 2e1df1c5…b1ad5 | byte-exact |
| 128x128 | 8 | 0xABCD | 4ad07bf8…63a774 | byte-exact |
| 37x53 | 16 | 7 | 88830bc1…5a3993 | byte-exact |

Determinism: repeat run byte-identical; seed+1 diverges (`dc458a9f…`).

## Integrator divergences caught (4, all corrected)

1. `pdfArea = 0` — area constant `A = 2π²R³` was Q²-units; missing `>> 16`
   (kernel, C ref; JS caught via BigInt divide-by-zero).
2. `cosLight` ternary inverted — negative dotN (light facing surface) yielded 0
   instead of `-dotN`; all three substrates shared the bug, so G8 passed
   bug-for-bug until the JS mirror's BigInt throw exposed the accept path.
3. JS RNG stream not threaded — `s3Uniform` took BigInt by value; every draw
   re-used the same state (GPU/C thread via pointer).
4. JS seed mix missing 32-bit wrap — `gx * MIX_X` needs `& 0xFFFFFFFF` to match
   C `uint` multiplication (`Math.imul` in the sampler mirror).

Plus one design fix: `EMISSION_Q = 32.0` + linear tonemap
`byte = floor(radiance·255)` — the initial `L_e = 1.0` scene rendered
all-black (radiance < 1/255 at spp 4–16), which made parity trivially pass on
an all-zero image and hid the seed-divergence check.

## Node bindings (live bridge, 2026-08-13)

`axiom-native/node-bindings/` — `axiomx.node` addon exposing `probe()` and
`renderAxiomX(options)` to JS. Loads `uals.dll` dynamically from its own
directory (same pattern as the OpenCL ICD loader — no PATH games, no import
lib). Options carry the provenance fields: `{seed, spp, width, height,
intentId, worldId, timelineId, timeSeconds}`.

- Build: `build_addon.bat` (direct `cl.exe`; node-gyp's MSBuild generation is
  broken on this box — literal `{}` injected into the cl command line by
  MSBuild 17.14 — bypassed, not papered over). Needs
  `node_modules/nan`, node headers in the node-gyp Cache, and `uals.dll` from
  `build_vs.bat`.
- `test.js` (`npm test`): 7 assertions — probe, render, same-seed
  determinism, seed-divergence, **live in-process parity** vs
  `AxiomXSampler.js` (sha256 `849a3bdc…cbfd` matches the file-based dump —
  cross-validates both bridges), provenance denial, invalid-arg rejection.

## MRK promotion (2026-08-13)

Axiom X sampler promoted as **the first Mandala Rosetta Kernel** (`AXIOM-X-001`);
integrator promoted as `AXIOM-X-002`; engine replay wiring recorded as
`AXIOM-X-003` — all 5 promotion criteria met with evidence, ledger entries
published. Spec set: `sovereign-x/docs/governance/cecp/specs/` —
`mrk-spec-v0.md`, `m-cbmc-v0.md`, `mrk-parity-harness-v0.md`,
`mrk-axiomx-promotion-record.md`, `mrk-axiomx-integrator-spec-v0.md`,
`mrk-rosetta-ledger.md`.

Temporal replay stability confirmed at kernel level (5 replay loops,
byte-identical) and at engine level via `AxiomXReplayTarget` + live GPU
`replay-wiring.test.js` (5/5) — `timeSeconds` is provenance, not a sampling
input. Engine suite 292/292.

## Known gaps (blocked-with-evidence)

- Integrator v0 is a fixed-scene single-bounce kernel (plane + one S³ light).
  Arbitrary-scene float print (`PathTracer4D.js`) remains the
  `cpu.rt4d.print` SoT; generalization of the deterministic substrate is
  future work.
- Kernel program compiled per-context (no cross-context program cache) —
  each gate pays a build. Optimization deferred.
- Determinism soak (spec §9: 100 runs) reduced to G4's 2-run + seed-divergence
  check in this pass; a soak harness can run `run_gates.exe` in a loop.
- `uals/tests/run_gates.exe` rebuild required after header changes (no CI yet).