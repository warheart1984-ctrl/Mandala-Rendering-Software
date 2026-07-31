# 02 — Builder Scaffold Manifest

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `role` | Builder |
| `mode` | Blueprint + Schema-Artist |
| `status` | **skeleton** scaffolds landed |

## Scaffold intent

Lay JSON Schema, example profile, Genblaze validator module, and test placeholders
from Architect ADR — no cel shader logic, no CKL policy edits.

## Created / extended

| Path | Kind | Status tag |
|------|------|------------|
| `schemas/anime/AnimeWorldProfile.v1.schema.json` | JSON Schema | skeleton |
| `schemas/anime/examples/mandala-cel-v1.example.json` | Example instance | skeleton |
| `mrs/apps/genblaze-media/app/anime_world_profile.py` | Load + validate + gate_points | skeleton |
| `mrs/apps/genblaze-media/tests/test_anime_world_profile.py` | Unit tests | partial (executable) |
| `mrs/apps/genblaze-media/app/style_steer.py` | Health wire to profile fragment | partial (extends existing) |
| Trail `design/ANIME_WORLD_PROFILE.md` | Design contract | declared/skeleton |

## Explicit stubs (not filled)

- CKL policy id for anime profile — **not** created (protected path / needs auth)
- Engine3D `InkOptions` mapping from profile — left to ink-cel implementor
- `GENBLAZE_ANIME_PROFILE_PATH` settings field — declared only
- Unity/Unreal importers — declared only

## Dependency graph

```
AnimeWorldProfile.schema
        │
        ▼
mandala-cel-v1.example.json ──► anime_world_profile.validate (skeleton)
        │
        ▼
style_steer.style_health_payload ──► /health media_style.anime_world_profile
        │
        ▼ (declared future)
ink-cel InkOptions · provenance manifest · CKL opt-in
```

## Anti-overclaim

Scaffold does **not** make shot enforcement **enforced**. Validator proves
structural fields only.

## Handoff to Implementor

1. Ensure example validates; tests green
2. Wire docs (QUALITY log, ink-cel README cross-link, genblaze README entry-point)
3. Do not implement full ink-cel renderer in this trail
