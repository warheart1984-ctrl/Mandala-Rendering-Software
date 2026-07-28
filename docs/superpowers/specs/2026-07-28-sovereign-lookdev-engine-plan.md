# SovereignLookDevEngine — architectural plan

> **Status:** **declared** / **skeleton**  
> **Date:** 2026-07-28  
> **Package stub:** `mrs/packages/sovereign-x-router/src/lookdev/SovereignLookDevEngine.js`  
> **Charter:** `docs/governance/GPU_ASSISTED_COMPUTE_INTEGRATION_CHARTER.md`  
> **Trail:** `docs/governance/cecp/trails/sovereign-x-gpu-assist-2026-07/`

## Intent

Define a multi-step look-dev pipeline where NVIDIA/AMD GPU skills assist
exploration, while the final print plate remains **CPU RT4D** Digital Printer SoT.

## Pipeline (Steps 1–4)

| Step | Name | Tag | Behavior |
|------|------|-----|----------|
| 1 | `ingest_intent` | `assistOnly` | Validate `GpuDispatchContract` (intent, modality, determinism, vendor) |
| 2 | `assist_lookdev` | `assistOnly` | `routeLookDev` → NVIDIA/AMD/CPU binding; `assistProvenance` |
| 3 | `assist_scenespec_or_embeddings` | `assistOnly` | `routeSceneSpecAssist` or `routeEmbeddings` |
| 4 | `hand_off_cpu_print` | authoritative print hand-off | **CPU RT4D only**; GPU assist ends; no `/printer/*` invoke from assist module |

## Invariants

1. Steps 1–3 never set `asPrintSoT` / evidence SoT markers.
2. Assist NEVER routes into `/printer/*`.
3. `determinismRequired=true` forces CPU binding from Step 2 onward for assist.
4. Step 4 returns a hand-off token (`printBackend: cpu.rt4d`); it does not run
   the printer inside this package.

## Out of scope (this trail)

- Live NIM / TAO / ROCm / HIP invoke
- GPU↔CPU print parity receipts
- Changing Digital Printer pipeline code

## Acceptance (declared)

- [x] Planner stub returns 4 steps with `assistOnly` on 1–3
- [x] Step 4 declares `cpu.rt4d` + `bannedAssistIntoPrinter`
- [ ] End-to-end Genblaze look-dev UI wiring (**declared** next)
- [ ] Optional host capability probes feeding `backendsAvailable` (**declared**)

## Related prior art

- `docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`
- `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/`
