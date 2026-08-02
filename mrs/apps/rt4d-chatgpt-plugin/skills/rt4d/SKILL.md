---
name: rt4d-hybrid-anime
description: Route ChatGPT / MCP through RT4D Anime Lane defensible architecture. Prefer create_rt4d_scene → render_rt4d_preview → inspect_rt4d_provenance. Modes map to product lanes. No claim without evidence.
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

Status: MCP **partial**; widget **skeleton**; RT3D persistence / 5s film / Unity·Unreal export / directory listing **declared**.

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
| `add_rt4d_powers` | Anime Scene | create (+ rotations XW/YW) → preview | RT4D **partial** |
| `animate_dimensional_transformation` | Anime Scene | create → preview | **skeleton** |
| `render_manga_panel` | Manga | create → preview | composite **declared** |
| `render_cinematic_sequence` | Film | create → preview | **declared** |

Always pass optional `continuityState` when the user cares about persistence across shots. Always surface `shotEvidence` after create/render/inspect.

### Tool intents

1. **`create_rt4d_scene`** — First for a new world. `mode`, prompt, planes, projection, `continuityState` → `sceneId` + envelope.
2. **`render_rt4d_preview`** — Engine at `RT4D_ENGINE_URL` or placeholder; updates `outputHash`.
3. **`inspect_rt4d_provenance`** — Provenance + ContinuityState + Shot Evidence Envelope.
4. **`update_rt4d_scene` / `export_rt4d_asset`** — Skeleton NotImplemented.
5. **Governance tools** (`validate_character_continuity`, `replay_anime_shot`, `compare_render_versions`, `approve_canonical_shot`) — **declared** stubs; do not fake success.

## Golden prompts

**Structure demo:** golden 4D dragon, XW + YW, `add_rt4d_powers`, preview, inspect envelope.

**Category demo (declared until built):** Dimensional Awakening — temple mage, tesseract, XW/YW sigil, replay + XW-only variant.

## Companion vs product

| Surface | Role |
| --- | --- |
| This plugin | RT4D **product** MCP |
| Genblaze Actions | Companion onboarding HTTP |
| `mrs/apps/chatgpt-mrs` | Broader MRS MCP |

Never duplicate RT4D math in MCP — call `RT4D_ENGINE_URL`.
