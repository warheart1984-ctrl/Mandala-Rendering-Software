# 06 — ESFR / Engineer Standards — RT4D Priority #5 Hosted MCP

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `role` | ESFR |
| `softwareCreationMode` | Anchor + System-Sentinel |
| `status` | **partial** |
| `ESFRVerdict` | **PASS_WITH_GAPS** |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** |

## Scope under review

`infra/cdk/**`, `mrs/apps/rt4d-engine/Dockerfile`, `mrs/.dockerignore`, CECP trail, brief `RT4D_ENGINE_EVIDENCE_SPEC.v1.md` appendix.

## Test matrix (focused)

| Suite | Result |
|-------|--------|
| `pnpm --filter @mrs/rt4d-engine test` | **PASS** 23/23 |
| `pnpm --filter @mrs/rt4d-chatgpt-plugin test` | **PASS** 6/6 |
| plugin typecheck | **PASS** |
| `npx cdk synth` | **PASS** |
| `docker build -f apps/rt4d-engine/Dockerfile -t mrs-rt4d-engine .` (from `mrs/`) | **PASS** |
| `cdk deploy` | **NOT RUN** (blocked without credentials + intent) |

## Probes (01–08) — infra-relevant

| Probe | Finding |
|-------|---------|
| Evidence bound | Claims use partial/declared tags; CIEMS declared-only |
| Hash authority | Engine-only; lambda pass-through |
| Secrets | SSM/Secrets Manager refs only |
| Sovereignty | AWS-specific infra is explicit platform choice (P5 trade acknowledged) |
| Determinism | Infra does not inject non-deterministic render seeds |
| Cost honesty | NAT/Fargate/Redis/APIGW called out |
| Protected paths | Untouched |
| Live URL | Not claimed |

## Gaps (must close for full PROMOTE / “hosted MCP live”)

1. `cdk deploy` with seeded secrets + proven public `McpUrl`.
2. Wire structured fields + `MRS/RT4D` custom metrics in app code (today **declared**).
3. Optional: tighten SG to Lambda SG only (today VPC CIDR :8020).
4. Optional: full MCP Streamable-HTTP SDK host vs JSON-RPC/REST proxy.

## PromotionEligibility

**PROMOTE_WITH_GAPS** — Priority #5 synth/docker milestone is met and safe to land on `feat/rt4d-chatgpt-plugin`. Do **not** market hosted MCP as live until deploy URL evidence exists.
