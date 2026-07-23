# Studio Onboarding Curriculum — FourDRenderer / MRS  
## 6-Week Training Outline

| Field | Value |
| --- | --- |
| Status | **Declared curriculum draft** — pending functional Unreal integration |
| Audience | Studio graphics / engine / tools teams |
| Prerequisite honesty | FourDAdapter Unreal is **skeleton**; deep RHI is **roadmap** |
| Related | [`STUDIO_INTEGRATION_GUIDE.md`](./STUDIO_INTEGRATION_GUIDE.md), [`STUDIO_PITCH.md`](./STUDIO_PITCH.md) |
| Redline | [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md) |
| Aspirational mirror | [`aspirational/STUDIO_ONBOARDING_CURRICULUM.md`](./aspirational/STUDIO_ONBOARDING_CURRICULUM.md) |

> This is a **declared curriculum draft**, not a certified academy or proof that Unreal labs run end-to-end today.  
> Lab blocks that require a working Unreal plugin are labeled **blocked / substitute**.

---

## Outcomes (by end of week 6 — aspirational when Unreal is functional)

| Outcome | Evidence today |
| --- | --- |
| Explain hybrid-first authority (renderer vs adapter) | Can teach from docs **now** |
| Run browser demo + WorldDocument validation | **Present** |
| Map PLP / Observation Modes to a shot language | **Declared** |
| Wire FourDAdapter Scene3D + lineage in Unreal | **Skeleton** — full lab **pending** |
| Measure 4–6 ms preview budget | **Not claimed** — teach as target only |

---

## Week 1 — Orientation & honest maturity

| Day focus | Activities | Materials |
| --- | --- | --- |
| Mon–Tue | Repo map; Drive-G-1 / Drive-G-2; capability table | [`docs/START_HERE_MRS_30_MIN.md`](../../../START_HERE_MRS_30_MIN.md), root README, charter |
| Wed | Run `npm run serve`; walk web demo | `examples/web-demo.html` |
| Thu | `npm run validate:world-document`; skim World Format | [`../v1/world-format/WORLD_FORMAT_V1.md`](../../v1/world-format/WORLD_FORMAT_V1.md) |
| Fri | Quiz: declared vs partial vs skeleton vs roadmap | Scorecards |

**Lab:** Browser demo + schema validate.  
**Unreal:** none required.

---

## Week 2 — Math & RT4D / MRS core

| Focus | Activities | Materials |
| --- | --- | --- |
| \(\mathbb{R}^{4}\) rays, projection intuition | Readings + whiteboard | [`docs/4drs/substrate/MATHEMATICAL_FOUNDATIONS.md`](../../../4drs/substrate/MATHEMATICAL_FOUNDATIONS.md) |
| RT4D path overview | Spec + API freeze | [`docs/4drs/SPEC-v1.0.md`](../../../4drs/SPEC-v1.0.md), [`rt4d-v1.0-freeze.md`](../../../4drs/api/rt4d-v1.0-freeze.md) |
| Hyper-Caustic Lens | Validation scene meaning | [`Hyper-Caustic-Lens.md`](../../../4drs/validation/Hyper-Caustic-Lens.md) |
| Optional | `npm run test:inspector4d` or `npm test` (note if slow) | package scripts |

**Lab:** Inspect HCL docs; run a focused test.  
**Deliverable:** One-page “what RT4D does / does not claim.”

---

## Week 3 — Engine v1 contracts (World Format, PLP, Observation)

| Focus | Activities | Materials |
| --- | --- | --- |
| WorldDocument | Schema walkthrough | Engine v1 README + schemas |
| PLP | `projectWorld` → Scene3D + lineage | [`../v1/plp/PLP_V1.md`](../../v1/plp/PLP_V1.md) |
| Observation Modes | Mode as director lens | [`../observation/OBSERVATION_MODE_RFC.md`](../observation/OBSERVATION_MODE_RFC.md) |
| Creative optional | Worldbuilding / cinematic bible | [`WORLDBUILDING_GUIDE.md`](./WORLDBUILDING_GUIDE.md) |

