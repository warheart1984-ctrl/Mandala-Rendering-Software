# 4d-renderer (compatibility shim)

Canonical package: `mrs/packages/renderer-core` (`@mrs/renderer-core`).

- Thin re-export modules (`index.js`, `inspector.js`, …) forward to `@mrs/renderer-core` subpaths.
- **No Windows junction required** for clones or CI. Prefer `@mrs/renderer-core` or `mrs/packages/renderer-core/src/...` imports.
- Optional legacy: `npm run link:mrs-shim` recreates a local `4d-renderer/src` junction only if you still need deep `4d-renderer/src/...` filesystem paths.

See `mrs/README.md`.
