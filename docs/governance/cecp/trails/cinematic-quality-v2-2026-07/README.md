# Trail: cinematic-quality-v2-2026-07

Archive of Consent Ch1 — memorable first-10s soft-raster remaster + Genblaze SX / Lemonade probe.

| Field | Value |
|-------|-------|
| `trailId` | `cinematic-quality-v2-2026-07` |
| `overallStatus` | **partial** |
| `cognitive-profile` | Artist + Scientist |
| `mode` | Artisan + Visionary |
| `softwareCreationMode` | Render-Physicist + Constructor |
| `lineage` | `cinematic-render-quality-2026-07` · `showcase-30s` |

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
- [x] `README.md`

## Deliverable index

| Artifact | Path |
|----------|------|
| First 10s @ 24fps | `tmp/book-movie-ch1/showcase-cinematic-v2/archive-of-consent-ch1-first-10s.mp4` |
| ~30s remaster | `tmp/book-movie-ch1/showcase-cinematic-v2/archive-of-consent-ch1-showcase-30s.mp4` |
| Showcase README | `tmp/book-movie-ch1/showcase-cinematic-v2/README.md` |
| Lemonade/SX probe | `tmp/book-movie-ch1/showcase-cinematic-v2/genblaze-lemonade-probe.json` |

## Genblaze SX vs cinematic pipeline (honest)

| Layer | Role | Status on this host |
|-------|------|---------------------|
| Engine3D soft-raster cinematic-v2 | Structure camera reel | **enforced** / **partial** |
| Genblaze SX CIS | AUTH→…→SYNC governance wrapper | **enforced** (halts on lemonade fail) |
| Lemonade SD-Turbo | Optional beauty plates | **blocked** (`sd-server` won't start; model files present) |
| `SX_DEMO_MODE=1` | Simulated checkerboard | **enforced** demo only — not beauty |

Compose: when Lemonade works, plates decorate Engine3D reel; they never replace `structure_source=engine3d_raster`.