**Lab:** Annotate example WorldDocument with Mode + lineage fields (paper or JSON comments).  
**Checkpoint:** Team can explain why adapters are **consumers**.

---

## Week 4 — FourDRenderer v2 RFCs (architecture literacy)

| Focus | Activities | Materials |
| --- | --- | --- |
| Architecture overview | Whitepaper + architecture | [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md) |
| BVH / projection | RFC read | [`../bvh-projection/BVH_AND_PROJECTION_RFC.md`](../bvh-projection/BVH_AND_PROJECTION_RFC.md) |
| Shading / transport | SO(4) interfaces **declared** | [`../shading-transport/SHADING_AND_TRANSPORT_RFC.md`](../shading-transport/SHADING_AND_TRANSPORT_RFC.md) |
| Performance | Budget as **target only** | [`../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md`](../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md) |
| FAQ drill | Redline live | [`TECHNICAL_FAQ.md`](./TECHNICAL_FAQ.md), [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md) |

**Lab:** Redraw three-column architecture diagram; caption every box with a status tag.  
**Forbidden:** labeling roadmap boxes as “done.”

---

## Week 5 — Host adapters (Unity / Unreal) — skeleton reality

| Focus | Activities | Materials |
| --- | --- | --- |
| Adapter indexes | Unity + Unreal docs | [`../v1/adapters/`](../../v1/adapters/) |
| Code walk | `unreal/FourDAdapter/`, Unity FourDAdapter | repo trees |
| Integration guide | Declared/planned steps | [`STUDIO_INTEGRATION_GUIDE.md`](./STUDIO_INTEGRATION_GUIDE.md) |
| Inspector | Contracts + skeleton tooling | [`docs/4drs/inspector/README.md`](../../../4drs/inspector/README.md) |

**Lab (honest):**

| If Unreal plugin is functional | If still skeleton-only (**current honest default**) |
| --- | --- |
| Import projected Scene3D + lineage; verify consumer path | Code reading + mock ingest of example Scene3D JSON; document gaps |
| Debug with declared debugger RFCs where present | File issues / gap list against RFC |

> **Blocked / substitute:** Live Sequencer 4D track, Nanite W-awareness, Lumen W-GI — **roadmap**, not week-5 lab.

---

## Week 6 — Capstone, roadmap, partnership hygiene

| Focus | Activities | Materials |
| --- | --- | --- |
| Roadmap phases | Map Phase 1–6 to studio backlog | [`../roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../roadmap/ENGINE_INTEGRATION_ROADMAP.md) |
| Capstone | Team pitch with **redlined** claims | [`STUDIO_PITCH.md`](./STUDIO_PITCH.md) |
| Optional academic | Poster / paper Results language drill | [`ENGINE_ARCHITECTURE_POSTER.md`](./ENGINE_ARCHITECTURE_POSTER.md), [`SIGGRAPH_PAPER.md`](./SIGGRAPH_PAPER.md) |
| Retrospective | Update internal scorecard language | [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md) |

**Capstone deliverable:** 10-slide internal deck that would pass CLAIMS_REDLINE.  
**Success criterion:** zero “production-ready Unreal 4D” or “achieves 4–6 ms” slips.

---

## Roles in the room

| Role | Weeks to lean on |
| --- | --- |
| Artists / directors | 1, 3, worldbuilding docs |
| Graphics programmers | 2, 4 |
| Engine developers | 5, 6 |
| Producers / partners | 1, 6 + redline |

## Explicit non-claims for trainers

- Curriculum ≠ certified Unreal product training.  
- Completing six weeks ≠ measured realtime SLA.  
- Skeleton adapters ≠ seamless engine integration.

## Contact / scheduling

**TBD** — calendars aspirational until functional Unreal integration exists.
