# 03 — Implementor Notes

**Trail:** `engine-governance-audit-2026-07`  
**Date:** 2026-07-29  
**Status:** **enforced** (targeted fixes + tests green)

## Files touched

| Path | Change |
|------|--------|
| `engine/governance/ConstitutionalKnowledgeLayer.js` | `loadDefault` `policiesBaseUrl`; base URL normalize; `evalModifier` + `self` in modify_param |
| `engine/governance/test/ckl.test.js` | loadDefault tests; evalModifier behavior tests |
| `engine/world/GovernedWorldLoader.cs` | ParseConfig failure → `Debug.LogWarning` |
| `docs/governance/cecp/trails/engine-governance-audit-2026-07/*` | Trail + inventory |

**Not changed:** `engine/constitution/charter.js` (organ statuses already `enforced`; evidence supports retention).

## Tests

| Command | Result |
|---------|--------|
| `node --test engine/governance/test/*.test.js` | **170 pass** (was 166; +4 CKL tests) |
| `npm run test:conformance` | **16/16 COMPLIANT** |

## Organ status (JS charter organs)

| Organ | Before | After | Rationale |
|-------|--------|-------|-----------|
| `ckl` | `enforced` | `enforced` | CKL tests + conformance ckl.* checks |
| `governanceKernel` | `enforced` | `enforced` | GK + integration tests |

## Remaining gaps

- C# CKL / GK parity not equivalent to JS (**partial**).
- M1 structured governance logging — no governance `console.warn` to replace.
- M4 C++ Contracts — not located in repository.
