# MRS whole-repository gap inventory — 2026-07-29

Evidence-bound supplement to [`README.md`](./README.md). **Report only** — no remediation in this trail.

## Scan coverage

| Area | Paths touched | Method |
|------|---------------|--------|
| Constitutional engine | `engine/`, `js/`, `constitution/`, `cssv/` | status.md, governance tests, grep |
| renderer-core / RT4D | `mrs/packages/renderer-core/` | scorecard, NotImplemented grep, GPU tests |
| Apps | `mrs/apps/genblaze-media`, `infinity-director`, `chatgpt-mrs` | README, IDAC docs, pytest markers |
| Hosts | `unity/`, `unreal/` | skeleton tags, TODO grep |
| GPU / BYOK / SX | `sovereign-x/`, `mrs/packages/sovereign-x-router`, trails | status.md, router README |
| Docs | `docs/scorecards/`, root README | path staleness, Drive-G-1 tags |
| CI | `.github/workflows/` | job inventory vs `package.json` scripts |

---

## A. Constitutional engine

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| A-01 | C# `GovernedWorldLoader` / timeline Unity runtime unverified in CI | skeleton | `engine/world/GovernedWorldLoader.cs`; `unity/.../TimelineExecutor.cs` |
| A-02 | ISL C#/C++ subset behind JS parser | partial | `ISL_V2_GRAMMAR.md` table |
| A-03 | ProvenanceRecorder / ReplayService not full timeline E2E | partial | `engine/constitution/status.md` |
| A-04 | ConformanceChecker = profile runner; not all subsystems wired to live play | partial | 16/16 browser profile only |
| A-05 | CSSV ledger load in browser throws by design; operator docs split Node/browser | partial | `engine/cssv/ledger.js`, audit H3 |
| A-06 | Dual ISL SoT (JS vs native mirrors) documented; C++ Contracts symbol absent | informational | `engine-governance-audit-2026-07/INVENTORY_AUDIT.md` M3/M4 |
| A-07 | Untracked / in-progress governance files in working tree (if present) | partial | git status: `ConstitutionalKnowledgeLayer.js`, `ckl.test.js`, `GovernedWorldLoader.cs` — verify committed state before claiming enforcement |

**Enforced (not gaps):** CKL 7 policies, GovernanceKernel integration, 170 governance tests, 16/16 conformance (`engine-governance-audit-2026-07`).

---

## B. renderer-core / RT4D / math

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| B-01 | Live WebGPU adapter tests skip on CPU CI | partial | `gpu-live-webgpu.test.js`, `status.md` |
| B-02 | Dx12Rhi / Vulkan native RHI throws not implemented | declared | `Dx12Rhi.js` |
| B-03 | WaveWavefrontAdapter GPU dispatch | declared | `WaveWavefrontAdapter.js` |
| B-04 | Scene-spec timeline cubic/easing | declared | `scene-spec/timeline.js` |
| B-05 | Inspector GPU budget doc vs skeleton editor | declared | `docs/4drs/substrate/performance/inspector-gpu-budget.md` |
| B-06 | Judge wow AOV PNG encode | skeleton | `judge-wow-2026-07` scaffold |
| B-07 | `4d-renderer` README encoding mojibake in places | hygiene | `mrs/packages/renderer-core/README.md` |
| B-08 | Scorecard repo path `G:\New folder` stale | hygiene | `docs/scorecards/rt4d.md`, `mrs-v2.md` |
| B-09 | Multi-GPU RT4D dispatcher | declared | `MRS_V2_ARCHITECTURAL_ROADMAP.md` |
| B-10 | SX-PTIG full CKL enforcement | declared + unit heuristics | `SX-PTIG.md`, root README |

**SoT claims (honest):** CPU RT4D print for Digital Printer **enforced**; PI-* invariants **tested** per `STACK.md`; normalization tests cited in AGENTS.md R6.

---

## C. Apps

### Genblaze (`mrs/apps/genblaze-media`)

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| C-01 | `path_trace=true` on Engine3D still → HTTP 501 | not wired | `app/main.py` |
| C-02 | No per-tile / crop_region still API | blocked | `test_genblaze_tile_api_inventory.py` |
| C-03 | True 4D scene reconstruction from image | declared | `image_ingest.py` |
| C-04 | Engine3D sequence provider | not implemented | `engine3d_sequence_provider.py` |
| C-05 | CROS `/cros` UI link — docs only in app | declared | `static/index.html` |
| C-06 | Full pytest suite not in root `ci.yml` | partial CI | BYOK subset in `mandala-agent-ci.yml` |
| C-07 | Live NIM BYOK with user key | operator-verified | `genblaze-byok-session-2026-07` PROMOTE_WITH_GAPS |

### Infinity Director / IDAC / ATCM

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| C-10 | IDAC certification | **false** | `IDAC_CERTIFICATION_CHECKLIST.md` |
| C-11 | W-TILE-FAITHFUL | blocked-on-downstream-API | `IDAC_CONFORMANCE_WAIVERS.md`, ADR-002 |
| C-12 | W-CKL-CHARTER-MRS | open waiver | same |
| C-13 | C-01–C-07 checklist rows | partial | checklist table |
| C-14 | C-08b live Genblaze default CI | partial | `test_idac_live_conformance.py` skipif |
| C-15 | L2 multi-domain conformance | skip | `test_idac_conformance.py` @skip L803 |
| C-16 | Performance speedup bar | xfail | `test_idac_performance_harness.py` |
| C-17 | ATCM `estimate_not_measured` | partial | `app/atcm.py`, `CPU_FAST_PATH.md` |
| C-18 | Engine3D path_trace 501 documented | enforced honesty | `CPU_FAST_PATH.md`, `render_profiles.py` |

