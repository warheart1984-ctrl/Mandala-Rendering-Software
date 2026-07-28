# GPU-Assisted Compute Integration Charter

> **Status:** **declared** (articles) / **partial** (router contract tests in
> `@mrs/sovereign-x-router`)  
> **Authority:** Governance documentation under `docs/governance/` — does **not**
> amend `constitution/CHARTER.md`, `engine/constitution/*`, or `AGENTS.md`
> without explicit authorization.  
> **Trail:** `docs/governance/cecp/trails/sovereign-x-gpu-assist-2026-07/`  
> **Package:** `mrs/packages/sovereign-x-router/`  
> **Date:** 2026-07-28

---

## Preamble

This charter defines how NVIDIA/AMD GPU skills may assist Sovereign X workflows
without becoming Digital Printer beauty or evidence SoT. CPU RT4D /
`CONTRACT_DIGITAL_PRINT` remains authoritative for print.

---

## Article A1 — Capability classes are assist-scoped

Canonical capability classes (user SoT §A):

| Class | Vendor | Role |
|-------|--------|------|
| `gpu.inference.nvidia.tao` | NVIDIA | Inference assist |
| `gpu.compute.nvidia.cuda` | NVIDIA | Compute / look-dev assist |
| `gpu.gen.nvidia.nim_flux` | NVIDIA | Image gen assist (alias of `ai.gen.nvidia.flux`) |
| `gpu.inference.amd.rocm` | AMD | Inference assist (host-capability driven) |
| `gpu.compute.amd.hip` | AMD | Compute assist (host-capability driven) |

Prior registry IDs (`ai.gen.nvidia.cosmos`, `ai.vision.nvidia.llama`,
`gpu.optimize.nvidia.dynamo`, `gpu.sim.nvidia.tilegym`, `gpu.compute.amd.rocm`,
…) remain valid. Alias: `gpu.gen.nvidia.nim_flux` ↔ `ai.gen.nvidia.flux`.

**Status:** **partial** — registered + resolvable in router tests.

---

## Article A2 — Router view and authority tags

Inputs: intent, modality (`image`|`text`|`video`), `determinismRequired`,
`vendorPreference`.

Outputs: capability binding (NVIDIA | AMD | CPU) + authority tag
(`authoritative` | `assist`).

**Invariant:** `assist` NEVER routes into `/printer/*` or evidence SoT.

**Status:** **partial** — `GpuDispatchContract` + `GpuAssistModule` enforce the
invariant in unit tests; no live vendor invoke.

---

## Article A3 — Determinism and vendor cascade

1. If `determinismRequired=true` → bind **CPU RT4D only** (GPU assist suppressed).
2. If `vendorPreference=auto` → try **NVIDIA → AMD → CPU**.
3. If preferred backend is missing → **sovereignty override** to next available
   (ultimately CPU). Never fail open into print SoT.

**Status:** **partial** — binding rules tested; backends are stubs/flags only.

---

## Article A4 — Provenance split

- Assist routes attach **`assistProvenance` only**.
- **`printProvenance`** is reserved for Digital Printer / CPU RT4D after
  explicit hand-off.
- GPU denoise, NIM Flux, TAO, ROCm/HIP outputs must not enter evidence bundles
  as beauty SoT.

**Status:** **declared** for end-to-end provenance wiring; **partial** for
router-level `printProvenance: false` guards.

---

## Article A5 — Look-dev vs print boundary

`SovereignLookDevEngine` (architectural plan) may use GPU assist in Steps 1–3
(`assistOnly`). Step 4 hands off to CPU RT4D / Digital Printer. No GPU path may
claim print authority until parity receipts exist under a separate governed
trail.

**Status:** **declared** / **skeleton** — pipeline planner stub only.

---

## Anti-overclaim

This charter does **not** claim:

- GPU Digital Printer enforcement
- CHEA / CCR / CDGF runtime gates (**declared** unless in-repo artifacts exist)
- In-repo AMD print backends
- “Production ready” GPU assist (Drive-G-2: reference implementation **partial**,
  commercial ops **declared**)

---

## Related

- `docs/superpowers/specs/2026-07-28-sovereign-lookdev-engine-plan.md`
- `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/`
- `mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md`
