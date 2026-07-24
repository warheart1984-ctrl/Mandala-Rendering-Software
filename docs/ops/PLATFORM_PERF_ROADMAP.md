# Platform performance & host loaders — roadmap (planned)

> **Status:** planned recommendations only (Drive-G-1). Nothing here is claimed as implemented, enforced, or complete.

## TypeScript / Wasm for heavy math (planned)

- Evaluate moving hot 4D math / BVH paths behind a TypeScript API with optional Wasm kernels.
- Keep JS reference implementations as the conformance baseline until Wasm results match existing tests.
- Prefer incremental extraction (one module at a time) over a big-bang rewrite.

## node-canvas / native bottlenecks & Docker CI (planned)

- Document CI images that preinstall `node-canvas` native deps (Cairo, Pango, etc.) to reduce flaky local/CI installs.
- Prefer headless pure-JS or Wasm smoke paths in default CI where full canvas is not required.
- Treat native canvas as an optional capability gate, not a hard dependency of every package test.

## Unity / Unreal `.mesh.json` loaders (planned)

- Expand host-side loaders for `.mesh.json` beyond current skeleton adapters.
- Align loader contracts with `docs/4d-engine/v1/world-format/` and existing Unity/Unreal adapter RFCs.
- Ship fixture meshes + golden load checks before claiming host parity.

## Out of scope for this note

Repo hygiene (`.gitignore` for `node_modules/`, `output/`, `dist/`, `.venv/`, caches) is handled separately and is not covered by the items above.
