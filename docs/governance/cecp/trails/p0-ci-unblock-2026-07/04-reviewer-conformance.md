# 04 — Reviewer Conformance

**Trail:** `p0-ci-unblock-2026-07`  
**Role:** Reviewer  
**Date:** 2026-07-28  
**mode:** Scholar  
**softwareCreationMode:** Boundary-Guardian · Conformance  
**Status:** **enforced** for P0 scope

## Conformance impact

| Check | Impact |
|-------|--------|
| `ckl.policy-load` | Fixed via stubFetch `file://` path |
| Remaining 15 checks | Unchanged; still green as suite |
| GPU bloom BGL | Not a profile row; unit-tested |

## Boundary review

- Vendor ignore is correct Boundary-Guardian call: first-party packages only.
- No charter / `default.policies.json` / conformance-profile edits.
- Evidence chains in conformance adapter preserved.

## Defects found / residual

1. **Residual:** non-combine PostProcessor BGL sampleType mismatch (`unfilterable-float` + filtering) — pre-existing; not a CI P0.
2. **Noted:** `.tmp_conf_probe.mjs` (if present) still uses naive resolve — scratch probe, not CI entrypoint.
3. No overclaim of live WebGPU bloom validation.

## Verdict

**PASS** for the four P0 acceptance criteria.
