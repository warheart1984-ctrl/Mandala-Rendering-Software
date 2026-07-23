# Constitutional Engine Charter — 4DCE / 4DRS v1.0

> **Drive-G-1:** No claim may exceed implementation evidence. Status tags: **enforced** | **partial** | **declared** | **skeleton**.  
> **Published system:** 4D Rendering System v1.0 · **Engine:** RT4D · **Validation:** Hyper-Caustic Lens — see `docs/4drs/`.

## I. Purpose

1. Governed computational environment bound by constitutional law. **partial** (browser session + exports)
2. Every governed action: intent → evidence → authority → execution → validation. **enforced** for listed browser actions
3. Deterministic, replayable, lineage-preserving computation across all worlds/substrates. **declared** (single browser world; param TRT only)

## II. Core invariants

| Invariant | Status | Evidence |
| --- | --- | --- |
| No execution without intent | **enforced** | CSE + CKL `policy-no-execution-without-intent` |
| No state change without evidence | **enforced** | CSE `validateEvidence` + CKL mutation policy |
| No authority without contract | **enforced** | `js/constitution/contracts.js` + CKL actor check |
| No render without provenance | **partial** | exports + CSR; frame ProvenanceRecorder during timeline play |
| play_timeline requires world | **enforced** | CKL `policy-play-timeline-requires-world` (JS) |
| Ascension dual evidence | **enforced** (browser) | CKL `policy-ascension-evidence` require[] |
| Ascension drift throttle | **partial** | CKL `modify_param` when drift_score > 0.7 |
| No decision without replayability | **partial** | CSR param replay + timeline seek + FrameProvenance recorder |

## III. Constitutional organs

| Organ | Status | Path |
| --- | --- | --- |
| Governance Kernel (GK) | **enforced** (browser) | `engine/governance/GovernanceKernel.js` (re-exported by `js/engine/governance/`) |
| Constitutional State Engine (CSE) | **enforced** | `js/constitution/cse.js` |
| Intent Specification Language (ISL) v2.0 | **enforced** (JS parser) | `engine/scripting/IslParser.js` + `IslInterpreter.js`; C# mirror **partial** |
| Evidence Layer (EL) | **partial** | `js/engine/services/evidence.js` |
| Constitutional Knowledge Layer (CKL) | **enforced** (browser policies) | `engine/governance/ConstitutionalKnowledgeLayer.js` + `policies/default.policies.json` |
| Temporal Replay Timeline (TRT) | **partial** | `js/engine/services/replay.js` + timeline player |
| Constitutional State Space (CSSV) | **partial** | `engine/cssv/`, `cssv/` ledger + CQL dashboard |

## IV. CIEMS sovereignty stack

