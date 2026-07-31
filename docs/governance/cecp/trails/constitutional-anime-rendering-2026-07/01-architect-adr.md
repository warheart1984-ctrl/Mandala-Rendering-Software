# 01 — Architect ADR — Constitutional Anime Rendering

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `role` | Architect |
| `mode` | sage |
| `lens` | Visionary + Schema-Artist |
| `softwareCreationMode` | Pipeline-Conductor |
| `cognitive-profile` | Strategist |
| `overallStatus` | **partial** / **skeleton** / **declared** (layered; see Anti-overclaim) |
| `started` | 2026-07-31 |

## Intent

Capture user-affirmed product direction: **Constitutional Anime Rendering** as the
MRS entry point. Scaffold an `AnimeWorldProfile` contract so every shot *can* be
checked against governed stylization (palette, shadow steps, outline, materials,
face proportions, motion timing, background budget, lighting, continuity,
provenance) — with honest status tags until enforcement is tested.

**Why:** Photoreal apology framing fights the soft-raster + AMD host reality.
Studios already buy style continuity. 4D geometry remains the differentiator for
portals, spirits, and impossible architecture — under anime-governed beauty.

## Scope

### In
- CECP trail + ADR + binding map
- `AnimeWorldProfile` JSON Schema + example
- Thin Genblaze validator + health fragment (extends `style_steer`, no third style system)
- Cross-links to ink-cel, Amendment VII/VIII, provenance/replay (declared paths)
- QUALITY_PROGRESS_LOG entry-point framing

### Out
- Full cel renderer rewrite / WGSL toon shaders this pass
- Constitutional SoT edits (`constitution/`, `engine/constitution/`, `AGENTS.md`, policies)
- Claiming CKL deny on anime profile violation
- Deleting or demoting Cycles/photoreal path
- Unity/Unreal host implementation
- Lemonade SD unblock (document hold only)

## ADR decision

**Context:** Inventory shows (1) Genblaze `style=anime` **partial** prompt steer,
(2) ink-cel Engine3D lane **partial** design not implemented, (3) Amendment VIII
world profiles for biogeometric/scale law — not anime style, (4) photoreal evidence
stack optional and incomplete. User locked anime as entry point.

**Decision:** Introduce `AnimeWorldProfile` as a **style-governance profile** that
*composes with* (does not replace) Amendment VIII world profiles. Bind declared
gate points: Genblaze style → Engine3D ink-cel params → provenance manifest fields
→ replay determinism → future CKL soft check. Implement only schema + example +
field validator + health documentation this cycle.

**Consequences:**
- Product messaging shifts to governed stylization (QUALITY log + trail README)
- Ink-cel becomes the Engine3D *implementation slice* of this entry point
- Photoreal remains optional side path
- Enforcement stays **declared** until CKL/tests land

**Alternatives rejected:**
1. Treat anime as temporary hackathon gimmick until Full Photoreal — rejects user mission lock
2. Fork a third style system outside Genblaze/ink-cel — sprawl
3. Encode anime rules into `default.policies.json` now — unauthorized constitutional scope
4. Claim ink-cel implemented — design-only evidence

## Contracts

### AnimeWorldProfile (v1)

Schema: `schemas/anime/AnimeWorldProfile.v1.schema.json`  
Example: `schemas/anime/examples/mandala-cel-v1.example.json`

Required fields: `color_palette`, `shadow_steps`, `outline_rules`,
`material_classes`, `facial_proportion_profile`, `motion_timing`,
`background_detail_budget`, `lighting_constraints`, `continuity_invariants`,
`provenance_requirements` (+ `profileId`, `schemaVersion`, `status`).

### Binding map (status-tagged)

| Surface | Binding | Status |
|---------|---------|--------|
| Genblaze `style=anime` / `GENBLAZE_STYLE` | Prompt + polish steer; health exposes profile fragment | **partial** |
| Engine3D `style=ink-cel` | Maps `shadow_steps` / `outline_rules` → ink-cel InkOptions | **declared** (design in ink-cel trail; not wired) |
| Provenance / Genblaze manifest | `style`, `anime_world_profile_id`, optional `ink_sha256` | **declared** |
| ReplayService | Restore profile params for byte-stable beauty | **declared** |
| CKL / Amendment VIII | Bridge style profile ≠ biogeometric world law; no deny yet | **declared** |
| Amendment VII face soft gates | `facial_proportion_profile.amendmentViiSoftGates` | **declared** |
| Unity / Unreal | Consume profile JSON as host contract | **declared** / skeleton |
| RT4D | Structure SoT for 4D motifs; not anime beauty SoT | **partial** (structure) |
| Digital Printer | Anime NIM stills ≠ print beauty SoT | invariant retained |
| Photoreal Cycles | Optional | unchanged |

