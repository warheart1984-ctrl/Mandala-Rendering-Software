# Devpost Blurb — Anime-Structure Plate Projector Lane

| Field | Value |
| --- | --- |
| Status | **declared** public-facing note (not a Genblaze hackathon pitch rewrite) |
| Related release | [`docs/releases/ANIME_STRUCTURE_PROJECTOR_LANE_ANNOUNCEMENT.md`](../releases/ANIME_STRUCTURE_PROJECTOR_LANE_ANNOUNCEMENT.md) |

## Title

New Rendering Lane: Anime-Structure Plate Projector

## Announcement

We’ve added a new rendering lane to the RT4D Dimensional Media Engine: the Anime-Structure Plate Projector. This lane visualizes 4D ray-traced hits with expressive foreshortening and depth cues, helping viewers understand the shape of 4D structures when projected into 3D.

Two projection modes are now available:

- **Projector4D (SoT)** — communicates the fourth dimension through scale and depth
- **drop_w** — preserves literal geometry for debugging and inspection

This feature is backed by real experiments, provenance records, replay determinism, and a formal projection contract. It’s currently in promotion review, with full ink-cel rendering tests underway.

This is a major step toward expressive, governed 4D media.
