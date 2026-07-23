# Start Here — MRS in 30 Minutes

> Practical onboarding for this repository. Not marketing.  
> **Drive-G-1:** claims match code, tests, schemas, or ledger rows.  
> **Drive-G-2:** rate maturity by dimension — do not collapse to one “ready” adjective.

| Field | Value |
| --- | --- |
| Audience | New contributors, evaluators, studio/graphics engineers |
| Time budget | ~30 minutes for a first honest pass |
| Evidence anchors | Root [`README.md`](../README.md), [`constitution/CHARTER.md`](../constitution/CHARTER.md), scorecards under [`docs/scorecards/`](./scorecards/) |

---

## 1. What problem does MRS solve?

**MRS / 4DRS** is a governed stack for **authoring, projecting, and inspecting higher-dimensional (4D) content**, then handing host-visible 3D + lineage to browsers and game engines.

| Need | What this repo prepares |
| --- | --- |
| Author / render in \(\mathbb{R}^{4}\) | Parametric surfaces, RT4D path work, Canvas/WebGPU demo paths |
| Project into 3D hosts | World Format / PLP **declared**; hybrid-first adapters **consume** Scene3D + lineage |
| Inspect / validate | Inspector contracts + **skeleton** tooling; Hyper-Caustic Lens validation scene |
| Hybrid with Unity / Unreal / web | Browser host **present**; Unity/Unreal FourDAdapter **skeleton**; ChatGPT MCP app in `mrs/` |

### Framing (Drive-G-2)

> **The engine may exist; the factory may still be early.**

| Dimension | Honest snapshot |
| --- | --- |
| Constitutional model | **Declared** — charters, Engine v1, FourDRenderer v2 RFCs |
| Governance methodology | **Declared / partial** — contracts and ledgers; not every gate is runtime-enforced |
| Reference implementation | **Partial** — Canvas/web demo, RT4D/BVH **partial**, inspector **skeleton** |
| Platform engineering | **Skeleton / roadmap** — FourDAdapter hybrid-first; deep Unreal RHI **roadmap** |
| Commercial operations | **Roadmap** — no self-serve product claim |

### Softened “platform” reality (what is actually here)

| Surface | Status |
| --- | --- |
| Canvas / web demo | **Present** (`npm run serve` → `examples/web-demo.html`) |
| RT4D / BVH | **Partial** (path engine present; GPU BVH **skeleton**) |
| 4D Inspector (MRS-IC) | **Skeleton** (contracts declared; curvature stub) |
| ChatGPT MCP app | **Present as monorepo app** (`mrs/` — optional setup) |
| World Format / PLP | **Declared** (+ schema validation; PLP stub) |
| FourDAdapter (Unity / Unreal) | **Skeleton** |
| FourDRenderer v2 | **Declared RFCs** (Phase 1 docs; GPU/RHI **roadmap**) |
| Object storage (B2 S3-compatible) | **Declared / operator-configured** ([`docs/ops/BACKBLAZE_B2_S3.md`](./ops/BACKBLAZE_B2_S3.md)) |

Do **not** treat this as “world’s first” or unqualified “production-ready.” Per-dimension detail: [`docs/scorecards/fourd-renderer-v2.md`](./scorecards/fourd-renderer-v2.md), [`docs/scorecards/4d-engine-v1.md`](./scorecards/4d-engine-v1.md).

---

## 2. What can I do in the first 30 minutes?

Requires **Node.js 20+**. From the repository root (`G:\New folder` or your clone path).

### Minute 0–10 — Web demo (highest signal)

```bash
npm run serve
# open http://localhost:8080/examples/web-demo.html
```

Also useful:

- Gallery: [`examples/gallery/`](../examples/gallery/)
- Tutorials: [`examples/tutorials/`](../examples/tutorials/)
- Suite index: [`examples/README.md`](../examples/README.md)

Optional full stack (browser + CSSV dashboard): `npm start` — see root README.

### Minute 10–15 — Validate a WorldDocument (declared schema)

```bash
npm run validate:world-document
```

This checks the example against the World Format schema (**partial** enforcement — schema check, not a full engine). Spec: [`docs/4d-engine/v1/world-format/WORLD_FORMAT_V1.md`](./4d-engine/v1/world-format/WORLD_FORMAT_V1.md).

