# 01 — Architect ADR

| Field | Value |
|-------|-------|
| Role | Architect |
| lens | Pipeline-Conductor |
| status | **partial** (smoke acceptance, not production photoreal ADR) |

## 1. Intent

Verify Blender 5.2 Cycles can produce a real beauty PNG from a governed GLB within a **~10s** wall-clock budget (low samples/resolution), and that `mrs:governed-render --beauty external-pbr` still completes with honest trail fields.

## 2. ADR

**Context:** Prior same-day Cycles Held proof used larger defaults; user requested a short crew cycle.

**Decision:** Reuse `tmp/glb-repro/scene.glb`; drive Cycles via `render-glb-cycles.py` at 64²/8 and 128²/16; run governed-render at 64² with `PHOTOREAL_CYCLES_SAMPLES=8` + `BLENDER_PATH`.

**Consequences:** Smoke proves path; does not certify film-quality photoreal.

## 3. Interface

| Input | Source |
|-------|--------|
| Blender | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |
| GLB | `tmp/glb-repro/scene.glb` |
| Script | `mrs/packages/renderer-core/scripts/render-glb-cycles.py` |
| Governed CLI | `node scripts/governed-render.mjs` / `npm run mrs:governed-render` |

## 4. Boundary

- In scope: Cycles smoke timing + CECP trail + Quality Progress Log
- Out of scope: GPU backend install, Lemonade, second GLB consumer, constitutional policy edits

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `tmp/blender-10s-test/*` | create (artifacts) | Implementor |
| `docs/governance/cecp/trails/blender-10s-cycles-2026-07-30/` | create | Foreman |
| `docs/4d-engine/QUALITY_PROGRESS_LOG.md` | append entry | Foreman |

## 6. Acceptance

1. Cycles writes a PNG from the Held GLB.
2. At least one run finishes near ~10s wall (allow 64²/few samples).
3. Governed-render reports `cyclesStatus: complete` and `pixelsProduced: true` for beauty.
4. Claims stay Drive-G-1 honest (**partial** / Held for export).
