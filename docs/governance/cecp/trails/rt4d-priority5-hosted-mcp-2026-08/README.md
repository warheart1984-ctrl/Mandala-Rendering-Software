# RT4D Priority #5 — Hosted MCP runtime (AWS CDK)

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `feature` | Hosted MCP HTTPS front door + observability CDK |
| `started` | 2026-08-02 |
| `overallStatus` | **operator-ready / runtime partial** |
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
- Deploy / live URL: **proven** — `https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev/mcp` (account `450753703992`, `us-east-2`)
- Live smoke (2026-08-03): `/health` **200**; unauthenticated POST `/mcp` **401**; authenticated initialize + `tools/list` **200** but body was stub `{"status":"handled"}` (0 tools) — protocol payload capture bug in deployed Lambda
- Repo fix: `WebStandardStreamableHTTPServerTransport` + JSON response capture in `infra/cdk/lambda/mcp-handler/index.mts` (**not yet live** — CDK exclusive deploy rolled back on empty authorizer zip; Lambda code update blocked by expired AWS session)
- Status honesty: **operator-ready** for URL + Bearer secret path; **runtime partial** until redeployed handler returns real MCP tools; **ChatGPT paste pending** (no ChatGPT UI verification)

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
