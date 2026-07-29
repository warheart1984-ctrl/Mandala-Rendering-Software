# CECP trail — MRS whole-repository gap scan (2026-07)

| Field | Value |
|-------|-------|
| `trailId` | `mrs-whole-gap-scan-2026-07` |
| `feature` | Evidence-bound inventory of open gaps across MRS |
| `requestedBy` | Operator |
| `started` | 2026-07-29 |
| `method` | Repo inventory + grep (TODO/FIXME/waiver/xfail/skip/declared) + scorecards + trail READMEs; **no code fixes** |
| `lenses` | mrs-crew foreman · mandala-mode · Inspector (acceptance) · Reviewer (conformance) · GPU assist honesty |
| `overallStatus` | **report-only** |

## Stage files

| Stage | File | Status |
|-------|------|--------|
| Gap inventory | [`GAPS.md`](./GAPS.md) | **enforced** (this scan) |
| README | this file | **enforced** |

---

## 1. Executive summary

- **JS constitutional governance is the strongest enforced layer:** `engine/governance/test/*.test.js` → **170/170 pass** (2026-07-29); `npm run test:conformance` → **16/16 COMPLIANT** (`scripts/test-conformance.mjs`).
- **Multihost product maturity lags JS SoT:** Unity/Unreal/C# world loaders and FourDAdapter remain **skeleton**; Play Mode / PIE not in default CI (`engine/constitution/status.md`, `unity/`, `unreal/FourDAdapter/`).
- **RT4D reference implementation is CPU-partial, GPU-early:** Scorecard `docs/scorecards/rt4d.md` aligns with code — wavefront, Dx12/Vulkan RHI, multi-GPU, live WebGPU print execute are **declared** / **partial** / throw `not implemented`.
- **Digital Printer CPU SoT is enforced; GPU/NIM paths are assist-only:** `cpu.rt4d.print` + constitutional GPU tests; trails `printer-gpu-quality-speed-2026-07`, `proton-raster-2026-07` remain **PROMOTE_WITH_GAPS**.
- **IDAC reference runtime is explicitly not certified:** `IDAC_CERTIFICATION_CHECKLIST.md` → **certified: false**; **W-TILE-FAITHFUL** blocked on Genblaze tile/crop API; **W-CKL-CHARTER-MRS** open at platform scope.
- **Genblaze is partial operator MVP, not 4D:** Engine3D still path exists; `path_trace=true` returns **501** (`mrs/apps/genblaze-media/app/main.py`); full Genblaze pytest suite not in root `ci.yml` (subset BYOK in `mandala-agent-ci.yml`).
- **Infinity Director / ATCM speedup is labeled estimate, not measured:** `app/atcm.py`, `docs/CPU_FAST_PATH.md` — **estimate_not_measured**; performance xfail documents **W-TILE-FAITHFUL**.
- **Sovereign X vendor router / GPU determinism are thin registration + docs:** `sovereign-x-vendor-router-2026-07`, `gpu-determinism-phase1-2026-08`, `sx-router-vNext-2026-08` Phases 2–4 **declared**; capability inspector UI **skeleton** only.
- **Docs hygiene debt:** Scorecards and `START_HERE_MRS_30_MIN.md` still cite stale path `G:\New folder` vs actual workspace `Mandala Rendering Software`.
- **Open PROMOTE_WITH_GAPS trails** remain the authoritative backlog for promoted-but-incomplete work (see §5 and [`GAPS.md`](./GAPS.md)).

---

## 2. Gap table (representative; full list in GAPS.md)