### Minute 15–25 — Tests (pick one)

```bash
# Focused inspector smoke (usually faster)
npm run test:inspector4d

# Full smoke suite — can be slower
npm test
```

If `npm test` runs long, start with `test:inspector4d` for a first pass, then run the full suite when you have time.

### Minute 20–30 — Optional: ChatGPT MCP monorepo

```bash
cd mrs
pnpm run setup   # fresh clone: install + rebuild canvas/esbuild
```

Details: [`mrs/README.md`](../mrs/README.md), [`mrs/apps/chatgpt-mrs/README.md`](../mrs/apps/chatgpt-mrs/README.md).  
On Windows, headless PNG needs native `canvas` + VS C++ Build Tools; the **browser demo does not**.

### Open these docs while you wait

| Doc | Why |
| --- | --- |
| [`constitution/CHARTER.md`](../constitution/CHARTER.md) | Enforced vs partial vs skeleton |
| [`docs/4drs/README.md`](./4drs/README.md) | 4DRS / RT4D publish package |
| [`docs/4d-engine/v1/README.md`](./4d-engine/v1/README.md) | Engine v1 / World Format / PLP / adapters |
| [`docs/4d-engine/v2/README.md`](./4d-engine/v2/README.md) | FourDRenderer v2 RFC index |
| [`docs/4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md`](./4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md) | RT4D GPU evolution **roadmap** (v2–v4) |
| [`docs/4drs/inspector/README.md`](./4drs/inspector/README.md) | Inspector contracts |
| [`docs/ops/BACKBLAZE_B2_S3.md`](./ops/BACKBLAZE_B2_S3.md) | Optional B2 object storage (operator-configured) |

---

## 3. How is the repository organized?

```text
G:\New folder\          (or your clone root)
├── README.md                 # Capability snapshot + quick start
├── constitution/             # Charter / evidence bound
├── examples/                 # Web demo, gallery, tutorials, scenes
├── src/                      # Browser / host rendering paths (RT4D, etc.)
├── mrs/                      # pnpm monorepo (renderer-core, ChatGPT app, …)
├── unity/                    # Unity FourDAdapter (skeleton)
├── unreal/                   # Unreal FourDAdapter (skeleton)
├── docs/
│   ├── START_HERE_MRS_30_MIN.md   # this file
│   ├── 4drs/                 # Spec, naming, substrate, inspector, validation
│   ├── 4d-engine/v1/         # Constitution, World Format, PLP, adapters
│   ├── 4d-engine/v2/         # FourDRenderer RFCs + comms drafts
│   ├── 4d-engine/rt4d/       # RT4D GPU evolution roadmap (v2–v4)
│   ├── ops/                  # Operator guides (e.g. B2 storage)
│   └── scorecards/           # Drive-G-2 maturity tables
├── schemas/                  # WorldDocument / PLP schemas
└── scripts/                  # serve, validate, tests
```

| Area | Role |
| --- | --- |
| **Root browser stack** | `npm run serve` / `npm start` — Canvas/WebGPU demo, CSSV paths |
| **`mrs/`** | Portable packages (`@mrs/renderer-core`) + ChatGPT MCP app |
| **`unity/` / `unreal/`** | Host adapters — **skeleton** Scene3D + lineage consumers |
| **`docs/4drs/`** | Published 4DRS / RT4D / Hyper-Caustic Lens / substrate |
| **`docs/4d-engine/v1/`** | Declared engine constitution + formats |
| **`docs/4d-engine/v2/`** | Declared renderer architecture RFCs; [`comms/`](./4d-engine/v2/comms/) = positioning drafts, not capability evidence |
| **`constitution/`** | What you may claim as present vs partial vs skeleton |
| **`examples/`** | Runnable and declared demos |

---

## 4. Where next by role

### Artist / technical artist

1. Run the web demo and browse [`examples/gallery/`](../examples/gallery/).  
2. Read Observation Mode framing: [`docs/4d-engine/v2/observation/OBSERVATION_MODE_RFC.md`](./4d-engine/v2/observation/OBSERVATION_MODE_RFC.md) (**declared**).  
3. Creative / director bible (aspirational creative OK): [`docs/4d-engine/v2/comms/WORLDBUILDING_GUIDE.md`](./4d-engine/v2/comms/WORLDBUILDING_GUIDE.md).  
4. Multi-world continuity: [`docs/4d-engine/v2/comms/MULTI_WORLD_CINEMATIC_BIBLE.md`](./4d-engine/v2/comms/MULTI_WORLD_CINEMATIC_BIBLE.md).

