# 02 — Builder scaffold manifest

**Trail:** `sovereign-x-vendor-router-2026-07`  
**Role:** Builder (+ Protocol)  
**Date:** 2026-07-28  
**Cites:** `01-architect-adr.md`

## 1. Intent

Create package layout and trail structure for Sovereign X vendor capability
registration without deep vendor runtime logic.

## 2. Scaffold manifest

| Path | Kind | Tag |
|------|------|-----|
| `mrs/packages/sovereign-x-router/package.json` | package meta | **skeleton**→**partial** |
| `mrs/packages/sovereign-x-router/data/vendor-capability-registry.json` | registry SoT | **declared** |
| `mrs/packages/sovereign-x-router/src/registry.js` | loader | **skeleton**→**partial** |
| `mrs/packages/sovereign-x-router/src/dispatch.js` | dispatch stubs | **skeleton**→**partial** |
| `mrs/packages/sovereign-x-router/src/index.js` | barrel | **skeleton**→**partial** |
| `mrs/packages/sovereign-x-router/test/vendor-router.test.js` | tests | **skeleton**→**partial** |
| `mrs/packages/sovereign-x-router/README.md` | package docs | **declared** |
| `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/` | CECP trail | **declared**→**partial** |

## 3. Dependency graph

```text
@mrs/sovereign-x-router
  └── (none — Node stdlib only)
        └── Digital Printer CONTRACT (doc link only; no import)
        └── vendor-skills-install-note (doc link only)
        └── sibling vendor-skills-fixup trail (coordinate; no overwrite)
```

## 4. Build artifacts inventory

- Registry JSON: **declared** machine-readable mapping
- Dispatch: **partial** structured allow/reject (no I/O)
- Groups A–D (look-dev / SceneSpec / parity / AI): **declared** product goals;
  stubs do not implement full services

## 5. Test placeholders

`test/vendor-router.test.js` — registry shape, ALLOW upstream, REJECT print SoT,
REJECT asPrintSoT, unknown ID, AMD hostCapable=false allow stub.

## 6. Handoff to Implementor

Fill registry rows from Architect ID tables; implement load + dispatch; run
`npm test --prefix mrs/packages/sovereign-x-router`; update CONTRACT + skills
note with pointers; write `03-implementor-notes.md`.
