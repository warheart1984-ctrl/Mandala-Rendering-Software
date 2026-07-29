# 01 — Architect ADR (Top 10 leverage)

**Decision:** Ship Genblaze `crop_region` + `/api/engine3d-tile-still` and wire `path_trace` to WorldDocumentRt4d consume (no HTTP 501). Add CI for Infinity Director pytest and optional IDAC live nightly.

**Out of scope:** GPU print SoT, full IDAC certification, Unity Play Mode CI.

**Protected paths:** Not modified.

Handoff: Implementor → files listed in `02-builder-scaffold-manifest.md`.