### Env / API
- `GENBLAZE_STYLE=anime` · API `"style":"anime"` (existing)
- Future: `GENBLAZE_ANIME_PROFILE_PATH` (**declared**, not required this pass)

### Bans
- No constitutional protected-path edits
- No “enforced” anime shot gate claims without tests
- No Full Photoreal / Digital Printer SoT claims for anime diffusion
- No secrets

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/governance/cecp/trails/constitutional-anime-rendering-2026-07/*` | create | Architect/Builder/crew |
| `schemas/anime/AnimeWorldProfile.v1.schema.json` | create | Builder |
| `schemas/anime/examples/mandala-cel-v1.example.json` | create | Builder |
| `mrs/apps/genblaze-media/app/anime_world_profile.py` | create | Builder/Implementor |
| `mrs/apps/genblaze-media/tests/test_anime_world_profile.py` | create | Implementor |
| `mrs/apps/genblaze-media/app/style_steer.py` | extend health | Implementor |
| `docs/4d-engine/QUALITY_PROGRESS_LOG.md` | entry-point note | Implementor |
| `docs/governance/cecp/trails/ink-cel-render-lane-2026-07/README.md` | cross-link | Implementor |
| `mrs/apps/genblaze-media/README.md` | entry-point row | Implementor |

## Acceptance criteria

- [ ] Schema + example present; example passes hand validator
- [ ] `pytest` anime profile + style_steer tests pass
- [ ] Health payload includes `entry_point` + `anime_world_profile` with enforcement **declared**
- [ ] Trail stages 01–06 written with evidence-bound tags
- [ ] Non-claims listed (photoreal, printer SoT, CKL, Lemonade hold)
- [ ] No protected constitutional files modified

## Anti-overclaim

| Claim layer | Tag | Evidence |
|-------------|-----|----------|
| Anime diffusion look lane | **partial** | `style_steer.py` + tests |
| AnimeWorldProfile schema/validator | **skeleton** | schema + example + unit tests |
| Shot checked against profile (CKL/runtime) | **declared** | gate_points docs only |
| Engine3D ink-cel pixels | **partial** (design) | ink-cel trail; not implemented |
| Full Photoreal / CPCS | not claimed | optional side path |
| CHEA / CCR / CDGF | **declared** | no new registries |

## Sage counsel

1. Prove profile validation + Genblaze health first (this pass).
2. Next implementor: map example `shadow_steps`/`outline_rules` into ink-cel `InkOptions` when that lane is built — single profile SoT.
3. Do not merge AnimeWorldProfile into Amendment VIII policy IDs without a dedicated amendment + tests.
4. Keep photoreal path; market anime as entry, photoreal as promote ladder.

## Cross-reference ledger

| CECP / trail | Relevance |
|--------------|-----------|
| `ink-cel-render-lane-2026-07` | Soft-raster cel/ink implementation slice |
| `world-engine-probe-2026-07` | Amendment VII/VIII patterns; do not overclaim world engine |
| `cinematic-quality-v2-2026-07` | Soft-raster cinematic grade (complementary, not anime SoT) |
| `photoreal-evidence-pep-spr-2026-07` | Optional photoreal evidence — side path |
| `digital-printer-v3-2026-07` | Printer SoT boundary — anime GenAI ≠ beauty SoT |

## Risks to sovereignty / determinism

- Diffusion anime is non-deterministic across providers — provenance must label assist vs SoT
- Profile supersession without `supersedes` lineage could break continuity claims
- Silent CKL deny without opt-in would violate authority contracts — keep opt-in **declared** until designed

## Handoff order

1. Builder → schema, example, module stub, trail 02
2. Implementor → validator tests, style_steer health wire, docs
3. Reviewer → conformance + Drive-G-1 claim audit
4. Inspector → acceptance against criteria
5. ESFR → promotion eligibility (expect PROMOTE_WITH_GAPS)
