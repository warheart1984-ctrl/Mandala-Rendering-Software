# 01 — Architect ADR

| Field | Value |
|-------|-------|
| Trail | `storyforge-4d-full-run-2026-07` |
| Stage | Architect |
| Profile | Systems Architect |
| Mode | Pipeline-Conductor (SC) |
| Date | 2026-07-28 |
| Follows | `storyforge-mrs-pipeline-v1-2026-07` (PASS_WITH_GAPS) |

## 1. Intent

Close remaining MRS-side gaps so **RenderRequest → pixels** is wired end-to-end
with a one-shot demo that produces showable PNGs (proton HQ beauty + AOVs,
scene-spec RT4D, Engine3D still). StoryForge Story→…→RenderRequest stays
**declared** (fixture intake representing SF output).

## 2. ADR decision

**Context:** Prior trail shipped validate + draft execute; HQ proton, Genblaze
HTTP smoke, and multi-PNG demo were gaps.

**Decision:**
1. Route `quality=high|final` proton through `render-proton-splat.mjs --star-demo`
   (512, depth/normal AOVs).
2. Absolute path resolve for all Node CLI args (cwd = script parent).
3. One-shot `demo_full_run.py` + `scripts/demo-storyforge-to-4d.mjs`.
4. Opt-in Genblaze `POST /api/render-request` exercised via TestClient smoke.

**Consequences:** MRS claim upgrades to **enforced** for intake→pixels demo path;
SF upstream remains **declared**.

## 3. Interface specification

| Surface | Contract |
|---------|----------|
| In | RenderRequest JSON (`schemas/RenderRequest.schema.json`) — fixtures under `fixtures/sample-render-request-cinematic-*.json` |
| Out | RenderResult + PNG artifacts + `output/cecp-full-run/evidence.json` |
| Env | `MRS_RENDER_REQUEST_EXECUTE`, `RENDER_REQUEST_API_ENABLED`, `PROTON_SPLAT_SCRIPT` |
| Ban | No StoryForge PromptComposer / IModelBackend in MRS |

## 4. Constitutional boundary

- In-scope: MRS adapters, Node render CLIs, Genblaze crossing, CECP trail
- Out-of-scope: SF Story→PromptSpec producer; protected constitution paths
- Ownership: `BOUNDARY.md` unchanged in spirit

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/adapters/storyforge-boundary/execute.py` | modify | Implementor |
| `mrs/adapters/storyforge-boundary/paths.py` | modify | Implementor |
| `mrs/adapters/storyforge-boundary/demo_full_run.py` | create | Implementor |
| `mrs/adapters/storyforge-boundary/fixtures/sample-render-request-cinematic-*.json` | create | Builder |
| `scripts/demo-storyforge-to-4d.mjs` | create | Builder |
| `schemas/RenderRequest.schema.json` quality enum | modify | Implementor |
| CECP trail 01–06 | create | Foreman |

## 6. Acceptance criteria

1. Demo exit 0; proton/beauty.png + depth + normal exist
2. Scene + Engine3D beauty PNGs exist (best-effort honest tags)
3. Genblaze `/api/render-request` smoke returns 200 when enabled
4. Unit tests pass; no SF imports in MRS adapter
5. Status tags: MRS routes **enforced**; SF upstream **declared**

## 7. Handoff to Builder

Scaffold fixtures + demo wrapper stubs; Implementor fills HQ execute + demo body.