### Graphics programmer

1. [`docs/4drs/SPEC-v1.0.md`](./4drs/SPEC-v1.0.md) + [`docs/4drs/api/rt4d-v1.0-freeze.md`](./4drs/api/rt4d-v1.0-freeze.md).  
2. Core package: [`mrs/packages/renderer-core`](../mrs/packages/renderer-core).  
3. Validation scene: [`docs/4drs/validation/Hyper-Caustic-Lens.md`](./4drs/validation/Hyper-Caustic-Lens.md).  
4. Shader / ABI **declared**: [`docs/4d-engine/v2/shader-abi/SHADER_ABI.md`](./4d-engine/v2/shader-abi/SHADER_ABI.md).  
5. Honest FAQ: [`docs/4d-engine/v2/comms/TECHNICAL_FAQ.md`](./4d-engine/v2/comms/TECHNICAL_FAQ.md).  
6. RT4D GPU evolution **roadmap** (v2–v4): [`docs/4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md`](./4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md).  
7. Optional asset store (B2 S3-compatible, **operator-configured**): [`docs/ops/BACKBLAZE_B2_S3.md`](./ops/BACKBLAZE_B2_S3.md).

### Engine developer (Unity / Unreal)

1. PLP: [`docs/4d-engine/v1/plp/PLP_V1.md`](./4d-engine/v1/plp/PLP_V1.md).  
2. Adapter indexes: [`UNITY_ADAPTER_V1.md`](./4d-engine/v1/adapters/UNITY_ADAPTER_V1.md), [`UNREAL_ADAPTER_V1.md`](./4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md).  
3. Code: `unity/` · `unreal/FourDAdapter/` (**skeleton**).  
4. Studio steps (declared/planned): [`docs/4d-engine/v2/comms/STUDIO_INTEGRATION_GUIDE.md`](./4d-engine/v2/comms/STUDIO_INTEGRATION_GUIDE.md).  
5. Curriculum draft (pending functional Unreal): [`docs/4d-engine/v2/comms/STUDIO_ONBOARDING_CURRICULUM.md`](./4d-engine/v2/comms/STUDIO_ONBOARDING_CURRICULUM.md).  
6. v2 roadmap (RHI deep work is **roadmap**): [`docs/4d-engine/v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md`](./4d-engine/v2/roadmap/ENGINE_INTEGRATION_ROADMAP.md).

### Researcher

1. Architecture: [`docs/4d-engine/v2/FOURD_RENDERER_V2_ARCHITECTURE.md`](./4d-engine/v2/FOURD_RENDERER_V2_ARCHITECTURE.md).  
2. Substrate / math: [`docs/4drs/substrate/MATHEMATICAL_FOUNDATIONS.md`](./4drs/substrate/MATHEMATICAL_FOUNDATIONS.md).  
3. Performance **targets only**: [`docs/4d-engine/v2/performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md`](./4d-engine/v2/performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md).  
4. Paper draft (Results = targets / to be measured): [`docs/4d-engine/v2/comms/SIGGRAPH_PAPER.md`](./4d-engine/v2/comms/SIGGRAPH_PAPER.md).  
5. Claims redline before any external abstract: [`docs/4d-engine/v2/comms/CLAIMS_REDLINE.md`](./4d-engine/v2/comms/CLAIMS_REDLINE.md).  
6. Scorecard: [`docs/scorecards/fourd-renderer-v2.md`](./scorecards/fourd-renderer-v2.md).

---

## Honesty checklist (before you quote this repo externally)

- [ ] No “world’s first” / unqualified “production-ready”  
- [ ] 4–6 ms only as **design target**, not measured SLA  
- [ ] Unreal = adapter **skeleton** + RHI **roadmap**, not seamless product  
- [ ] Comms under `docs/4d-engine/v2/comms/` are **positioning drafts**, not README capability evidence  
- [ ] Prefer weaker verbs when evidence is partial: *declares*, *aligns with*, *tests*, *planned*

Canonical laws: Drive-G-1 / Drive-G-2 (see workspace ledger / charter).
