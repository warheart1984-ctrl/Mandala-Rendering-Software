# RT4D Priority #5 — Hosted MCP runtime (AWS CDK)

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `feature` | Hosted MCP HTTPS front door + observability CDK |
| `started` | 2026-08-02 |
| `overallStatus` | **partial** |
| `softwareCreationMode` | Pipeline-Conductor → Constructor/Forge → Boundary-Guardian → Testwright → Anchor |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** |
| `ESFRVerdict` | **PASS_WITH_GAPS** |

## Stage files

| Stage | File |
|-------|------|
| 01 Architect | [01-architect-adr.md](./01-architect-adr.md) |
| 02 Builder | [02-builder-scaffold-manifest.md](./02-builder-scaffold-manifest.md) |
| 03 Implementor | [03-implementor-notes.md](./03-implementor-notes.md) |
| 04 Reviewer | [04-reviewer-conformance.md](./04-reviewer-conformance.md) |
| 05 Inspector | [05-inspector-acceptance.md](./05-inspector-acceptance.md) |
| 06 ESFR | [06-engineer-standards.md](./06-engineer-standards.md) |

## Milestone evidence (this run)

- `infra/cdk`: `npx cdk synth` → success (`mrs-rt4d-{artifacts,engine,mcp,observability}-dev`)
- Docker: `docker build -f apps/rt4d-engine/Dockerfile -t mrs-rt4d-engine .` from `mrs/` → success
- Tests: rt4d-engine 23/23; plugin 6/6 + typecheck
- Deploy / live URL: **not claimed**

## Architecture (honest)

```text
ChatGPT / client
  --HTTPS Bearer--> API Gateway (/mcp, /v1/renders*, /health)
       --TokenAuthorizer--> Secrets Manager api-keys (fail-closed)
       --Lambda (VPC)--> Internal Engine ALB :8020
                              --> ECS Fargate rt4d-engine
                              --> Redis (cache) + S3 (artifacts)
```

Gateway fronts the **engine HTTP API** (not a second renderer; not a re-host of the ChatGPT plugin MCP Node process).

## Cost / free-tier

NAT Gateway + Fargate + ElastiCache + API Gateway + Lambda are **not** free-tier-safe. Treat as paid-dev/demo infra.
