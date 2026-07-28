# 01 — Architect ADR: Printer quality-then-speed + GPU path

**Trail:** `printer-gpu-quality-speed-2026-07`  
**Stage:** Architect (CECP 01) — design-only  
**Role lenses:** Sage-lite + Pipeline-Conductor + Boundary-Guardian + Anchor  
**Status:** **declared** design → **APPROVED** 2026-07-28 (user) → Implementor executing plan

---

## Intent

Design how Digital Printer v2.0 pursues **better quality then speed** without Monte Carlo free-lunch fiction, using:

1. Existing enforced quality profiles + adaptive sampling (CPU SoT)
2. Future same-math GPU acceleration (WebGPU first)
3. Honest separation from Genblaze NVIDIA NIM (assist ≠ SoT)
4. Honest AMD absence (no ROCm/HIP)

**Requested by:** user via crew + superpowers + AMD/NVIDIA plugin ask (plugins missing; in-repo NVIDIA used instead).

## ADR decision

**Context:** User wants quality without sacrificing determinism; MC has sample/time tradeoffs; v2 profiles already lock spp/depth/denoise.

**Decision:** Sequenced hybrid (Approach D in design spec):

1. Near-term: profile ladder + quality-per-sample measurement (CPU)
2. Medium-term: capability-gated WebGPU backend with CPU↔GPU parity receipts before print SoT
3. Reject NIM/FLUX as beauty SoT; allow Genblaze assist for authoring/vision only
4. CUDA/HIP remain **absent** placeholders until code exists

**Consequences:**

- Wall-clock at `print_reference` stays CPU-bound until parity GPU ships (**ops**, not non-determinism)
- No AMD MCP / NVIDIA MCP required for architecture
- v2 PROMOTE verdict unchanged; this trail is a follow-on design

## Interface specification

| Surface | Contract |
|---------|----------|
| PrintRequest | Existing profiles + `variance_threshold` / `adaptiveSampling` / `seed` |
| Future `backend` | `cpu` (default) \| `webgpu` \| `cuda` \| `hip` — **declared** |
| Parity | replay receipt + MSE/SSIM budgets before `webgpu` print ≥ hq |
| Genblaze NIM | Authoring/vision only; sovereignty bans SF GenAI bodies on print intake |
| Env | No new required env for design pass |

**Bans:** constitutional protected paths; claiming AMD/NVIDIA MCP; GPU denoise as enforced.

## Constitutional boundary analysis

| In | Out |
|----|-----|
| Design docs, CECP trail, plan | Implementation of GPU backends (this pass) |
| Printer profile guidance | Replacing RT4D with NIM beauty |
| RT4D GPU parity design | Charter / default.policies.json edits |

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md` | create | Architect |
| `docs/superpowers/plans/2026-07-28-digital-printer-gpu-quality-speed.md` | create | Architect→writing-plans |
| `docs/governance/cecp/trails/printer-gpu-quality-speed-2026-07/*` | create | crew |
| `printer/*.py` GPU backend | **defer** | Implementor (later) |
| `GpuPathTracer4D.js` print wiring | **defer** | Implementor (later) |

## Acceptance criteria

- [x] Design names 2–3 approaches + recommendation without free-lunch claims
- [x] NVIDIA in-repo vs printer sovereignty compatibility stated
- [x] AMD absence reported honestly
- [ ] Implementation tasks only after user approves design (gate)

## Risks / unknowns

- WebGPU Node availability; float parity budgets TBD
- Whether operators prefer WebGPU vs future CUDA once NVIDIA MCP exists (tooling ≠ runtime)

## Handoff order

Builder (doc scaffolding) → Implementor (notes: no code) → Reviewer → Inspector → ESFR (HOLD on GPU ship)