### chatgpt-mrs

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| C-20 | ChatGPT app deploy / production evidence thin vs monorepo pointer | partial | `mrs/apps/chatgpt-mrs/`, `mrs/README.md` |

---

## D. Hosts

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| D-01 | Unity GovernedWorld / ISL bootstrap | skeleton | `IslIntentBootstrap.cs`, demo README |
| D-02 | Unity FourDAdapter TODO cluster (import, slice, scene load) | skeleton | `FourDSceneLoader.cs`, editor windows |
| D-03 | Unreal FourDAdapter C++ stubs log NotImplemented | skeleton | `FourDSceneLoader.cpp`, `FourDBlueprintLibrary.cpp`, etc. |
| D-04 | Unreal Sequencer 4D track | skeleton | `UMovieScene4DTrack.cpp` |
| D-05 | Browser host | enforced (JS) | `BrowserRuntimeAdapter` + multihost tests |
| D-06 | Cinematic Unity/Unreal `.unity`/`.umap` demo assets | declared | `demo/scenes/4d_cinematic_demo.md` |

---

## E. GPU / vendor assist / BYOK

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| E-01 | Vendor GPU skills registered; runtimes not wired in router | partial | `sovereign-x-vendor-router-2026-07` |
| E-02 | GPU determinism Phase I docs only | declared | `gpu-determinism-phase1-2026-08`, `gpu-determinism-2026-09` |
| E-03 | Capability inspector UI | skeleton | `docs/sx-router/specs/capability-inspector-ui.md` |
| E-04 | Router dashboard parity placeholders | skeleton | `router-capability-dashboard.md` |
| E-05 | Invented dense GPU flags in proton CLI | declared/TODO | `judge-wow-2026-07`, `render-proton-splat.mjs` |
| E-06 | GPU Assist never print SoT | enforced | `gpu-constitution.test.js`, AGENTS policies |

---

## F. Docs vs evidence

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| F-01 | Scorecards dated 2026-07-24; path wrong | stale | all `docs/scorecards/*.md` |
| F-02 | Mandala 312 skills vs 173 JSON IDs | declared/partial | `MANDALA_SIX_AGENTS.md` |
| F-03 | FourDRenderer v2 press/deck — already softened | aligned | `PRESS_RELEASE.md` |
| F-04 | Engine3D cluster wire protocol | declared | `ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_RFC.md` |
| F-05 | Image-to-scene depth recovery Phase 1 | declared | `IMAGE_TO_SCENE_RFC.md` |

---

## G. CI / tests / scripts

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| G-CI-01 | Root `npm test` does not include governance (use `test:all`) | doc gap | `test-all.mjs` vs README |
| G-CI-02 | `test:gpu-live` skip-ok — no mandatory GPU hardware job | partial | `ci.yml` mandala-check |
| G-CI-03 | Infinity Director pytest absent from `ci.yml` | gap | workflows grep |
| G-CI-04 | Residual GPU BGL sampleType on non-combine passes | partial | `p0-ci-unblock-2026-07` |
| G-CI-05 | Unreal workflow compile ≠ functional | partial | `fourdadapter-unreal.yml` |
| G-CI-06 | Normalization test path in AGENTS R6 | verify locally | `normalization.test.js` under rt4d/test |

---

## H. CECP / ESFR open PROMOTE_WITH_GAPS (summary)

Trails still carrying **PROMOTE_WITH_GAPS** or **partial** overallStatus (not exhaustive):

- IDAC stack + director ATCM / CPU fast-beauty  
- Genblaze BYOK  
- GPU vendor integration + sovereign-x router + gpu-assist  
- Printer GPU quality/speed, proton raster/HQ, cinematic quality, PCC projection  
- Storyforge runtime boundary + MRS pipeline v1  
- Face creation assist, judge-wow, prompt-scene-docker  
- Top5 CI hygiene, vendor skills fixup  
- sx-router vNext 2026-08 (Phases 2–4 draft)  
- digital-printer-v3 (**BEGIN**, declared surfaces only)  
- gpu-determinism Phase I / 2026-09 draft  

**Promoted / closed for gap purposes:** digital-printer-v2, e2e-close-gaps, protected-promote, p0-ci-unblock (core gates), engine-governance-audit findings H2/H4/C2, gpu-multihost constitutional PROMOTE, storyforge-4d-full-run MRS side.

---

## I. Security / deploy (obvious)

| ID | Gap | Tag | Evidence |
|----|-----|-----|----------|
| I-01 | BYOK sessionStorage — hosted off by default | partial enforced | BYOK tests, `GENBLAZE_ALLOW_BYOK` |
| I-02 | `security-audit.mjs` in package.json | script exists | run via `npm run security-audit` |
| I-03 | Render ephemeral FS / secrets via env | documented | render-platform rules, `.env.example` |
| I-04 | No committed secrets scanned in this pass | — | AGENTS R8 norm |

---

## Severity key

- **P0:** Blocks certification or cross-app contract (tile API).  
- **P1:** Major capability or operator trust (hosts GPU live, path_trace 501, IDAC cert).  
- **P2:** Material roadmap item with clear evidence tag.  
- **P3:** Hygiene, optional UX, doc path fixes.

---

*Inspector lens: gaps listed here are **open** as of scan date unless listed in README §5 "Not gaps". Reviewer lens: no gap row upgrades **declared** → **enforced** without test/path citation.*
