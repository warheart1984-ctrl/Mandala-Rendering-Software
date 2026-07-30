# Renderer Conformance Suite (RCS) v1.0

| Field | Value |
|-------|-------|
| **Artifact class** | CPE-RCS-PHR |
| **Status** | Spec **declared** · Runner **partial** |
| **Module** | `conformanceSuite.js` |
| **Output** | `rcs-summary.json` |

## Purpose

Run governed evidence + promote + CPCS across a small battery of scenes/runs to assert renderer conformance. RCS does **not** invent certified scenes.

## Honesty constraints

- Existing CLIs (`mrs:emit-photoreal-evidence`, `mrs:photoreal-promote`) take `--out-dir`, not `--scene`.
- Prefer **1–2 real run directories** (e.g. blender-10s / tesseract plate) over four fabricated certified scenes.
- Declared multi-scene stubs (`hdr-room`, `topology-stress`, `gi-corridor`) report **PARTIAL** / not certified until wired to real governed runs.
- Suite conformance is `FULL_CONFORMANCE` only when every included scene has `cpcs.certified === true`.

## Default scene map (partial)

| Scene id | Source | Status |
|----------|--------|--------|
| `blender-10s-plate` | `tmp/blender-10s-test/governed-render/<id>` | real run when present |
| `tesseract-stub` | optional second run dir or stub | PARTIAL if absent |
| `hdr-room` / `topology-stress` / `gi-corridor` | declared stubs | PARTIAL (not wired) |

## CLI

```bash
npm run mrs:photoreal-rcs -- --base-dir tmp/rcs-runs --run-dir tmp/blender-10s-test/governed-render/587f836fc789a003
```
