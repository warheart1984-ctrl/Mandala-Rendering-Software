# 03 — Implementor notes

**Trail:** `sovereign-x-vendor-router-2026-07`  
**Role:** Implementor  
**Date:** 2026-07-28  
**Cites:** `01-architect-adr.md`, `02-builder-scaffold-manifest.md`

## Intent

Fill Architect/Builder scaffolds with a machine-readable registry and thin
dispatch stubs that ALLOW upstream NVIDIA/AMD capability IDs and REJECT print
SoT IDs — without invoking vendor runtimes or touching Digital Printer SoT.

## Files created / modified

| Path | Change | Tag |
|------|--------|-----|
| `mrs/packages/sovereign-x-router/data/vendor-capability-registry.json` | Full NVIDIA+AMD registry + forbidden print IDs | **declared** |
| `mrs/packages/sovereign-x-router/src/registry.js` | JSON load + lookup | **partial** |
| `mrs/packages/sovereign-x-router/src/dispatch.js` | Allow/reject stubs | **partial** |
| `mrs/packages/sovereign-x-router/src/index.js` | Public exports | **partial** |
| `mrs/packages/sovereign-x-router/test/vendor-router.test.js` | Contract tests | **enforced** (unit) |
| `mrs/packages/sovereign-x-router/package.json` | Package meta + test script | **partial** |
| `mrs/packages/sovereign-x-router/README.md` | Honesty docs | **declared** |
| `package.json` | `test:sovereign-x-router` script | **partial** |
| `docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md` | Router section link | **declared** |
| `mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md` | Router pointer | **declared** |
| `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/*` | CECP trail | **partial** |

## Behavior

- `loadVendorCapabilityRegistry()` — reads registry JSON (stdlib only)
- `dispatchVendorCapability(id, req)`:
  - unknown / empty → REJECT
  - `forbiddenPrintCapabilityIds` → `PRINT_SOT_BANNED`
  - registered + `asPrintSoT` / `intentLane=print` → `FORBIDDEN_FOR_PRINT`
  - registered upstream → `ALLOWED_UPSTREAM` (stub message; no I/O)
  - AMD `hostCapable:false` still ALLOW with honesty note

## Tests

```bash
npm test --prefix mrs/packages/sovereign-x-router
# or: npm run test:sovereign-x-router
```

Expected: all tests PASS.

## Gaps (honest)

- Groups A–D are **declared** product goals; stubs do not call TAO/Dynamo/ROCm/FLUX
- No wiring into Genblaze HTTP or Digital Printer pipeline (by design)
- Sibling `vendor-skills-fixup-2026-07` left intact

## Conformance impact

None of the 16 constitutional conformance checks are claimed modified.
Printer provenance / CKL policies unchanged.

## Handoff to Reviewer

Verify Drive-G-1 wording, ban enforcement in tests, and no print-SoT claim inflation.
