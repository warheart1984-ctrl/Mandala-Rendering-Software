# Release Note — Anime-Structure Plate Projector (v1)

| Field | Value |
| --- | --- |
| Title | Anime-Structure Plate Projector (v1) — 4D Story Projection Lane |
| Status | Default promotion **declared** (not yet promoted) |
| Branch | `feat/anime-structure-plate-projector` |
| Commit tip | `fbc50a2` (promotion package land on follow-up branch; tip `6ea63a4`; supersedes `9cd70ef` / merged #95) |
| Related | [`docs/releases/ANIME_STRUCTURE_PROJECTOR_LANE_ANNOUNCEMENT.md`](../../releases/ANIME_STRUCTURE_PROJECTOR_LANE_ANNOUNCEMENT.md) |

## Summary

This release introduces the Anime-Structure Plate Projector, a governed 4D→3D projection lane that expresses fourth-axis structure through foreshortening and depth modulation. It is designed for expressive, narrative visualization of 4D ray-traced hits.

## Key Features

- Projector4D (SoT): \((x',y',z') = \frac{d_4}{d_4+w}(x,y,z)\)
- Multi-lane rendering: `projector4d-sot` vs `drop_w`
- Provenance schema (v1)
- Runner for comparative experiments
- Replay determinism
- Scene-rich and pole-stress experiments
- Formal contract + design note
- Promotion gate + Option C pole mitigation (**partial**)

## Verdict

- Projector4D → best for 4D story, expressive structure
- drop_w → best for literal debug, engineering clarity
- No universal winner; multi-lane philosophy preserved

## Status

- Default promotion **declared** (not yet promoted)
- Pending: pole-stress thresholds (partial wire), ink-cel projection, CI provenance validator
