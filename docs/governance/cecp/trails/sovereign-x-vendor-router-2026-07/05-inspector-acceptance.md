# 05 — Inspector acceptance

**Trail:** `sovereign-x-vendor-router-2026-07`  
**Role:** Inspector (+ Runtime-Sage)  
**Date:** 2026-07-28  
**InspectorVerdict:** **PASS_WITH_GAPS**

## Acceptance criteria (from Architect)

| Criterion | Evidence | Result |
|-----------|----------|--------|
| Registry has all NVIDIA + AMD IDs | `vendor-capability-registry.json` + tests | PASS |
| skillNames + upstream + forbidden_for_print + declared\|partial | registry map test | PASS |
| ALLOW upstream; REJECT print-SoT | dispatch stub tests | PASS |
| Upstream + asPrintSoT REJECTs | test case | PASS |
| Unit tests pass | `node --test …` → 10 pass / 0 fail | PASS |
| Trail 01–06 + README | this folder | PASS |
| No GPU print enforced claim | README/ADR/CONTRACT wording | PASS |

## Command evidence

```text
node --test mrs/packages/sovereign-x-router/test/vendor-router.test.js
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

## Claim ↔ evidence

| Claim | Tag | Evidence |
|-------|-----|----------|
| Capability registry exists | **declared** | JSON kind `SovereignXVendorCapabilityRegistry` |
| Dispatch allow/reject | **partial** / unit-**enforced** | `dispatch.js` + tests |
| Vendor GPU print SoT | **absent** / banned | forbidden IDs + REJECT codes |
| Multi-vendor look-dev/AI services (A–D) | **declared** | buildGroups in registry; stubs only |

## Gaps

- No live TAO/ROCm/FLUX dispatch
- Not integrated into printer HTTP path (correct per bans)

## Handoff to ESFR

Promotion consideration for **thin registration only** — PROMOTE_WITH_GAPS expected.
