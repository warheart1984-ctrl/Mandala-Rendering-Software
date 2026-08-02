# 04 — Reviewer conformance — RT4D Priority #5 Hosted MCP

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `role` | Reviewer |
| `softwareCreationMode` | Boundary-Guardian + Conformance |
| `status` | **partial** |

## Protected paths

| Path | Touched? |
|------|----------|
| `constitution/`, `engine/constitution/`, policies, `AGENTS.md`, `CITATION.cff`, `.zenodo.json`, `schemas/` | **No** |
| `mrs/packages/renderer-core/**` | **No** |

## Claim ↔ evidence

| Claim | Evidence | Tag OK? |
|-------|----------|---------|
| CDK synth green | `npx cdk synth` → `cdk.out` with 4 stacks | yes (**partial** infra) |
| Docker image builds | `docker build … -t mrs-rt4d-engine` success | yes |
| Fail-closed auth design | authorizer denies missing/invalid; secret required | yes (design **partial** until deploy) |
| No hash recompute in infra | mcp-handler stores engine-issued `pngSha256` / evidence only | yes |
| Hosted MCP live | no deploy | correctly **not** claimed |
| CIEMS enforcement | none | correctly **declared-only** |

## Ban checks

- No secrets committed.
- Engine remains sole hash authority.
- Gateway fronts **engine HTTP**, not a second renderer (documented).

## Verdict

**PASS_WITH_GAPS** — synth + docker + tests satisfy Priority #5 milestone; live hosted MCP remains **partial**.
