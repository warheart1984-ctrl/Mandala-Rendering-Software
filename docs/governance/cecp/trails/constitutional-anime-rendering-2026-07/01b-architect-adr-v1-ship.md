# 01b — Architect ADR Amendment — AnimeWorldProfile v1.0 + Pipeline Ship

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `role` | Architect |
| `mode` | sage |
| `lens` | Pipeline-Conductor + Schema-Artist + Sentinel |
| `actorMode` | Anchor |
| `softwareCreationMode` | Constructor + Protocol |
| `amendmentOf` | `01-architect-adr.md` |
| `started` | 2026-07-31 |

## Intent

Harden Constitutional Anime from skeleton profile → **v1.0 contract**, lock
structure/beauty lanes, formalize Scene+Profile → structure → polish →
continuity pipeline, ship first governed demo under
`tmp/constitutional-anime-render-v1/`.

User quote (presentation SoT):

> “The first Constitutional Anime Render: governed style, deterministic replay, 4D geometry.”
> “I want a real anime renderer”

## Scope

### In
- Render Constitution (product-layer; does not edit Charter SoT)
- Lane lock doc + path_kind honesty
- AnimeWorldProfile v1.0 hardened validation + example status bump to **partial**
- One CLI: `python -m app.constitutional_anime_render` (+ root npm alias)
- Painter probe with fail-closed structure-only
- Demo folder + provenance report + visual critique
- Inspector tests for validation, structure-only labeling, stages
- Trail stages 02–06 refresh for this ship cycle

### Out
- Charter / `engine/constitution/*` / `AGENTS.md` / `default.policies.json` edits
- Claiming Full Photoreal or Digital Printer SoT
- Guaranteeing FLUX/Lemonade online without probe evidence
- Forking a third style system outside Genblaze + Engine3D

## Contracts

### Pipeline stages

```
Input:  Scene plan + AnimeWorldProfile v1.0
Stage1: Engine3D|RT4D → structure plate + provenance  [structure]
Stage2: Anime painter (fal|lemonade|nvidia|cel-proxy) → cel image  [beauty]
Stage3: Continuity + replay check → evidence log
Assert: profile vX.Y · structure source · polish backend|structure-only · hash H
```

### Env vars (fail closed — never commit secrets)

| Var | Role |
|-----|------|
| `FAL_KEY` / `FAL_API_KEY` / `SEEDANCE_API_KEY` | fal img2img polish |
| `NVIDIA_API_KEY` | optional NIM probe |
| `GENBLAZE_POLISH_ENABLED=1` | enable polish path |
| `LEMONADE_BASE_URL` | default `http://127.0.0.1:13305/api/v1` |
| `GENBLAZE_ANIME_PROFILE_PATH` | optional profile override |

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/governance/RENDER_CONSTITUTION_ANIME.md` | create | Architect |
| `docs/governance/cecp/trails/.../LANE_LOCK.md` | create | Architect |
| `schemas/anime/AnimeWorldProfile.v1.schema.json` | harden | Builder |
| `schemas/anime/examples/mandala-cel-v1.example.json` | status→partial | Builder |
| `mrs/apps/genblaze-media/app/constitutional_anime_render.py` | create CLI | Implementor |
| `mrs/apps/genblaze-media/tests/test_constitutional_anime_render.py` | create | Implementor |
| `tmp/constitutional-anime-render-v1/` | demo out (gitignored) | Implementor |
| Trail 02–06 | refresh | crew |

## Acceptance tests

- [ ] Example profile validates; status `partial`; schemaVersion `1.0.0`
- [ ] CLI dry-run / structure-only path labels `anime_claim: false`
- [ ] Successful cel-proxy or diffusion sets honest `polish_backend`
- [ ] Demo README presents the product quote
- [ ] Dual-run or structure hash recorded in provenance report
- [ ] No protected constitutional files modified
- [ ] Reviewer/ESFR: PROMOTE_WITH_GAPS expected if painter blocked

## Anti-overclaim

| Layer | Tag |
|-------|-----|
| Profile contract v1.0 | **partial** |
| Render Constitution | **partial** (docs) / CKL **declared** |
| Structure lane | **partial**–**enforced** (dual-run where applicable) |
| Beauty lane | **partial** when pixels; else **blocked** |
| Full anime studio pipeline | **partial** entry point — not complete |

## Handoff

1. Builder → scaffold CLI stubs + schema harden
2. Implementor → fill CLI, tests, demo
3. Reviewer → Drive-G-1 / AGENTS audit
4. Inspector → pytest + visual plate read
5. ESFR → PromotionEligibility
