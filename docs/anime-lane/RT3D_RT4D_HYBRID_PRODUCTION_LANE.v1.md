# RT3D × RT4D Hybrid Anime Production Lane — ADR / Contract v1

| Field | Value |
| --- | --- |
| Title | Hybrid 3D–4D Anime Production Lane (ChatGPT / MCP product surface) |
| Version | **1.0** |
| Status | **Declared / partial** — Phase 1 MCP vertical slice ships create + preview + provenance; RT3D anime scene + composite remain **declared** until Engine3D/UE wired |
| Author | Jon Halstead (warheart1984-ctrl) |
| Drive-G-1 | Do not claim ChatGPT directory listing, full RT3D character pipeline, or composite movie export as enforced. Tags below are binding. |
| SoT path | `docs/anime-lane/RT3D_RT4D_HYBRID_PRODUCTION_LANE.v1.md` |
| Architecture doctrine | [`RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md`](./RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md) — **binding** seven-layer moat, product lanes, Effect Graph, Dimensional Awakening, first milestone |
| Schemas | [`SHOT_EVIDENCE_ENVELOPE.v1.schema.json`](./SHOT_EVIDENCE_ENVELOPE.v1.schema.json) · [`CONTINUITY_STATE.v1.schema.json`](./CONTINUITY_STATE.v1.schema.json) |
| MCP app | `mrs/apps/rt4d-chatgpt-plugin/` (**partial/skeleton**) |
| Companion | Genblaze Custom GPT Actions (`mrs/apps/genblaze-media` `/.well-known/ai-plugin.json`) — **onboarding / Engine3D stills**, not this product plugin |
| Print SoT | Untouched — Printer Mode / `/printer/*` remains its own contract |

---

## 1. Product pitch (public demo narrative)

This is **not** “anime generated with AI.”

It is a genuine anime **production lane** governed by a hybrid 3D–4D architecture:

1. Artist-controlled **RT3D** anime scenes (characters, environment, animation) that stay recognizable.
2. An **RT4D dimensional pass** for motion, effects, and projection that ordinary 3D cannot express.
3. A **composite renderer** that yields image / manga panel / animation / movie-scene outputs.
4. **Governed timelines** with replay and provenance on every stage.

Clearest public demonstration of RT4D: a golden 4D dragon with XW/YW plane rotations — structure and projection evidence first, style second.

---

## 2. Pipeline (binding teaching order)

```
Anime Prompt
  → RT3D Anime Scene (characters + environment + animation)   [declared → partial]
  → RT4D Dimensional Pass (4D motion + effects + projection) [partial — Phase 1 preview]
  → Composite Renderer                                         [declared]
  → Image / Manga Panel / Animation / Movie Scene              [declared / partial]
```

Provenance fields travel with the timeline at every hop:

| Field | Role |
| --- | --- |
| `intentId` | Declared user/operator intent |
| `timelineId` | Governed animation / still timeline |
| `worldId` | World document / scene world |
| `projector` | Projection mode (e.g. `perspective`, `orthographic`, plane tags) |
| `hashes` | Content / preview SHA-256 (and related asset hashes when present) |

---

## 3. ChatGPT modes (skill routing + MCP `mode` enum)

| Mode enum | Human label | Product lane | Intent |
| --- | --- | --- | --- |
| `create_anime_character` | Create Anime Character | Portrait | RT3D character lock — **declared** until Engine3D/UE character path wired |
| `create_anime_scene` | Create Anime Scene | Anime Scene MVP | RT3D scene (chars + env) — **declared** |
| `add_rt4d_powers` | Add RT4D Powers | Anime Scene | Attach dimensional pass params (planes, projector) — **partial** in Phase 1 |
| `animate_dimensional_transformation` | Animate Dimensional Transformation | Anime Scene | Timeline of 4D transforms — **skeleton/declared** |
| `render_manga_panel` | Render Manga Panel | Manga | Panel-framed composite output — **declared** |
| `render_cinematic_sequence` | Render Cinematic Sequence | Film | Multi-frame / movie-scene — **declared** |

Phase 1 MCP tools accept `mode` (+ optional `continuityState`), stamp product lane + provenance, and emit a Shot Evidence Envelope even when the selected pass is stubbed.

---

## 4. MCP tool contract (Phase 1)

| Tool | Phase 1 status | Behavior |
| --- | --- | --- |
| `create_rt4d_scene` | **partial** | Deterministic `sceneId`, scene JSON, projection, provenance, `mode` |
| `render_rt4d_preview` | **partial** | Calls `RT4D_ENGINE_URL` (Genblaze `/api/generate` or compatible) when set; else deterministic placeholder preview + hashes |
| `inspect_rt4d_provenance` | **partial** | Returns in-memory store provenance |
| `update_rt4d_scene` | **skeleton** | Declared NotImplemented envelope |
| `export_rt4d_asset` | **skeleton** | Declared NotImplemented envelope |

**Constraint:** MCP must not re-implement RT4D math. Engine work goes through `RT4D_ENGINE_URL` (or documented stub). Existing math SoT: `mrs/packages/renderer-core/src/render/rt4d/`.

Related MCP monorepo app (`mrs/apps/chatgpt-mrs`) remains the broader MRS ChatGPT surface; **this** package is the RT4D **product plugin** vertical slice with hybrid-lane modes.

---

## 5. Companion vs product

| Surface | Role |
| --- | --- |
| **RT4D ChatGPT / MCP plugin** (`mrs/apps/rt4d-chatgpt-plugin`) | Product: hybrid production lane modes + RT4D preview + provenance |
| **Genblaze Actions / ai-plugin** | Companion onboarding tool for Engine3D stills / anime handoff HTTP |
| **Anime Lane UE / structure plates** | Downstream consumers of plates + provenance (see cross-engine contract) |
| **Print SoT** | Out of scope — do not modify Printer Mode contracts here |

---

## 6. Maturity scorecard (five dimensions, evidence-bound)

| Dimension | Rating | Evidence |
| --- | --- | --- |
| Constitutional model | aligns | Modes + provenance field set declared; no charter edits |
| Governance methodology | partial | Intent/timeline/world IDs on scenes; CKL not newly gated |
| Reference implementation | skeleton → partial | MCP create/preview/inspect; RT3D/composite declared |
| Platform engineering | skeleton | Local MCP + tunnel OK; directory submission **declared** |
| Commercial operations | declared | Public demo narrative; no ChatGPT directory claim |

---

## 7. Roadmap phases (plugin README mirrors this)

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | MCP create → preview → provenance + mode tags + skeleton viewer | **partial** (this ADR + app) |
| 2 | Wire RT3D anime scene via Engine3D | **declared** |
| 3 | Dimensional animation timelines + replay | **declared** |
| 4 | Composite → manga / cinematic exports | **declared** |
| 5 | Stable HTTPS + optional public directory submission | **declared** |

---

## 8. Related documents

- [`README.md`](./README.md) — Anime Lane index
- [`ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md`](./ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md)
- [`../4drs/api/rt4d-v1.0-freeze.md`](../4drs/api/rt4d-v1.0-freeze.md)
- Plugin: [`../../mrs/apps/rt4d-chatgpt-plugin/README.md`](../../mrs/apps/rt4d-chatgpt-plugin/README.md)
