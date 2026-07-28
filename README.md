# 4D Rendering System (4DRS) — Mandala / MRS

**Start here:** [`docs/START_HERE_MRS_30_MIN.md`](docs/START_HERE_MRS_30_MIN.md) — practical onboarding in ~30 minutes (commands, layout, role paths). Not marketing.

## Quick Start (30 seconds)

```bash
# Clone and install
git clone <repo-url> && cd "Mandala Rendering Software"
npm install

# Run the web demo
npm run serve
# open http://localhost:8080

# Run all tests (smoke + governance + conformance)
npm run test:all

# Run governance tests only
npm run test:governance

# Sync surface meshes to Unity/Unreal
npm run sync:surfaces

# Render a still frame
npm run render:4d -- --surface tesseract --width 512 --height 512
```

Published title: **4D Rendering System v1.0**  
Formal engine name: **RT4D** (*Ray Tracer for Four Dimensions*)  
Official validation scene: **Hyper-Caustic Lens**

Governed 4D cinematic host stack (historical name 4DCE) with portable constitutional evidence across Browser, Unity, and Unreal hosts, plus the RT4D path engine.

**Namespace:** `SovereignX.CIEMS.Engine.*`  
**Evidence bound:** status tags (`enforced` / `partial` / `declared` / `skeleton`) follow [`constitution/CHARTER.md`](constitution/CHARTER.md) and machine SoT in [`engine/constitution/charter.js`](engine/constitution/charter.js) — do not treat prose alone as a runtime gate.

## What’s new (2026-07)

Operator-facing deltas only — not a promotion claim. Evidence lives in code, tests, and CECP trails.

