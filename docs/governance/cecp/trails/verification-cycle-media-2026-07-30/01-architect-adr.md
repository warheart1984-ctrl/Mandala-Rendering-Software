# 01 — Architect ADR

| Field | Value |
|-------|-------|
| Role | Architect + Pipeline-Conductor |
| Date | 2026-07-30 |
| Intent | Re-verify media production paths and publish an honest image/video catalog |

## Intent

Confirm CCC-ImageGen non-blocking fallback, SX legacy-efficient still cascade, Engine3D Amendment VII cinematic still/clip, and inventory prior showcases — without claiming photoreal or Lemonade beauty when pixels are absent.

## ADR

**Context:** Prior trails shipped Engine3D cinematic-v2 film and CCC provider architecture; Lemonade SD remained host-blocked. User requested a full crew verification with a clear artifact catalog.

**Decision:** Run live probes + produce/refresh one still + one short MP4 under `tmp/book-movie-ch1/verification-cycle-2026-07-30/`; treat existing `showcase-cinematic-v2` 10s/30s as the primary film package; write CECP trail `verification-cycle-media-2026-07-30`.

**Consequences:** Catalog separates soft-raster / opencl-probe / checkerboard / deferred. No charter edits.

## Interface

| Input | Output |
|-------|--------|
| `npm run sx:image-gen-probe` (+ `--force-gpu-down`, `--try-generate`) | `provider-probe.json` |
| `npm run sx:legacy-efficient -- --still --provider auto` | OpenCL PNG + proof JSON |
| `render_ch1_cinematic.mjs --cinematic-v2 --amendment-vii` | still PNG + optional MP4 |

## Boundaries

- In-scope: probes, stills, short clips, CECP trail, catalog
- Out-of-scope: charter / policies / AGENTS.md; fake Lemonade PNGs; photoreal claims

## Acceptance

1. Probes show `blockedOnGpu: false` when GPU forced down  
2. At least one Engine3D still + one MP4 exist for this cycle  
3. Showcase dirs inventory confirmed on disk  
4. Catalog labels Lemonade as deferred when no pixels  

## Handoff

Builder: no new scaffolds — reuse existing CLI surfaces; cycle output dir only.
