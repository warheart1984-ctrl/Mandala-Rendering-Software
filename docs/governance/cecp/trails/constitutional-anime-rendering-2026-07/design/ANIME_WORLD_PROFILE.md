# AnimeWorldProfile — Design Contract

**Status:** `partial` (schema + example + Genblaze field validator — v1.0 contract)  
**Enforcement:** `declared` (no CKL deny / no render abort on profile mismatch)  
**Trail:** `constitutional-anime-rendering-2026-07`  
**Render Constitution:** `docs/governance/RENDER_CONSTITUTION_ANIME.md`  
**Lane lock:** [LANE_LOCK.md](../LANE_LOCK.md)

## Thesis

Hardware limits are design decisions. A profile encodes the lawful anime look so
studios get *same character, palette, lighting, line, and continuity* — with
provenance and (eventually) deterministic replay.

## Field summary

| Field | Purpose | Consumed by (target) |
|-------|---------|----------------------|
| `color_palette` | Named roles + hue budget | Genblaze steer (declared), ink-cel posterize |
| `shadow_steps` | Cel band boundaries/levels | ink-cel `InkOptions` |
| `outline_rules` | Line width, ink strength, thresholds | ink-cel ink AOV |
| `material_classes` | cel / flat / mist / emissive… | shading path selection (**declared**) |
| `facial_proportion_profile` | 2D-inspired face biases | polish + Amendment VII bridge (**declared**) |
| `motion_timing` | fps / easing / hold bias | sequences / replay (**declared**) |
| `background_detail_budget` | Prop count, mist, simplify | scene authoring (**declared**) |
| `lighting_constraints` | key/fill, rim, godrays budget | light setup (**declared**) |
| `continuity_invariants` | Named shot rules | inspector / CKL future |
| `provenance_requirements` | Required manifest fields | Genblaze + ProvenanceFrame |

## Relationship to Amendment VIII world profiles

| Concern | Artifact | Status |
|---------|----------|--------|
| Biogeometric / scale / material world law | Amendment VIII `loadWorldProfile` | **partial** (CKL registration) |
| Anime style continuity | `AnimeWorldProfile` | **skeleton** |
| Bridge | `bindings.amendmentViiiWorldProfile` | **declared** |

Do **not** collapse style profiles into biogeometric policy IDs without a new
amendment + tests.

## Gate points (declared enforcement path)

1. **Validate** profile JSON (skeleton — tested).
2. **Attach** `anime_world_profile_id` + `style` on shot manifests (**declared**).
3. **Apply** shadow/outline to Engine3D when `style=ink-cel` lands (**declared**).
4. **Replay** with frozen profile params (**declared**).
5. **CKL soft-check** (opt-in) against continuity_invariants (**declared**).

## Non-claims

- Not Full Photoreal
- Not Digital Printer beauty SoT
- Not Lemonade SD working on this host unless `pixelsProduced: true`
- Not Unity/Unreal enforced