| Area | What landed | Status |
| --- | --- | --- |
| Genblaze BYOK | Local-first keys in `sessionStorage`; hosted off unless `GENBLAZE_ALLOW_BYOK=1`; NIM/GPU **assist-only** | **partial** / tests in-app — [`docs/genblaze/`](docs/genblaze/) |
| Mandala agent pack | 14-agent corpus → 6 Cursor agents + Mandala Mode; skill IDs are catalogs, not 312 executables | **declared** / **partial** — [`docs/governance/cecp/MANDALA_SIX_AGENTS.md`](docs/governance/cecp/MANDALA_SIX_AGENTS.md) |
| Agent tooling | Constitutional linter, drift radar, auto-fix dry-run under [`mandala-agent-pack/`](mandala-agent-pack/); additive [`.github/workflows/mandala-agent-ci.yml`](.github/workflows/mandala-agent-ci.yml) | **partial** heuristics (not full constitutional enforcement) |
| Conformance + runtime | Browser conformance `file://`/Node fetch stub; `npm run test:runtime-provenance` (hash + replay lineage) in root CI | **enforced** via `npm run test:conformance` (16/16) + runtime unit tests |
| GPU modules | `PostProcessor` / `ShadowMapper` / `EnvironmentMapper` + ESM `GPUPreviewClient`; package-types ignores `vendor/` | **partial** — unit tests under `mrs/packages/renderer-core/test/gpu/` |
| Digital Printer / Sovereign X | CPU RT4D print SoT (`cpu.rt4d.print`); GPU/NIM assist ≠ print beauty SoT | **partial** API / trails — see [Sovereign X · Digital Printer](#sovereign-x--digital-printer) |

## Showcase (reference surfaces)

Interactive Canvas demo and tutorials for the five registered surfaces — **reference implementation** showcase, not a claim of product-complete post-processing.

| Entry | Path |
| --- | --- |
| Web demo | [`examples/web-demo.html`](examples/web-demo.html) |
| Gallery | [`examples/gallery/`](examples/gallery/) |
| Tutorials | [`examples/tutorials/`](examples/tutorials/) |
| Suite index | [`examples/README.md`](examples/README.md) |

```bash
npm run serve
# open http://localhost:8080/examples/web-demo.html
```

Package notes: [`4d-renderer/README.md`](4d-renderer/README.md) (shim) · canonical core: [`mrs/packages/renderer-core`](mrs/packages/renderer-core) (`@mrs/renderer-core`).

**MRS × ChatGPT App (monorepo):** see [`mrs/README.md`](mrs/README.md) and [`mrs/apps/chatgpt-mrs/README.md`](mrs/apps/chatgpt-mrs/README.md).

### Related surfaces (honest pointers)

| Surface | Path | Status |
| --- | --- | --- |
| Genblaze media (FLUX stills → B2) | [`mrs/apps/genblaze-media`](mrs/apps/genblaze-media) | **Prepared** operator MVP; video **default off** (`GENBLAZE_VIDEO_ENABLED=0`); BYOK docs under [`docs/genblaze/`](docs/genblaze/) |
| NIM Cosmos / Seedance video | same app, opt-in backends | Cosmos + Seedance (fal, **billed**) — see app README; temporal layers **declared** |
| Mandala agent pack | [`mandala-agent-pack/`](mandala-agent-pack/) | **Declared** / **partial** — 14 corpus → 6 Cursor agents; see [Mandala agents](#mandala-agents--tooling) |
| CROS scaffold | [`mrs/packages/cros`](mrs/packages/cros) | Reference architecture — CI-001..006 validators **caller-invoked**; **not** a claim genblaze implements CROS |
| PI-* / cross-runtime / CKL soft·enforce | [`mrs/packages/renderer-core`](mrs/packages/renderer-core) · [`STACK.md`](mrs/packages/renderer-core/src/render/rt4d/invariants/STACK.md) | PI-* **tested**; soft accept opt-in; enforce deny opt-in |
| SX-PTIG (continuity ≠ acceptance) | [`SX-PTIG.md`](mrs/packages/renderer-core/src/gpu/constitution/SX-PTIG.md) | **Declared** + unit-tested heuristics; not full CKL enforcement of PTIG |
| Desktop copilot shell | [`desktop/`](desktop/) | Chat / tools / probes — **not** a full RT4D viewport |

```bash
cd mrs && pnpm run setup   # fresh clone: install + rebuild canvas/esbuild
```

## Genblaze BYOK (local-first)

Genblaze is a **concept media** operator surface (2D FLUX/NIM stills → B2 provenance), not a 4D renderer. BYOK keeps secrets in the browser tab.

| Rule | Evidence |
| --- | --- |
| Keys in `sessionStorage` only (tab lifetime) | UI + [`app/byok.py`](mrs/apps/genblaze-media/app/byok.py); charter |
| Hosted BYOK off unless `GENBLAZE_ALLOW_BYOK=1` | Config + unit tests (`tests/test_byok.py`) |
| NIM / GPU / face-assist = **assist-only** | Never Digital Printer / `cpu.rt4d.print` beauty SoT |
| RT4D CPU print remains SoT for plates | [`CONTRACT_DIGITAL_PRINT.md`](mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md) |

**Docs (operators):**

| Doc | Path |
| --- | --- |
| Onboarding | [`docs/genblaze/operators/user-onboarding-guide.md`](docs/genblaze/operators/user-onboarding-guide.md) |
| Training | [`docs/genblaze/operators/operator-training-manual.md`](docs/genblaze/operators/operator-training-manual.md) |
| Handbook | [`docs/genblaze/operators/operator-handbook.md`](docs/genblaze/operators/operator-handbook.md) |
| BYOK security charter | [`docs/genblaze/security/byok-security-charter.md`](docs/genblaze/security/byok-security-charter.md) |
| Assisted pipeline | [`docs/genblaze/pipeline/byok-assisted-pipeline.md`](docs/genblaze/pipeline/byok-assisted-pipeline.md) |
| App README | [`mrs/apps/genblaze-media/README.md`](mrs/apps/genblaze-media/README.md) |
| Scorecard | [`docs/scorecards/genblaze-media.md`](docs/scorecards/genblaze-media.md) |

```bash
# Local Genblaze (from repo root; Node 20+ + Python venv per app README)
npm run genblaze:media
# UI http://127.0.0.1:8787/  ·  health http://127.0.0.1:8787/health

cd mrs/apps/genblaze-media && pytest -q
```

## Mandala agents · tooling

Constitutional agent lawbook: [`AGENTS.md`](AGENTS.md).

**Shared agent SoT:** [`mandala-agent-pack/`](mandala-agent-pack/) (tracked).  
**`.cursor/` is local IDE config** — gitignored; regenerate operational agents/rules from the pack ([`mandala-agent-pack/docs/cursor-local-setup.md`](mandala-agent-pack/docs/cursor-local-setup.md)). Optional Mandala Mode rule may live at `.cursor/rules/mandala-mode.mdc` locally (lenses only — not a charter rewrite).

| Artifact | Role | Status |
| --- | --- | --- |
| [`mandala-agent-pack/`](mandala-agent-pack/) | 14-agent folders + manifests (skills, personality, Mandala Mode) + lint/radar/auto-fix | **declared** / **partial** |
| `.cursor/agents/` (local) | Six operational Cursor agents (fold of the 14) — **not** git SoT | **partial** / local |
| [`docs/governance/cecp/MANDALA_SIX_AGENTS.md`](docs/governance/cecp/MANDALA_SIX_AGENTS.md) | 14→6 map, mode matrix, hand-offs | **declared** |
| Skill catalogs | `mandala-agent-pack/manifests/skills.json` (~173 IDs landed); fuller inventory **declared** in [`docs/governance/AGENT_SKILL_SPEC.md`](docs/governance/AGENT_SKILL_SPEC.md) | catalogs ≠ executable `SKILL.md` count |
| Release versions | [`docs/governance/RELEASE_VERSIONING.md`](docs/governance/RELEASE_VERSIONING.md) · `npm run release:check` | **partial** |

**Tooling** (CI-backed paths under the pack; heuristics are **partial**, not full constitutional enforcement):

| Tool | Command | Notes |
| --- | --- | --- |
| Constitutional linter | `node mandala-agent-pack/lint/run-lint.js` | Report / fail on heuristic hits |
| Drift radar | `node mandala-agent-pack/drift-radar/generate-report.js` | JSON report artifact |
| Auto-fix | `node mandala-agent-pack/auto-fix/auto-fix.js` | **Dry-run** default; refuses protected paths; CI never `--apply` |
| Additive CI | [`.github/workflows/mandala-agent-ci.yml`](.github/workflows/mandala-agent-ci.yml) | Lint + radar + dry-run + governance/conformance/runtime + Genblaze BYOK pytest |

Root [`.github/workflows/ci.yml`](.github/workflows/ci.yml) remains the primary smoke/governance/conformance pipeline; Mandala Agent CI is **additive**.

## Sovereign X · Digital Printer

Authoritative print beauty / evidence SoT is **CPU RT4D** (`cpu.rt4d.print`). GPU integrators, WebGPU preview, and Genblaze NIM paths are **assist-only** — they must not be claimed as print SoT.

| Doc | Path |
| --- | --- |
| Printer HTTP contract | [`docs/governance/cecp/PRINTER_SERVICE_API.md`](docs/governance/cecp/PRINTER_SERVICE_API.md) (**partial**) |
| Digital print boundary | [`mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md`](mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md) |
| Printer-mode trail | [`docs/governance/cecp/trails/printer-mode-renderer-2026-07/`](docs/governance/cecp/trails/printer-mode-renderer-2026-07/) |
| GPU assist / vendor router trails | [`docs/governance/cecp/trails/sovereign-x-gpu-assist-2026-07/`](docs/governance/cecp/trails/sovereign-x-gpu-assist-2026-07/), [`docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/`](docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/) |

Initiative ESFR for printer-mode remains **HOLD** / gap-tracked in trail evidence — not marketed as promote-ready.

### Windows native canvas (optional for widget)

Headless PNG (CLI, gallery, some exports) needs native `canvas` + VS C++ Build Tools on Windows — see [`mrs/README.md`](mrs/README.md#windows-native-canvas-honest). Browser demo and ChatGPT widget use Canvas2D and do **not** require cairo.

## Capability snapshot

Statuses below match charter evidence (not marketing). Details: [`constitution/CHARTER.md`](constitution/CHARTER.md) · machine SoT: [`engine/constitution/charter.js`](engine/constitution/charter.js). Per-dimension scorecards: [`docs/scorecards/`](docs/scorecards/).

| Capability | Status |
| --- | --- |
| 4D parametric surfaces | Present |
| RT4D path rendering | Present |
| Browser host | Present |
| CSSV ledger | Partial |
| Hyper-Caustic Lens validation | Present |
| WebGPU | Present |
| Canvas fallback | Present |
| GPU PostProcessor / ShadowMapper / EnvironmentMapper | Partial (unit-tested modules) |
| Provenance hash + replay lineage receipts | Enforced in runtime unit tests (`npm run test:runtime-provenance`) |
| Genblaze BYOK (sessionStorage + `GENBLAZE_ALLOW_BYOK`) | Partial (app tests + docs) |
| Digital Printer `/printer` API | Partial (CPU RT4D print SoT; GPU assist-only) |
| Mandala agent pack + six Cursor agents | Declared / partial |
| Unity adapter | Skeleton (FourDAdapter hybrid-first) |
| Unreal adapter | Skeleton (`unreal/FourDAdapter/`) |
| Native Vulkan dispatch | Experimental |
| Live engine link (shared-frame / MRS↔Unity) | Experimental |
| 4D Inspector (MRS-IC) | Skeleton (contracts v1.1/v1.2 declared; curvature stub) |
| 4D BVH GPU kernels | Skeleton |
| Mathematical substrate / MRS-CRC | Declared |
| 4D physics | Skeleton |
| Shader graph | Skeleton |
| 4D Engine v1 constitution / World Format / PLP | Declared (`docs/4d-engine/v1/`) |
| WorldDocument schema + example validation | Declared / partial (`npm run validate:world-document`) |
| PLP `projectWorld` stub | Skeleton (`@mrs/renderer-core` `/plp`) |
| FourDRenderer v2.0 architecture / RFCs | Declared / draft (`docs/4d-engine/v2/`) — Phase 1 **docs**; GPU/RHI **roadmap** |
| FourDRenderer v2 Unreal RHI / Nanite / Lumen | Roadmap (not FourDAdapter v1.1) |
| RT4D GPU evolution (v2–v4) | Roadmap / declared (`docs/4d-engine/rt4d/`) — wavefront, denoise, multi-GPU, Vulkan/DX **not implemented** |
| Object storage (B2 S3-compatible) | Declared / operator-configured (`@mrs/storage-b2`, [`docs/ops/BACKBLAZE_B2_S3.md`](docs/ops/BACKBLAZE_B2_S3.md)) — not cloud rendering complete |

### Maturity (Drive-G-2)

Do not collapse readiness to one adjective. Use the five dimensions independently (constitutional model, governance methodology, reference implementation, platform engineering, commercial operations). Scorecards:

| Scorecard | Path |
| --- | --- |
| RT4D | [`docs/scorecards/rt4d.md`](docs/scorecards/rt4d.md) |
| 4D Engine v1 | [`docs/scorecards/4d-engine-v1.md`](docs/scorecards/4d-engine-v1.md) |
| FourDRenderer v2 | [`docs/scorecards/fourd-renderer-v2.md`](docs/scorecards/fourd-renderer-v2.md) |
| MRS v2 | [`docs/scorecards/mrs-v2.md`](docs/scorecards/mrs-v2.md) |
| Genblaze media | [`docs/scorecards/genblaze-media.md`](docs/scorecards/genblaze-media.md) |

**Hosts:** Browser host is the verified conformance target. Unity / Unreal remain **skeleton** until Play-in-Editor (or equivalent) is proven — adapters are not operator-ready product surfaces.

## v1.0 publish package

| Artifact | Path |
| --- | --- |
| Naming | [`docs/4drs/NAMING.md`](docs/4drs/NAMING.md) |
| Spec | [`docs/4drs/SPEC-v1.0.md`](docs/4drs/SPEC-v1.0.md) |
| Architecture | [`docs/4drs/ARCHITECTURE.md`](docs/4drs/ARCHITECTURE.md) |
| Technical note | [`docs/4drs/First-4D-Renderer.md`](docs/4drs/First-4D-Renderer.md) |
| RT4D API freeze | [`docs/4drs/api/rt4d-v1.0-freeze.md`](docs/4drs/api/rt4d-v1.0-freeze.md) |
| Hyper-Caustic Lens | [`docs/4drs/validation/Hyper-Caustic-Lens.md`](docs/4drs/validation/Hyper-Caustic-Lens.md) |
| Substrate / MRS-CRC | [`docs/4drs/substrate/`](docs/4drs/substrate/) |
| Charter | [`constitution/CHARTER.md`](constitution/CHARTER.md) |
| Citation / Zenodo | [`CITATION.cff`](CITATION.cff), [`.zenodo.json`](.zenodo.json) |
| 4D Engine v1 (declared) | [`docs/4d-engine/v1/README.md`](docs/4d-engine/v1/README.md) |
| FourDRenderer v2 (declared RFCs) | [`docs/4d-engine/v2/README.md`](docs/4d-engine/v2/README.md) |
| FourDRenderer v2 scorecard | [`docs/scorecards/fourd-renderer-v2.md`](docs/scorecards/fourd-renderer-v2.md) |
| RT4D GPU evolution roadmap (v2–v4) | [`docs/4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md`](docs/4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md) |
| RT4D scorecard | [`docs/scorecards/rt4d.md`](docs/scorecards/rt4d.md) |

```bash
npm run render:hcl-baseline   # regenerate Hyper-Caustic Lens preview + checksums
```

## Quick start (production dev stack)

Requires **Node.js 20+**.

```bash
npm test          # all smoke tests (conformance, CQL, CKL)
npm start         # browser :8080 + CSSV dashboard :3000
```

| Service | URL | Purpose |
|---------|-----|---------|
| Browser host | http://localhost:8080/ | 4D renderer + governed cinematics |
| CSSV dashboard | http://localhost:3000/ | CQL queries, trajectory charts |
| CSSV health | http://localhost:3000/health | Liveness probe |
| CSSV ingest | POST http://localhost:3000/ingest | Persist browser session ledger |

Open the browser host, play **Opening 4D Reveal** or **Mythar Ascension**, then click **Download CSSV ledger**. The session syncs to the CSSV server when it is running (`npm start`).

The renderer exposes all five surfaces, four visual profiles, adaptive performance/high/ultra
quality, combined solid and wireframe output, drag navigation, wheel zoom, Space to pause, and
R to reset. WebGPU uses normal lighting and a validated packed-uniform contract, with Canvas as
the deterministic fallback. Native dispatch supports the resident Sovereign X Vulkan daemon
and governed `AbortSignal` cancellation.

For live native presentation, set `SOVEREIGNX_SHARED_FRAME_PATH` to the worker's
`sharedFramePath`, start the browser host, and open `/?nativePreview=1`. The server publishes
only the active slot of the double-buffered SXFR ring; the browser validates its header and
sequence before presenting RGBA pixels.

## Architecture

```
ISL intent → CKL/GK decision → TimelinePlayer → Frame provenance → CSSV ledger
                     ↓
            Conformance profile (16 checks per host)
```

- **Engine SoT:** `engine/` — governance, DTOs, runtime (ProvenanceRecorder / ReplayService), CSSV, conformance
- **Browser glue:** `js/` — CSE, boot, renderer
- **Renderer core:** `mrs/packages/renderer-core/` — RT4D math/path + GPU assist modules
- **CSSV ledger:** `cssv/` — artifacts.json + transitions.ndjson + frames.ndjson
- **Genblaze:** `mrs/apps/genblaze-media/` — concept media + BYOK + `/printer` (**partial**)
- **Agents:** `mandala-agent-pack/` + `.cursor/agents/` — corpus + six operational agents
- **Unity / Unreal:** skeleton hosts until Play-in-Editor verified

Recent hardening (evidence-bound, not marketing): conformance Node stub for policy load; `scripts/check-package-types.mjs` ignores `vendor/`; GPU module fixes + `GPUPreviewClient` ESM; provenance `provenanceHash` + replay lineage receipts wired into CI (`test:runtime-provenance`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Full smoke test suite |
| `npm run test:all` | Smoke + governance + conformance |
| `npm run test:conformance` | 16-check browser conformance profile |
| `npm run test:governance` | Governance unit tests (`engine/governance/test/`) |
| `npm run test:runtime-provenance` | ProvenanceRecorder + ReplayService unit tests |
| `npm run test:cql` | CQL parser + interpreter |
| `npm run test:ckl` | Mythar Ascension CKL policies |
| `npm run check:types` | Package `type` consistency (`vendor/` ignored) |
| `npm run genblaze:media` | Local Genblaze FastAPI on `:8787` |
| `npm run init:cssv` | Initialize empty ledger files |
| `npm run serve` | Static browser host only |
| `npm run cssv:server` | CSSV dashboard + API only |
| `npm start` | Both servers |
| `npm run examples:gallery` | Generate gallery PNGs (needs native `canvas`; see mrs README) |
| `npm run examples:bench` | Measure local Node CanvasRenderer timings |
| `npm run test:examples` | Examples suite smoke |
| `node mandala-agent-pack/lint/run-lint.js` | Constitutional linter (**partial** heuristics) |
| `node mandala-agent-pack/drift-radar/generate-report.js` | Drift radar report |
| `node mandala-agent-pack/auto-fix/auto-fix.js` | Auto-fix **dry-run** |

Genblaze pytest (from app dir): `cd mrs/apps/genblaze-media && pytest -q`

## Conformance

Every runtime must satisfy the canonical profile in `engine/conformance/default.conformance-profile.json`:

- Provenance, Replay, Binding, Timeline, Evidence, CKL (16 checks)

Browser: **verified** via `npm run test:conformance` (Node harness uses a stub `fetch` so CKL policy load works without `file://` fetch failures).  
Runtime provenance/replay: **verified** via `npm run test:runtime-provenance` (frame hash fields + replay lineage receipts).  
Unity / Unreal: adapters **skeleton** — not claimed as 16/16 host conformance.

## CSSV + CQL

Constitutional State Space Visualization stores artifacts, transitions, and frame provenance in a host-agnostic ledger. Query with CQL:

```sql
SELECT frames
FROM frame
WHERE frame.timeline = "mythar_ascension"
ORDER BY frame.timestamp ASC
LIMIT 1000
```

See `constitution/CSSV.md` and `constitution/CRA_CSSV.md`.

## Unreal (UE 5.8)

Detected at `C:\Program Files\Epic Games\UE_5.8`. C++ compile requires **Visual Studio 2022** with Desktop C++ workload and **Windows 10 SDK**.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-unreal.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-unreal.ps1   # after SDK installed
```

Open `unreal/GovernedUnrealProject/GovernedUnrealProject.uproject` — see `unreal/GovernedUnrealProject/README.md` for PIE setup.

## Deployment notes

- Serve the repo root over HTTP (ES modules require it — do not open `index.html` as `file://`).
- Run CSSV server alongside the browser host for ingest + dashboard.
- Unity/Unreal: copy `engine/` shared sources into host projects; verify namespace references.

## Evidence map

Full artifact index: `constitution/CHARTER.md` § Evidence map.  
Agent lawbook: [`AGENTS.md`](AGENTS.md).  
CECP / six agents: [`docs/governance/cecp/MANDALA_SIX_AGENTS.md`](docs/governance/cecp/MANDALA_SIX_AGENTS.md).  
Genblaze operators + BYOK: [`docs/genblaze/`](docs/genblaze/).  
Maturity scorecards: [`docs/scorecards/`](docs/scorecards/).
