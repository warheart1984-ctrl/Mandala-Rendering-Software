# 4d-renderer (compatibility shim)

Canonical package moved to `mrs/packages/renderer-core` (`@mrs/renderer-core`).

- `src/` is a directory junction → `../mrs/packages/renderer-core/src`
- Prefer imports from `@mrs/renderer-core` inside the `mrs/` workspace
- Root scripts that still use `4d-renderer/src/...` keep working via the junction

See `mrs/README.md`.
