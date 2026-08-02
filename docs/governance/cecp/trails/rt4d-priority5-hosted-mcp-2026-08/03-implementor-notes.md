# 03 — Implementor notes — RT4D Priority #5 Hosted MCP

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `role` | Implementor |
| `softwareCreationMode` | Constructor + Forge |
| `status` | **partial** |

## What changed

1. **CDK app wiring** (`infra/cdk/bin/infra.ts`): Artifact → Engine → MCP → Observability via **direct props** (bucket names/ARNs, VPC, ALB DNS, Redis endpoint, log/cluster/service names). No same-app `Fn.importValue`.
2. **`McpGatewayStack`**: API Gateway REST + Token authorizer (Bearer / Secrets Manager) + VPC Lambda proxy to internal engine ALB; stage throttle + usage-plan quota; `McpUrl` / `McpPostUrl` outputs.
3. **`ObservabilityStack`**: Dashboard widgets, X-Ray group, structured log group `/mrs/{prefix}/structured`, custom-metric alarms tagged **declared**.
4. **`Rt4dEngineStack`**: Bucket name+ARN props; monorepo Docker asset (`mrs/` + `.dockerignore`); VPC CIDR allow on :8020 for MCP Lambda.
5. **Lambdas**: Authorizer returns IAM Allow or throws `Unauthorized` (fail-closed). Handler is engine pass-through — **no hash recomputation**.
6. **Dockerfile**: Build from `mrs/`; Alpine + `tini` + Cairo stack for `canvas`; run via `tsx`.
7. **Evidence spec**: Appendix for hosted MCP infra surface (**partial** / CIEMS **declared-only**).

## Commands run

```text
cd infra/cdk && npm install
cd infra/cdk && npx cdk synth          # SUCCESS → cdk.out
cd mrs && docker build -f apps/rt4d-engine/Dockerfile -t mrs-rt4d-engine .
cd mrs && pnpm --filter @mrs/rt4d-engine test          # 23/23
cd mrs && pnpm --filter @mrs/rt4d-chatgpt-plugin test  # 6/6
cd mrs && pnpm --filter @mrs/rt4d-chatgpt-plugin run typecheck
```

## Honesty / gaps

| Item | Tag |
|------|-----|
| Hosted MCP live URL | **declared** (no `cdk deploy`) |
| Custom CW metrics emission | **declared** |
| Full MCP Streamable-HTTP SDK host | **skeleton/partial** (JSON-RPC/REST proxy) |
| Pre-seeded Secrets Manager secrets | required at deploy; not in git |
| Cost | NAT + Fargate + Redis + APIGW — not free-tier-safe |

## Deploy blockers (documented)

- AWS credentials + explicit deploy intent required.
- Secrets must exist: `${prefix}/api-keys`, `${prefix}/api-key`, `${prefix}/redis/auth`.