| ID | Area | Sev | Status | Evidence | Blocker / next action |
|----|------|-----|--------|----------|------------------------|
| G-001 | Hosts — Unity/Unreal | P1 | skeleton | `unity/GovernedUnityProject/`, `unreal/FourDAdapter/`, `engine/world/GovernedWorldLoader.cs` | Play Mode verification; implement FourD scene load stubs |
| G-002 | ISL — C#/C++ parity | P2 | partial | `engine/scripting/ISL_V2_GRAMMAR.md` | Extend mirrors for `with params` / nested args |
| G-003 | Runtime — provenance/replay | P2 | partial | `engine/constitution/status.md` | Broaden beyond unit tests; timeline play E2E |
| G-004 | RT4D — GPU live | P1 | partial | `test/gpu/gpu-live-webgpu.test.js` skip on CI | Optional GPU runner job; WebGPU print execute |
| G-005 | RT4D — RHI backends | P2 | declared | `mrs/packages/renderer-core/src/render/rhi/Dx12Rhi.js` | Phase C+ implementation or downgrade docs |
| G-006 | RT4D — wavefront | P2 | partial/skeleton | `WaveWavefrontAdapter.js`, v2 contract docs | Kernel dispatch + tests |
| G-007 | Digital Printer v3 | P2 | declared | `digital-printer-v3-2026-07/README.md` | Implementor pass + tests |
| G-008 | Genblaze path_trace | P1 | not wired | `main.py` L1596–1601 → 501 | Wire CLI or remove API surface |
| G-009 | Genblaze tile/ROI | P0 | blocked | `test_genblaze_tile_api_inventory.py`, ADR-002 | `crop_region` or `/api/engine3d-tile-still` |
| G-010 | IDAC certification | P1 | false | `IDAC_CERTIFICATION_CHECKLIST.md` | Close C-01–C-08b partial rows + tile API |
| G-011 | IDAC L2 conformance | P2 | skip | `test_idac_conformance.py` L803 skip | Multi-domain orchestration |
| G-012 | W-CKL-CHARTER-MRS | P2 | waiver | `IDAC_CONFORMANCE_WAIVERS.md` | MRS CKL loads IDAC charter (platform trail) |
| G-013 | ATCM perf claims | P2 | partial | `test_idac_performance_harness.py` xfail | Measured wall-clock harness; clear W-WORK-UNIT |
| G-014 | Engine3D cluster wire | P2 | declared | `ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_RFC.md` | Implementation |
| G-015 | CROS adapters | P2 | skeleton | `mrs/packages/cros/src/cros/adapters/seedance.py` | Seedance/DCC offline planners |
| G-016 | Storyforge pipeline | P2 | partial | `storyforge-mrs-pipeline-v1-2026-07` | SF producer E2E **declared** SF-owned |
| G-017 | ChatGPT MRS app | P3 | partial | `mrs/apps/chatgpt-mrs/` | Deploy/ops evidence vs README |
| G-018 | SX Router Phases 3–4 | P2 | declared | `sx-router-vNext-2026-08/README.md` | Implementor phases |
| G-019 | GPU determinism live | P2 | declared | `gpu-determinism-2026-09/README.md` | Live RHI parity harness |
| G-020 | Judge wow / AOV encode | P3 | skeleton | `judge-wow-2026-07` manifest | `aovEncode.js` implementation |
| G-021 | Examples — bloom/audio | P3 | declared | `examples/tutorials/README.md` | Wire PostProcessor / AudioAnalyzer to demo |
| G-022 | Scorecard paths | P3 | stale | `docs/scorecards/*.md` | Update repository path to current clone |
| G-023 | CI — Director pytest | P2 | gap | `.github/workflows/ci.yml` | Add optional `infinity-director` job |
| G-024 | CI — full Genblaze pytest | P2 | partial | `mandala-agent-ci.yml` BYOK subset only | Expand or document intentional scope |
| G-025 | CSSV browser ledger | P2 | partial | `engine/cssv/ledger.js` lazy Node | Document browser vs Node ledger paths |
| G-026 | Mandala agent skills | P3 | declared | `MANDALA_SIX_AGENTS.md` 173 vs 312 | Treat SPEC as aspirational inventory |
| G-027 | FourDRenderer v2 marketing | P3 | aligned | `PRESS_RELEASE.md`, v2 comms | Keep **declared** labels (already softened) |
| G-028 | Unreal CI | P3 | partial | `fourdadapter-unreal.yml` | Compile gate ≠ functional adapter |
| G-029 | Engine3D 501 path_trace docs | P3 | enforced honesty | Director `render_profiles.py` | API/docs consistency only |
| G-030 | Proton HQ visual density | P2 | partial | `proton-hq-2026-07` PROMOTE_WITH_GAPS | Bloom/density follow-on |

Severity: **P0** blocks IDAC tile certification / downstream contract; **P1** platform or operator-critical; **P2** material product gap; **P3** hygiene / roadmap.

---

## 3. Maturity dimensions — MRS overall (2026-07-29)

| Dimension | Rating | Audience | Evidence (anchor) |
|-----------|--------|----------|-------------------|
| 1. Constitutional model | **Partial → enforced (JS runtime)** | Architects | CKL + 16/16 conformance; charter.js P1–P3 **enforced**; P4 **partial**, P5 **declared** (`AGENTS.md`, `protected-promote-2026-07`) |
| 2. Governance methodology | **Partial** | Operators | CECP trails + ESFR; crew modes **partial** docs; agent lint **partial** heuristics |
| 3. Reference implementation | **Partial (CPU RT4D / browser)** · **Early (GPU/v2 factory)** | Developers | `docs/scorecards/rt4d.md`, `mrs/packages/renderer-core`, engine3d-core CI job |
| 4. Platform engineering | **Skeleton (hosts)** · **Partial (CI/deploy)** | Operators | Unity/Unreal **skeleton**; Genblaze Dockerfile/render.yaml **partial**; no default GPU CI |
| 5. Commercial operations | **Roadmap** | Business | `docs/scorecards/genblaze-media.md`, `mrs-v2.md` — self-serve **not claimed** |

