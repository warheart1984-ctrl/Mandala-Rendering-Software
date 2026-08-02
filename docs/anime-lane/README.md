# Anime Lane — Cross-Engine Governed Stylization Pathway

| Field | Value |
| --- | --- |
| Status | **Declared** (lane) · scaffold **partial** · **not promoted** |
| Contract | [`ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md`](./ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md) |
| Author | Jon Halstead (warheart1984-ctrl) |

## Overview

The Anime Lane is a governed, deterministic, cross-engine rendering pathway connecting:

- Genblaze/MRS backend (`/api/anime`)
- Unreal Engine AnimeStylizer plugin
- Engine3D / RT4D structure-plate overlays
- ffmpeg export pipeline

It provides a unified anime rendering experience across still-image generation, real-time stylization, and 4D structure visualization.

> Drive-G-1: “Deterministic / full provenance / real-time” are **contract targets**. Current Genblaze handoff is **partial**; UE RDG stylize is **skeleton/partial**; UE compile is **unknown**.

## Components

| Component | Role | Maturity |
| --- | --- | --- |
| Backend: `POST /api/anime` | style-forced, governed, provenance-bearing handoff | **partial** |
| UE Plugin: AnimeStylizer | outline, cel shading, LUT grade, TAA | **skeleton/partial** |
| Structure plates | Engine3D / RT4D (`projector4d-sot` or `drop_w`) | **declared/partial** |
| Export | PNG → ffmpeg → H.264 | **partial** when ffmpeg present |

## Key Features (contract intent)

- Deterministic multi-pass stylization (**declared** at UE; offline demo plates **partial**)
- Palette-driven color grading (6 LUT presets — **partial**)
- Velocity-aware temporal AA (**skeleton** shader sketch)
- Optional 4D structure-plate blending (**skeleton** in UE)
- Blueprint API for artists (**partial** surface)
- Full provenance chain across engines (**declared** schema; Genblaze handoff **partial**)

## Contract Documents

- [`ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md`](./ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md) — **SoT**
- [`ANIME_LANE_HEALTH_SCHEMA.v1.json`](./ANIME_LANE_HEALTH_SCHEMA.v1.json)
- [`ANIME_LANE_PROMOTION_PROPOSAL.v1.md`](./ANIME_LANE_PROMOTION_PROPOSAL.v1.md)
- [`ANIME_LANE_CROSS_ENGINE_DIAGRAM.v1.txt`](./ANIME_LANE_CROSS_ENGINE_DIAGRAM.v1.txt)
- [`RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md`](./RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md) — **product doctrine** (seven-layer moat, lanes, milestone)
- [`RT3D_RT4D_HYBRID_PRODUCTION_LANE.v1.md`](./RT3D_RT4D_HYBRID_PRODUCTION_LANE.v1.md) — hybrid ADR + ChatGPT modes
- [`SHOT_EVIDENCE_ENVELOPE.v1.schema.json`](./SHOT_EVIDENCE_ENVELOPE.v1.schema.json)
- [`CONTINUITY_STATE.v1.schema.json`](./CONTINUITY_STATE.v1.schema.json)
- [`ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md`](./ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md) — cross-engine SoT
- [`ANIME_LANE_HEALTH_SCHEMA.v1.json`](./ANIME_LANE_HEALTH_SCHEMA.v1.json)
- [`ANIME_LANE_PROMOTION_PROPOSAL.v1.md`](./ANIME_LANE_PROMOTION_PROPOSAL.v1.md)
- [`ANIME_LANE_CROSS_ENGINE_DIAGRAM.v1.txt`](./ANIME_LANE_CROSS_ENGINE_DIAGRAM.v1.txt)
- MCP plugin: [`../../mrs/apps/rt4d-chatgpt-plugin/README.md`](../../mrs/apps/rt4d-chatgpt-plugin/README.md)


Related:

- Structure plate projector: [`../4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](../4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md)
- Hackathon story: [`../ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md`](../ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md)
- Capability canvas: [`../ops/CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md`](../ops/CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md)
- UE readiness: [`../../unreal/AnimeStylizer/HACKATHON_READINESS.md`](../../unreal/AnimeStylizer/HACKATHON_READINESS.md)
- Clean demo (no UE): `python scripts/hackathon-governed-anime-demo.py`

## Status

| Item | Tag |
| --- | --- |
| Lane | **declared** |
| Scaffold (files + thin API) | **partial** |
| Promotion | **not promoted** |
| Pending for promotion | ink-cel evaluation + CI provenance validator (+ see promotion proposal) |
