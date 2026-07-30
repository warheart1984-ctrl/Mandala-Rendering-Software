# 01 — Architect ADR

| Field | Value |
|-------|-------|
| Role | Architect |
| lens | Pipeline-Conductor + Cartographer |
| Status | **declared** (verification scope; no new runtime surface) |

## Intent

Produce an evidence-bound “where we stand” picture across Engine3D soft-raster, OpenCL/CL-Gen, Cycles external-PBR, Lemonade, and photoreal Phase 2–4 artifacts — without claiming Full Photoreal.

## ADR

**Context:** Operators need openable media + honest tier tags after multiple parallel quality trails.
**Decision:** Run inventory + key pipelines/tests; write CECP trail `full-status-media-2026-07-30` with catalog + standings table; append Quality Progress Log.
**Consequences:** Gaps in Phase 3 promote/certify CLIs are recorded as **partial**/missing — not silently filled with capability fiction.

## Interface / acceptance

| Input | Output |
|-------|--------|
| Existing `tmp/book-movie-ch1/**` media | Cataloged paths + sizes |
| `npm` test scripts | Pass counts |
| `mrs:governed-render` | Fresh layout + optional Cycles beauty |
| Photoreal promote/certify | FPEC/CPCS standing or explicit break |

## Constitutional boundary

- In scope: trails under `docs/governance/cecp/`, Quality Progress Log, tmp media inventory, running existing CLIs/tests.
- Out of scope: new photoreal emitters, constitutional protected paths, Lemonade GPU install.
- Bans: no Full Photoreal / Phase 4 certified claims without CPCS `certified:true`.

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `docs/governance/cecp/trails/full-status-media-2026-07-30/**` | create | Foreman |
| `docs/4d-engine/QUALITY_PROGRESS_LOG.md` | append | Foreman |
| Runtime / constitution | none | — |