> Framing: **the engine (JS governance + CPU paths) exists; the factory (GPU scale, hosts, IDAC certification, commercial) remains early.**

---

## 4. Top 10 recommended next actions (leverage-ranked)

1. **Genblaze tile/crop API (G-009)** — unblocks **W-TILE-FAITHFUL** and IDAC performance evidence.
2. **Wire or narrow Engine3D `path_trace` API (G-008)** — removes 501 foot-gun; aligns with RT4D consume tests.
3. **Default CI job for Infinity Director pytest (G-023)** — locks IDAC route gate + charter gate regressions.
4. **Live WebGPU print execute follow-on (G-004)** — closes `printer-gpu-quality-speed-2026-07` residual.
5. **Unity FourD scene loader TODO cluster (G-001)** — first host path from skeleton → partial with smoke test.
6. **IDAC C-08b operational matrix in CI optional job** — document + nightly with `IDAC_LIVE_AUTO=1`.
7. **Refresh scorecards + START_HERE paths (G-022)** — Drive-G-1 doc/evidence alignment.
8. **Storyforge boundary E2E scope decision (G-016)** — MRS vs SF ownership explicit in one ADR.
9. **SX Router Phase 2 capability registry (G-018)** — moves vendor assist from registration to tested dispatch.
10. **Runtime provenance play/stop integration test (G-003)** — raises conformance from checker-only to timeline E2E.

---

## 5. Not gaps / already closed (do not re-litigate)

| Item | Verdict | Evidence |
|------|---------|----------|
| C1 charter version drift (`1.1.0`) | **Rejected** | `engine-governance-audit-2026-07/INVENTORY_AUDIT.md` — SoT `1.0.0` |
| CKL / GovernanceKernel **enforced** (JS) | **Closed** | 170 governance tests; 16/16 conformance |
| H2 policiesBaseUrl, H4 evalModifier | **Fixed** | Same audit trail |
| Protected-path claim alignment | **Closed** | `protected-promote-2026-07` **enforced** |
| P0 CI unblock (four gates) | **Closed** | `p0-ci-unblock-2026-07` — residual BGL sampleType **partial** only |
| E2E closable gaps (MRS-side) | **Closed** | `e2e-close-gaps-2026-07` **enforced** |
| Digital Printer v2 CPU SoT | **Promoted** | `digital-printer-v2-2026-07` → **PROMOTE** (distinct from v3/vGPU gaps) |
| GPU constitutional gates (mock) | **Promoted** | `gpu-multihost-enforced-2026-07` — not hardware maturity |
| IDAC W-CKL-CHARTER **local** | **Cleared Cycle 7** | `charter_gate.py`, C-13 **enforced** |
| Fake tile-faithful / 2× marketing | **Prevented** | C-11 **enforced**; waivers + inventory tests |
| Storyforge 4D full run (MRS side) | **Closed** | `storyforge-4d-full-run-2026-07` **enforced** (SF upstream **declared**) |
| Engine3d expand path | **Closed** | `engine3d-expand-2026-07` **enforced** (unexpanded stub **partial**) |

---

## 6. Verification commands (spot-check)

```bash
npm run test:governance      # 170 pass (2026-07-29)
npm run test:conformance     # 16/16
npm run test:gpu             # mock + constitution
npm run test:multihost       # HostConstitutionalRouter
cd mrs/apps/infinity-director && python -m pytest -q   # 66 pass, 3 skip, 2 xfail (Cycle 7 default)
```

---

## 7. Related trails (open PROMOTE_WITH_GAPS)

`idac-stack-2026-07`, `director-atcm-2026-07`, `director-cpu-fast-beauty-2026-07`, `genblaze-byok-session-2026-07`, `gpu-determinism-phase1-2026-08`, `vendor-gpu-integration-2026-07`, `sovereign-x-vendor-router-2026-07`, `printer-gpu-quality-speed-2026-07`, `proton-raster-2026-07`, `proton-hq-2026-07`, `cinematic-render-quality-2026-07`, `pcc-projection-2026-07`, `top5-ci-hygiene-2026-07`, `face-creation-assist-2026-07`, `storyforge-runtime-boundary-2026-07`, `storyforge-mrs-pipeline-v1-2026-07`, `judge-wow-2026-07`, `prompt-scene-docker-2026-07`, `vendor-skills-fixup-2026-07`, `sx-router-vNext-2026-08` (Phase 1 done).

---

*Drive-G-1: status tags in this trail reflect grep, scorecards, tests run locally, and cited paths — not aspirational README prose.*