| Layer | Status |
| --- | --- |
| Constitution | **enforced** — this charter + machine charter |
| Specification | **partial** — `schemas/*.schema.json` |
| Conformance | **partial** — `engine/conformance/` profile + browser adapter smoke test |
| Implementation | **partial** — browser host enforced path; Unity/Unreal skeleton |
| Deployment | **partial** — static HTTP |
| Namespace | **partial** | `SovereignX.CIEMS.Engine.*` (C# shared engine); Unity mirrors **skeleton** |

## Production readiness (browser host)

| Capability | Status | Verification |
| --- | --- | --- |
| Smoke test suite | **enforced** | `npm test` (conformance + CQL + CKL) |
| Browser conformance (16/16) | **enforced** | `npm run test:conformance` |
| Dev stack (browser + CSSV) | **enforced** | `npm start` |
| CSSV ledger ingest API | **enforced** | POST `/ingest` on CSSV server |
| CSSV session export (browser) | **partial** | Download button + optional server sync |
| Unity / Unreal conformance adapters | **partial** | 16 probes implemented; static probe coverage in `npm test`; Editor/PIE execution not CI-verified |
| Unity / Unreal CSSV ingest | **partial** | Frames on tick + transitions on CKL allow; in-memory ledger + optional sync (Unity) |
| Unity / Unreal movie pipeline | **partial** | PNG sequence + optional Unity Recorder MP4 (Editor) + Unreal MRQ ProRes (`MakeMovieMRQ`); Play Mode/PIE/MRQ not CI-verified |
| Unreal project scaffold | **partial** | `unreal/GovernedUnrealProject/` + plugin junction; compile blocked without Windows 10 SDK |
| SovereignX namespace (Unity) | **skeleton** | Shared `engine/` migrated; Unity copies pending |

## V. Runtime services

| Service | Status |
| --- | --- |
| Intent | **partial** (CSE JSON + ISL CompileAndEvaluate) |
| Evidence | **partial** |
| Authority | **enforced** for contract allow-lists |
| Execution / Orchestrator | **partial** (browser) / **skeleton** (Unity host) |
| Replay | **partial** |
| Provenance | **partial** |

## VI. Subsystems

| Subsystem | Status |
| --- | --- |
| Governance | **enforced** CKL+GK in browser via `/engine/` |
| Runtime orchestration | **partial** |
| Rendering (canvas 4D) | **enforced** math + draw via package `4d-renderer` |
| Scene graph | **partial** — world JSON entities |
| Scripting / ISL v2.0 | **enforced** JS; C#/Unity **skeleton** |
| Asset registry | **partial** — world asset list |
| Cinematic 4D renderer | **enforced** browser; Unity/Unreal **partial** (wireframe + solid mesh; editor Play/PIE tests present, native batch optional) |
| Editor constitution | **skeleton** (Unity EditorWindow only) |
| Cinematic timeline | **partial** — JSON timeline drives params in browser; Unity TimelineExecutor **skeleton** |

## VII. Cinematic 4D renderer (enforced in browser)

- **SoT:** `mrs/packages/renderer-core/` (`@mrs/renderer-core`) — math, projection, surfaces, canvas draw (`src/index.js`). Root `4d-renderer/` is a compatibility shim that re-exports this package.
- **Host adapter:** `js/renderer.js` — preserves CSE/TimelinePlayer/evidence API (`theta`, `speed`, `cameraY`, …)
- Default demo mesh: unit **tesseract** (16 verts, 32 edges); parametric surfaces (Clifford torus, Hopf, …) available in package + CLI
- Planes XW,YZ,ZW,YW; project via d₄ then d₃; wireframe / solid draw
- Browser movie export: governed **WebM** (`js/export.js`); CLI PNG + optional FFmpeg MP4 via `@mrs/renderer-core` (`4d-renderer` shim)
- Provenance on export CSR + frame recorder during timeline play
- Unity / Unreal: mesh JSON wireframe **and solid** (`MeshFilter` / `UProceduralMeshComponent`); `renderMode` / `RenderMode`; faces in `*.mesh.json` via `npm run export:surfaces`
- Host solid / Play Mode CI: **enforced** in Node via `npm run test:solid-play` (mesh faces + solid APIs + projected frame). Unity Test Runner + Unreal `GovernedEngine.FourD.SolidSmoke` present; native batch optional via `UNITY_PATH` / Session Frontend

### VII.b RT4D path engine (4DRS v1.0)

| Claim | Status | Evidence |
| --- | --- | --- |
| Formal engine name RT4D | **declared** | `docs/4drs/NAMING.md` |
| Stable API freeze (math…scene) | **partial** | barrels + `docs/4drs/api/rt4d-v1.0-freeze.md` + package exports |
| Hyper-Caustic Lens official validation | **enforced** (factory) | `createHyperCausticLens` + `docs/4drs/validation/` |
| Baseline preview render | **partial** | `npm run render:hcl-baseline` + artifact checksums when present |
| Spec / tech note / architecture published in-repo | **enforced** | `docs/4drs/SPEC-v1.0.md`, `First-4D-Renderer.md`, `ARCHITECTURE.md` |
| Zenodo DOI | **declared** | `CITATION.cff` / `.zenodo.json` list `10.5281/zenodo.21499388`; confirm deposit on Zenodo |

### VII.c Mathematical substrate & live-link (4DRS)

| Claim | Status | Evidence |
| --- | --- | --- |
| Math foundations + contracts (4D-PCC…DR-C) | **declared** | `docs/4drs/substrate/MATHEMATICAL_FOUNDATIONS.md`, `CONSTITUTIONAL_CONTRACTS.md` |
| MRS-CRC v1.0 Articles I–VII | **declared** | `docs/4drs/substrate/MRS-CRC-v1.0.md` |
| 4D BVH GPU kernel (CUDA/WGSL) | **skeleton** | `native/cuda/rt4d/`, `rt4d/accel/gpu/` |
| Packed CPU GPU-shaped traverse | **skeleton** | `packBVH4D` / `traverseBVH4DPacked` + `scripts/test-bvh4d-gpu.mjs` |
| Unity MRS live-link client | **skeleton** | `unity/.../LiveLink/MRSUnityLiveLink.cs` |
| MRS binary protocol MRS1 | **declared** | `docs/4drs/substrate/MRS_BINARY_PROTOCOL.md` |
| Replay validator outline | **declared** | `scripts/replay-validator-outline.mjs` |
| MRS Inspector Contract (MRS-IC) v1.1 | **declared** | `docs/4drs/contracts/MRS-IC-v1.1.md` (substrate redirect) |
| MRS Inspector Contract (MRS-IC) v1.2 | **declared** | `docs/4drs/contracts/MRS-IC-v1.2.md` (invariants; not runtime-enforced) |
| 4D Inspector engine API | **skeleton** | `mrs/packages/renderer-core/src/inspector/` + `npm run test:inspector4d` |
| Unity 4D Inspector Editor window | **skeleton** | `unity/.../Inspector/Editor/MRS4DInspectorWindow.cs` |
| Inspector shader debug (v1.4) | **declared / future** | `docs/4drs/substrate/shader-debugging.md` |
| Inspector GPU budget model | **declared budget** | `docs/4drs/substrate/performance/inspector-gpu-budget.md` (not measured) |

## VIII. Host ports

| Port | Status |
| --- | --- |
| Browser (repo root) | **runs** — Opening + Mythar Ascension via ISL → CKL/GK → TimelinePlayer |
| Unity (`unity/GovernedUnityProject/`) | **skeleton** — DTOs, world loader, provenance, replay mirrors; Play Mode not CI-verified |
| Unity FourDAdapter (`Assets/Engine/FourDAdapter/`) | **skeleton** — consumes Scene3D+lineage; does not compute 4D (see `docs/4d-engine/v1/`) |
| Unreal (`unreal/GovernedEnginePlugin/`) | **skeleton** — Option B timeline scheduler + binding resolver + provenance tick; Sequencer optional |
| Unreal FourDAdapter (`unreal/FourDAdapter/`) | **skeleton** — Scene3D+lineage import stubs; does not compute 4D |
| 4D Engine v1 architecture docs | **declared** — `docs/4d-engine/v1/` (World Format, PLP, adapters) |

## Boot sequence (browser — enforced)

1. Load charter (`js/constitution/charter.js`)
2. Init CSE; load CKL policies from `engine/governance/policies/default.policies.json`
3. Init GK from `engine/governance/GovernanceKernel.js` + ISL engine from `engine/scripting/`
4. Load `demo/worlds/mythar_plains.world.json`
5. Load `demo/timelines/opening_4d_reveal.timeline.json` (+ Ascension JSON available)
6. Start render loop
7. **Play Opening / Mythar Ascension:** CompileAndEvaluate ISL → `evaluateIntent` (CKL) → only then TimelinePlayer + CSE CSR + frame provenance

## Evidence map

| Artifact | Path |
| --- | --- |
| Machine charter | `js/constitution/charter.js` |
| Contracts | `js/constitution/contracts.js` |
| CSE | `js/constitution/cse.js` |
| Engine SoT (JS) | `engine/` |
| Shared DTOs | `engine/dto/` |
| Provenance / Replay | `engine/runtime/ProvenanceRecorder.*`, `ReplayService.*` |
| World / timeline loaders | `engine/world/`, `engine/timeline/` (headers + C#; UE impl in plugin Private) |
| Binding / scheduler (Option B) | `engine/runtime/GovernedBinding.h`, `TimelineScheduler.h` |
| Browser host glue | `js/engine/` |
| Browser 4D adapter | `js/renderer.js` → `@mrs/renderer-core` / `mrs/packages/renderer-core/src/index.js` |
| 4D render package | `mrs/packages/renderer-core/` (CLI + surfaces + canvas draw); `4d-renderer/` shim |
| Schemas | `schemas/` |
| Demo world / timelines | `demo/worlds/`, `demo/timelines/` (incl. `mythar_ascension`) |
| ISL scripts | `engine/scripting/scripts/Opening4DReveal.isl`, `MytharAscension.isl` |
| ISL grammar notes | `engine/scripting/ISL_V2_GRAMMAR.md` |
| Unity project | `unity/GovernedUnityProject/` |
| Unreal plugin | `unreal/GovernedEnginePlugin/` |
| Conformance profile | `engine/conformance/default.conformance-profile.json` |
| Conformance checker | `engine/conformance/ConformanceChecker.*` |
| CSSV model + CRA | `constitution/CSSV.md`, `constitution/CRA_CSSV.md` |
| CSSV ledger + CQL | `cssv/`, `engine/cssv/` |
| CSSV dashboard | `cssv/server.js`, `cssv/public/` |
| Production scripts | `package.json`, `scripts/test-all.mjs`, `scripts/start-dev.mjs` |
| Root README | `README.md` |
| 4DRS v1.0 docs | `docs/4drs/` |
| 4D Engine v1 (declared architecture) | `docs/4d-engine/v1/` — constitution, World Format, PLP, adapter stubs |
| RT4D engine | `mrs/packages/renderer-core/src/render/rt4d/` |
| HCL baseline script | `scripts/render-hyper-caustic-baseline.mjs` |
| Substrate docs | `docs/4drs/substrate/` |
| CUDA BVH skeleton | `native/cuda/rt4d/` |
| Unity live-link | `unity/GovernedUnityProject/Assets/Engine/LiveLink/` |
| Unity FourDAdapter | `unity/GovernedUnityProject/Assets/Engine/FourDAdapter/` (**skeleton**) |
| Unreal FourDAdapter | `unreal/FourDAdapter/` (**skeleton**) |
