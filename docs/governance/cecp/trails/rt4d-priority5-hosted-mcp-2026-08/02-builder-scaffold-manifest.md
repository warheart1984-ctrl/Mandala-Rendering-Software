# 02 — Builder scaffold — RT4D Priority #5 Hosted MCP

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `role` | Builder |
| `cites` | `01-architect-adr.md` |
| `status` | **partial** |

## 1. Intent

Materialize CDK app scaffolding and stack file surfaces per Architect ADR so Implementor can fill synth-green wiring.

## 2. Scaffold manifest

| Path | State |
|------|-------|
| `infra/cdk/cdk.json` | create |
| `infra/cdk/package.json` | adjust (aws-cdk-lib only; esbuild/ts-node) |
| `infra/cdk/tsconfig.json` | include `bin` + `lib` |
| `infra/cdk/bin/infra.ts` | wire stacks via props |
| `infra/cdk/lib/artifact-storage-stack.ts` | exists — keep bucket exports |
| `infra/cdk/lib/rt4d-engine-stack.ts` | props: bucket names/ARNs; export vpc/alb/redis |
| `infra/cdk/lib/mcp-gateway-stack.ts` | API GW + authorizer + handler |
| `infra/cdk/lib/observability-stack.ts` | dashboard/alarms/X-Ray (**declared** metrics) |
| `infra/cdk/lambda/authorizer/index.ts` | Token authorizer IAM policy |
| `infra/cdk/lambda/mcp-handler/index.ts` | engine pass-through (**skeleton/partial**) |
| `mrs/apps/rt4d-engine/Dockerfile` | monorepo-context build |

## 3. Dependency graph

```
ArtifactStorageStack
  └─► Rt4dEngineStack (bucket name/ARN props, Docker→ECS)
        └─► McpGatewayStack (vpc, albDns, redisEndpoint, buckets)
ObservabilityStack (name-aligned dashboards; no duplicate log groups)
```

## 4. Build artifacts inventory

| Artifact | Status tag |
|----------|------------|
| CDK stacks | **partial** (synth target) |
| Lambda MCP proxy | **partial** (pass-through; not full MCP SDK host) |
| Observability custom metrics | **declared** until app emits |
| Live HTTPS MCP URL | **declared** (needs deploy) |
| CIEMS/JCR | **declared-only** |

## 5. Test placeholders

- `npm run synth` in `infra/cdk`
- `docker build -f apps/rt4d-engine/Dockerfile` from `mrs/`
- `pnpm --filter @mrs/rt4d-engine test` + plugin tests

## 6. Handoff to Implementor

Remove same-app `Fn.importValue`; fix authorizer policy shape; align observability Construct APIs; make Docker monorepo-aware; run synth + docker + focused tests.
