# ESM Hygiene Rules

1. `"type": "module"` in package.json — all `.js` files are ESM.
2. Top-level `require()` is forbidden; use dynamic `import()`.
3. `__dirname` is unavailable — use `import.meta.url` + `fileURLToPath`.
4. Re-exports from `js/constitution/cse.js` must use relative paths that resolve.
5. `package.json` `files` field must include all runtime `.js` files.
