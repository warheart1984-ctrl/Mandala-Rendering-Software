---
name: rt4d-hybrid-anime
description: Route ChatGPT / MCP through RT4D Anime Lane defensible architecture. Prefer create_rt4d_scene → render_rt4d_preview → update_rt4d_scene (viewer) → inspect_rt4d_provenance. Modes map to product lanes. No claim without evidence.
---

# RT4D Anime Lane — Skill

## Architecture SoT

Read and honor:

- `docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md` — seven-layer moat, pipeline, lanes, Effect Graph, Dimensional Awakening, first milestone
- `docs/anime-lane/RT3D_RT4D_HYBRID_PRODUCTION_LANE.v1.md` — hybrid ADR
- Schemas: `SHOT_EVIDENCE_ENVELOPE.v1.schema.json`, `CONTINUITY_STATE.v1.schema.json`

## Pitch (always honest)

Not “anime generated with AI.” Governed production engine: stable RT3D characters + mathematically real RT4D transforms + direction + continuity + provenance/replay.

**Constitutional gate:** No claim may exceed its evidence.

| Claim type | Required evidence |
| --- | --- |
| Completed render | Artifact / preview hash |
| 4D effect | Transformation / rotation / projection parameters |
| Continuity | ContinuityState compare (tool still **declared**) |
| Deterministic | Replay verification (**declared**) |
| Export | File validation (**declared**) |
| Approved scene | Recorded decision (**declared**) |

Status: MCP **partial**; widget **partial** (dimensional preview); ChatGPT embedded UI host-dependent (**not** directory-ready); RT3D persistence / 5s film / Unity·Unreal export / AnimeStylizer **declared**.

## Canonical pipeline

```
User Intent → Director → State Resolver → RT3D Assembly → RT4D Effect Graph
  → Timeline → Continuity Gate → Renderer Router → Composite → Evidence/Replay
  → Image / Manga / Animation / Film / Game Asset
```

## Modes → product lanes → tools

| Mode | Lane | Tools | Maturity |
| --- | --- | --- | --- |
| `create_anime_character` | Portrait | `create_rt4d_scene` | RT3D **declared** |
| `create_anime_scene` | Anime Scene MVP | create → `render_rt4d_preview` | RT3D **declared** |
| `add_rt4d_powers` | Anime Scene | create (+ rotations XW/YW) → preview → viewer update | RT4D **partial** |
| `animate_dimensional_transformation` | Anime Scene | create → preview + play loop in viewer | **partial** (viewer loop only) |
| `render_manga_panel` | Manga | create → preview | composite **declared** |
| `render_cinematic_sequence` | Film | create → preview | **declared** |

Always pass optional `continuityState` when the user cares about persistence across shots. Always surface `shotEvidence` after create/render/inspect.

### Tool intents

1. **`create_rt4d_scene`** — First for a new world. `mode`, prompt, planes, projection, `continuityState` → `sceneId` + envelope. Opens `ui://rt4d/viewer-v1` when host supports MCP Apps.
2. **`render_rt4d_preview`** — Engine at `RT4D_ENGINE_URL` or placeholder; updates `outputHash`. Prefer engine when configured.
3. **`update_rt4d_scene`** — Phase 2 **partial**: XW/YW/ZW speeds + projection distance; optional `rePreview`. Widget debounces control changes into this tool.
4. **`inspect_rt4d_provenance`** — Provenance + ContinuityState + Shot Evidence Envelope (sceneId, hashes, projector, continuityVersion).
5. **`export_rt4d_asset`** — Skeleton NotImplemented (Phase 3 gap).
6. **Governance tools** — **declared** stubs; do not fake success.

### Viewer honesty

- UI resource: `ui://rt4d/viewer-v1`
- Three.js projected tesseract = **dimensional preview**, not AnimeStylizer / photoreal
- Build: `widget/` → `npm run build` → `assets/rt4d-viewer.html`
- Test: MCP Inspector tools/resource; ChatGPT Dev Mode for tools; embedded UI is host-dependent

## Golden prompts

**Structure demo:** golden 4D dragon, XW + YW, `add_rt4d_powers`, preview, adjust ZW in viewer, inspect envelope.

**Category demo (declared until built):** Dimensional Awakening — temple mage, tesseract, XW/YW sigil, replay + XW-only variant.

## Companion vs product

| Surface | Role |
| --- | --- |
| This plugin | RT4D **product** MCP + interactive viewer |
| Genblaze Actions | Companion onboarding HTTP |
| `mrs/apps/chatgpt-mrs` | Broader MRS MCP |

Never duplicate RT4D math in MCP — call `RT4D_ENGINE_URL`.
