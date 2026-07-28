# Module Boundary Rules

1. `engine/` is constitutional SoT — never import from `mrs/` into `engine/`.
2. `mrs/packages/renderer-core/src/gpu/` is GPU assist — never a print authority.
3. ESM modules must use `import`/`export` — no `require()` at top level.
4. Dynamic `import()` on Windows paths must use `pathToFileURL()`.
5. Browser modules must not import `node:fs` at top level — use lazy dynamic import.
