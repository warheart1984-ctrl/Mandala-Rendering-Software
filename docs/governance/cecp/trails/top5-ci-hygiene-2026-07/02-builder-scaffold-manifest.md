# 02 — Builder scaffold manifest

**Trail:** `top5-ci-hygiene-2026-07`  
**Role:** Builder  
**softwareCreationMode:** Blueprint + Forge  
**Status:** **partial**

## Scaffold (stubs / shapes only)

1. `scripts/release-check.mjs` — read-only version matrix; exit 1 on mismatch.
2. `docs/governance/RELEASE_VERSIONING.md` — SoT table + how-to.
3. `mandala-agent-pack/docs/cursor-local-setup.md` — regenerate `.cursor` from pack.
4. Optional: `scripts/mandala-lint/run.mjs` thin wrapper → pack (if back-compat needed).
5. CECP trail files 03–06 filled by Implementor / Reviewer / Inspector / ESFR.

## Non-goals

- No product feature scaffolds.
- No charter.js mutation in Builder stage.
