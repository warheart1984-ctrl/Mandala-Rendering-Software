# Trail: sx-legacy-efficient-3layer-2026-07

| Field | Value |
|-------|-------|
| `trailId` | `sx-legacy-efficient-3layer-2026-07` |
| `feature` | 3-Layer Path (algo/mem/gov) + SX `gpu.compute.amd.legacy_efficient` |
| `requestedBy` | User (MRS crew orchestration) |
| `started` | 2026-07-29 |
| `overallStatus` | **partial** (Lemonade SDK live chat + OpenCL still + HIP SDK/hello + beauty stub compile; SD gen + HIP device runtime blocked) |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `lens` | Optimizer + Integrator (SC) + Anchor (Actor) |
| `hip-rocm` | HIP SDK 7.1 **partial**; hello + beauty stub compile **partial**; Tonga device runtime **blocked**; OpenCL still **partial** |

## Stages

| # | File | Role |
|---|------|------|
| 01 | `01-architect-adr.md` | Architect |
| 02 | `02-builder-scaffold-manifest.md` | Builder |
| 03 | `03-implementor-notes.md` | Implementor |
| 04 | `04-reviewer-conformance.md` | Reviewer |
| 05 | `05-inspector-acceptance.md` | Inspector |
| 06 | `06-engineer-standards.md` | ESFR |
| 07 | `07-advance-partial-lemonade-opencl.md` | Advance note (adapter + OpenCL) |
| 08 | `08-advance-lemonade-sdk-hip-vendor.md` | Advance note (SDK chat + HIP vendor pin) |
| 09 | `09-lemonade-sdk-live-chat-adapter.md` | Live SDK chat → partial |
| 10 | `10-cycle-rerun.md` | Cycle re-run: HIP hello compile → beauty.hip partial |
| 11 | `11-cycle-rerun.md` | Cycle re-run 2: fresh proofs + `hip_beauty_stub.hip` compile |

## Proof

- Doc: `docs/4d-engine/PHOTOREAL_ON_R9_380.md`
- Route proof: `docs/4d-engine/proofs/legacy-efficient/sx-route-proof.json`
- OpenCL still: `docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png`
- Lemonade SD report: `docs/4d-engine/proofs/legacy-efficient/lemonade-capability-report.json`
- Lemonade SDK report: `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-capability-report.json`
- Lemonade SDK live chat: `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-live-chat-proof.json`
- Upstream pins: `docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json`
- HIP SDK detect: `docs/4d-engine/proofs/legacy-efficient/hip-sdk-detection-report.json`
- HIP hello compile: `docs/4d-engine/proofs/legacy-efficient/hip-hello-compile-run-proof.json`
- HIP beauty stub: `docs/4d-engine/proofs/legacy-efficient/hip-beauty-stub-compile-run-proof.json`
- Cycle 11 summary: `docs/4d-engine/proofs/legacy-efficient/cycle-rerun-2-summary.json`
- Invoke: `npm run sx:legacy-efficient -- --intent <id> --still --provider opencl`
- SDK: `npm run sx:legacy-efficient -- --probe-lemonade-sdk`
- HIP: `node sovereign-x/cli/sx-hip-sdk-probe.mjs`
