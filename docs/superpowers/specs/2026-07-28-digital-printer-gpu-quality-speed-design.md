# Digital Printer — Quality-then-Speed + GPU Path Design

**Date:** 2026-07-28  
**Branch / PR:** `feat/engine3d-genblaze-cinematic-plugin` / [PR #83](https://github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-/pull/83)  
**Parent stack:** Digital Printer v2.0 (`digital-printer-v2-2026-07`) — ESFR **PROMOTE** / user-language **PROMOTE_WITHOUT_GAPS**  
**Trail:** `docs/governance/cecp/trails/printer-gpu-quality-speed-2026-07/`  
**Status of this document:** **declared** design (Drive-G-1) — not an implementation claim  
**Skills used:** superpowers/brainstorming → dispatching-parallel-agents → mrs-crew → writing-plans → verification-before-completion  

---

## 1. Intent

User wants **better quality then speed without a false free lunch**: Monte Carlo path tracing has tradeoffs; prior analysis recommended **profiles + quality-per-sample + a future GPU path**. This design answers how to pursue that using:

- In-repo **NVIDIA** surfaces (Genblaze NIM / NVENC) honestly
- Any **AMD/ROCm/HIP** surface (report: **absent** in main tree)
- Existing **RT4D WebGPU / GpuPathTracer4D** without overclaiming Node print parity

**Clarifying assumption (brainstorming gate):** “Quality then speed” means maximize plate quality under deterministic print SoT first; reduce wall-clock second **without replacing** the governed print path with stochastic GenAI. If the user instead wants GenAI beauty plates as SoT, that is a **different** product and is rejected here.

---

## 2. Tool reality (usable vs missing)

| Surface | Usable now? | Notes |
|---------|-------------|--------|
| Superpowers skills | **yes** | brainstorming, parallel agents, writing-plans, verification |
| MRS crew skills | **yes** | Architect→ESFR trail for this initiative |
| AMD Cursor plugin / MCP | **no** | Not installed / not in dynamic namespaces — do not pretend |
| NVIDIA Cursor plugin / MCP | **no** | Not installed / not in dynamic namespaces — do not pretend |
| Render MCP (`plugin-render-render`) | **needsAuth** | Only if deploy is in scope; secondary |
| In-repo NVIDIA (Genblaze NIM FLUX/vision, `nvidia_http.py`, `nvidia_errors.py`, `rt4d_to_nvidia`) | **yes** | Generative / vision assist — not print SoT |
| In-repo NVIDIA encode (`NVENCEncoder.js`) | **partial** | ffmpeg nvenc probe — encode path, not path-trace SoT |
| In-repo RT4D GPU / WebGPU | **partial** | Browser/mock-tested; Node print path remains CPU |
| AMD / ROCm / HIP in monorepo | **absent** | No GPU vendor path; OpenCL/Vulkan mentions are vendor-neutral router **declared** claims |

---

## 3. Current evidence (v2.0 printer)

### 3.1 CPU print SoT — **enforced**

- Pipeline: sovereignty → mesh sync → execute → denoise → evidence  
  (`mrs/adapters/storyforge-boundary/printer/pipeline.py`)
- Four quality profiles lock deterministic params (`print_request.py` `QUALITY_PROFILES`):

| Profile | dims | spp | depth | denoise | softPenumbra | penumbraLightSamples |
|---------|------|-----|-------|---------|--------------|----------------------|
| `print_fast` | 256² | 8 | 4 | false | false | 1 |
| `print_hq` | 512² | 24 | 6 | true | true | 4 |
| `print_cinematic` | 768² | 48 | 8 | true | true | 4 |
| `print_reference` | 768² | 64 | 10 | true | true | 8 |

- Adaptive sampling + `variance_threshold` already exist on PrintRequest (**enforced** knobs; wall-clock is ops).
- Denoise = CPU bilateral, quality-profile gated (**enforced** on scene-spec / post-plate for proton/engine3d).
- Sovereignty bans smuggled SF GenAI bodies (`promptSpec`, `modelBackend`, …) — **enforced**.

### 3.2 NVIDIA Genblaze — **assist / host**, not print SoT

- NIM FLUX stills + NIM vision → SceneSpecification are Genblaze authoring paths (`mrs/apps/genblaze-media`).
- Boundary: Genblaze must not carry `storyforge` strings; printer rejects banned SF keys.
- **Determinism risk:** NIM outputs are stochastic / vendor-queue dependent. Using them as beauty SoT would break replay receipts and constitutional provenance expectations.

### 3.3 RT4D GPU — **partial**

- `GpuPathTracer4D.js` + wavefront WebGPU kernels exist; Node lacks `navigator.gpu` by default.
- `cpu-gpu-comparison.test.js` exercises image metrics + replay receipt helpers — **not** full live WebGPU print parity.
- Engine3D / renderer-web: WebGPU **skeleton** / detected-but-not-active.

### 3.4 AMD

- No ROCm/HIP/AMD-GPU integration found in the main tree (false positives like “amd64” ignored).  
- Multi-vendor GPU in SovereignX router docs remains **declared**.

---

## 4. Approaches (2–3 + recommendation)

### Approach A — Profile + quality-per-sample (CPU SoT only)

**Idea:** Treat `print_cinematic` / `print_reference` as the quality ladder; tune adaptive sampling / variance / firefly / denoise so each sample buys more visual quality; accept wall-clock as ops.

| Pros | Cons |
|------|------|
| Already **enforced**; no sovereignty break | Does not reduce wall-clock at fixed quality |
| Deterministic, receipt-friendly | User may still feel “slow” at reference |

**Tag:** near-term **partial→enforced** (knob docs + optional metric “quality-per-sample” reporting)  
**Fake free lunch?** No — explicit tradeoff.

### Approach B — Same-math GPU acceleration (WebGPU / future CUDA)

**Idea:** Accelerate the **same** RT4D path-trace math so reference spp finishes faster; gate promotion on CPU↔GPU parity receipts (MSE/SSIM/replay).

| Pros | Cons |
|------|------|
| Real speed at same quality (honest win) | WebGPU Node path **partial**; CUDA/HIP **absent** |
| Aligns with constitutional determinism if seeds/math match | Parity work is large; float differences need budgets |

**Tag:** medium-term **declared** → **partial** after parity fixtures  
**Fake free lunch?** No — engineering cost for wall-clock.

### Approach C — NVIDIA NIM as beauty / denoise SoT

**Idea:** Replace or “enhance” print plates with FLUX or NIM vision.

| Pros | Cons |
|------|------|
| Feels fast / pretty | Breaks determinism, sovereignty bans, provenance SoT |
| Already wired in Genblaze | Incompatible with Digital Printer promotion bar |

**Tag:** **rejected** as print SoT; optional **declared** offline look-dev assist only  
**Fake free lunch?** Yes — quality without governed samples.

### Recommendation (Approach D — sequenced hybrid)

1. **Now (A):** Document and measure quality-per-sample; default operator guidance = `print_hq` → `print_cinematic` → `print_reference`; do not lower spp to “feel fast.”
2. **Next (B):** Design GPU backend behind a capability flag; CPU remains SoT until parity receipts pass.
3. **Never as SoT (C):** NIM only for authoring / vision→scene assist; printer beauty remains RT4D/engine3d/proton plates.

---

## 5. Target architecture (GPU-assisted print path)

```text
PrintRequest (quality profile + seed + variance knobs)
        │
        ▼
sovereignty + mesh sync  ─────────────────── unchanged (enforced)
        │
        ▼
Backend selector (NEW — declared)
  ├─ cpu-rt4d / scene-spec   ← SoT until parity (enforced today)
  ├─ gpu-webgpu              ← same math, capability-gated (declared)
  └─ gpu-cuda / gpu-hip      ← vendor paths (absent; declared placeholders only)
        │
        ▼
Sampling → Reconstruction → Tonemap → Color → Encode → Hash
        │
        ▼
Evidence bundle + denoise provenance + replay receipt
        │
        ▼
Optional Genblaze NIM ── look-dev / vision assist ONLY (not beauty SoT)
```

### Contracts (declared)

| Item | Spec |
|------|------|
| `payload.render.backend` | `cpu` \| `webgpu` \| `cuda` \| `hip` — default `cpu` |
| Parity gate | `compare-backends` / replay receipt must PASS within budget before `webgpu` allowed for print profiles ≥ `print_hq` |
| Provenance | `intentId`, `worldId`, `seed`, `quality`, `backend`, `spp`, `denoiseFilterHash` required |
| Ban | NIM/FLUX bytes must not populate `beauty.png` SoT without a separate non-print route label |

### Constitutional boundary

- **In:** printer adapter knobs, RT4D GPU parity, docs/trails, Genblaze assist labeling  
- **Out:** rewriting charter/policies; claiming AMD/NVIDIA MCP; GPU denoise as **enforced**; commercial RIP  
- **Protected:** `constitution/`, `engine/constitution/`, `AGENTS.md`, default policies — untouched

---

## 6. Success criteria (testable later)

- [ ] Operator can choose quality profile without silent spp downgrade  
- [ ] Documented quality-per-sample metric (e.g. variance reduction vs spp) for one fixture — **declared** until test lands  
- [ ] GPU backend flag defaults to CPU; enabling WebGPU without parity → deny or warn (**declared**)  
- [ ] NIM path cannot satisfy Digital Printer evidence beauty SoT without failing sovereignty/tests  
- [ ] No AMD claims until ROCm/HIP code exists  

---

## 7. Risks / unknowns

| Risk | Mitigation |
|------|------------|
| User expects zero-tradeoff quality+speed | Explicit Approach A/B messaging; reject C |
| WebGPU float drift | Budgeted MSE/SSIM + seed-locked fixtures |
| NVIDIA MCP install later | Does not change architecture; optional tooling only |
| AMD hardware operators | Vendor-neutral WebGPU first; HIP only if demand + MIT-safe |

---

## 8. Spec self-review

- Placeholders: none intentional; vendor CUDA/HIP marked **absent**  
- Consistency: NIM = assist; GPU = accelerate same math; CPU = SoT  
- Scope: single initiative (quality-speed + GPU path design) — not v3 surface families  
- Ambiguity: “quality then speed” fixed in §1 assumption  

---

## 9. User review gate

Please review this file and the CECP trail. Next step after approval: implement via  
`docs/superpowers/plans/2026-07-28-digital-printer-gpu-quality-speed.md`  
(**no GPU backend implementation in this pass**).

---

## 10. Domain review synthesis

Parallel explore agents were dispatched for Domains A–D (printer CPU, Genblaze NVIDIA, RT4D GPU, AMD absence). Findings above are grounded in direct file evidence; agent returns (if any) are advisory and must not outrun this evidence.
