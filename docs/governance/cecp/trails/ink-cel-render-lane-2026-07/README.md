# 4D Ink/Cel Render Lane — CECP Trail

**Status:** `partial` (designed, not implemented) · **Owner:** Architect (design) →
Implementor (build) → Inspector (probe) → ESFR (ship gate)

**Product framing:** This lane is the Engine3D soft-raster *implementation slice*
of **Constitutional Anime Rendering** (product entry point). The governed style
profile (`AnimeWorldProfile`) lives in this trail:
[`ANIME_WORLD_PROFILE`](./design/ANIME_WORLD_PROFILE.md) (`shadow_steps` /
`outline_rules` → `InkOptions`; `continuity_invariants` → replay checks).

## What

A deterministic stylized render lane for the Engine3D CPU soft-raster: **banded
cel diffuse + quantized specular + ink outline AOV**, exposed as
`style: "ink-cel"` through the existing CLI and `POST /api/engine3d-still`.

## Why

Constitutional Anime Rendering treats hardware limits as design decisions; ink/cel
celebrates structure where photoreal apology fights it. Stylized shading needs
fewer samples, hides noise via banding, and is stronger on determinism (P4) — an
honest demo lane for tesseract-lattice / hypergeometric content on a CPU single
thread. Photoreal/Cycles remains an **optional** side path.

## Docs

- [01 — Architect ADR](./01-architect-adr.md)
- [INK_CEL_SPEC](./design/INK_CEL_SPEC.md) — technical design contract
- [ANIME_WORLD_PROFILE](./design/ANIME_WORLD_PROFILE.md) — governed style profile (Constitutional Anime Rendering)
- [FILE_MANIFEST](./FILE_MANIFEST.md) — implementation file list
- [ACCEPTANCE_CRITERIA](./ACCEPTANCE_CRITERIA.md) — testable gates

## Honest status

Not photoreal. The ink/cel lane is stylized output from the existing soft-raster;
photoreal remains the Cycles/ACES lane.
