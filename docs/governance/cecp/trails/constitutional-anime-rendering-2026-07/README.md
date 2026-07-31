# Constitutional Anime Rendering — CECP Trail

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `feature` | Product entry-point: governed anime / cel stylization |
| `started` | 2026-07-31 |
| `overallStatus` | **partial** (v1.0 profile + pipeline + cel-proxy demo); beauty diffusion **blocked** on host |
| `mode` | Sage + Visionary + Sentinel |
| `softwareCreationMode` | Schema-Artist + Pipeline-Conductor + Constructor |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** (`06b`) |
| `lineage` | Architecture → Build → Implementation → Review → Inspection → ESFR |

## Mission lock (entry-point thesis)

> The first Constitutional Anime Render: governed style, deterministic replay, 4D geometry.
> I want a real anime renderer

**Constitutional Anime Rendering** is the correct product entry point — not a
photorealism apology. Hardware limits become design decisions; the engine
deliberately produces **governed stylization**.

## Stage files

### Cycle A (scaffold)

| Stage | File | Status |
|-------|------|--------|
| 01 Architect | [01-architect-adr.md](./01-architect-adr.md) | complete |
| 02 Builder | [02-builder-scaffold-manifest.md](./02-builder-scaffold-manifest.md) | complete |
| 03 Implementor | [03-implementor-notes.md](./03-implementor-notes.md) | complete (thin scaffold) |
| 04 Reviewer | [04-reviewer-conformance.md](./04-reviewer-conformance.md) | complete |
| 05 Inspector | [05-inspector-acceptance.md](./05-inspector-acceptance.md) | complete |
| 06 ESFR | [06-engineer-standards.md](./06-engineer-standards.md) | PASS_WITH_GAPS |

### Cycle B (v1.0 ship — this crew)

| Stage | File | Status |
|-------|------|--------|
| 01b Architect | [01b-architect-adr-v1-ship.md](./01b-architect-adr-v1-ship.md) | complete |
| 02b Builder | [02b-builder-scaffold-v1-ship.md](./02b-builder-scaffold-v1-ship.md) | complete |
| 03b Implementor | [03b-implementor-notes-v1-ship.md](./03b-implementor-notes-v1-ship.md) | complete |
| 04b Reviewer | [04b-reviewer-conformance-v1-ship.md](./04b-reviewer-conformance-v1-ship.md) | PASS_WITH_GAPS |
| 05b Inspector | [05b-inspector-acceptance-v1-ship.md](./05b-inspector-acceptance-v1-ship.md) | PASS_WITH_GAPS |
| 06b ESFR | [06b-engineer-standards-v1-ship.md](./06b-engineer-standards-v1-ship.md) | **PROMOTE_WITH_GAPS** |

## Design + schema + constitution

- [design/ANIME_WORLD_PROFILE.md](./design/ANIME_WORLD_PROFILE.md) — field contract (**partial**)
- [LANE_LOCK.md](./LANE_LOCK.md) — structure vs beauty
- Render Constitution: `docs/governance/RENDER_CONSTITUTION_ANIME.md`
- Schema: `schemas/anime/AnimeWorldProfile.v1.schema.json` (**partial** v1.0)
- Example: `schemas/anime/examples/mandala-cel-v1.example.json`
- Validator + CLI: `mrs/apps/genblaze-media/app/anime_world_profile.py`, `constitutional_anime_render.py`

## Pipeline CLI

```bash
# From repo root
npm run render:constitutional-anime

# Or
cd mrs/apps/genblaze-media
python -m app.constitutional_anime_render --out-dir ../../../tmp/constitutional-anime-render-v1 --painter auto
python -m app.constitutional_anime_render --probe-only
```

Demo out: `tmp/constitutional-anime-render-v1/` (gitignored plates; README presents quotes).

## Continuity 5-shot (structure backbone)

- Spec: [CONTINUITY_5SHOT.md](./CONTINUITY_5SHOT.md)
- Runner: `mrs/packages/engine3d-core/scripts/run-anime-continuity-5shot.mjs`
- Dual-run beauty sha256: **enforced**

## Related trails

| Trail / module | Role | Status |
|----------------|------|--------|
| `dimensional-compression-2026-07` | Arena → Invariants → Execution formalization for this product | **declared** methodology · [doctrine](../../../DIMENSIONAL_COMPRESSION.md) · [applied worksheet](../dimensional-compression-2026-07/APPLIED_EXERCISE.md) |
| `ink-cel-render-lane-2026-07` | Engine3D soft-raster cel + ink AOV | **partial** (design) |
| Genblaze `style_steer.py` | Diffusion/polish anime prompt steer | **partial** |
| Photoreal / Cycles | Optional side path | optional |

## Honest non-claims

- Not Full Photoreal
- Not Digital Printer beauty SoT
- Not CKL-enforced shot gate (**declared**)
- Lemonade SD / `sd-server` blocked when model_load_error (this host evidence)
- fal / NVIDIA require keys — fail closed
- Unity / Unreal host consumption **declared** / skeleton
