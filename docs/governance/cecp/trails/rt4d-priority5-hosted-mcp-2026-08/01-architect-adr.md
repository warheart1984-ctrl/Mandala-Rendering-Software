# 01 — Architect ADR — RT4D Priority #5 Hosted MCP (AWS CDK)

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-priority5-hosted-mcp-2026-08` |
| `feature` | Hosted MCP runtime infrastructure (AWS CDK) |
| `role` | Architect |
| `softwareCreationMode` | Pipeline-Conductor + Boundary-Guardian |
| `status` | **partial** (design for synth+docker milestone; deploy **declared**) |
| `started` | 2026-08-02 |

## 1. Intent

Complete Priority #5 CDK app so RT4D Anime Lane can expose a ChatGPT-reachable HTTPS MCP path in front of the existing RT4D engine HTTP service, with artifact buckets, fail-closed API-key auth, stage throttling, and an observability surface — without claiming a live URL until deploy evidence exists.

## 2. ADR decision

### Context

- `Rt4dEngineStack` already sketches ECS Fargate + internal ALB + Redis.
- `ArtifactStorageStack` owns renders/evidence/logs buckets.
- Plugin MCP server (`mrs/apps/rt4d-chatgpt-plugin`) and engine HTTP (`mrs/apps/rt4d-engine`) already exist; engine is sole hash authority.
- Cross-stack `Fn.importValue` coupling is fragile in a single CDK app.

### Decision

1. **Gateway shape:** API Gateway REST (regional HTTPS) → Lambda authorizer (`Authorization: Bearer <RT4D_API_KEY>`) → Lambda proxy → **internal engine ALB** (engine HTTP). This is **not** a second renderer and **not** a reimplementation of the ChatGPT plugin MCP process — it is a hosted HTTPS front door that forwards to the engine service. Status: gateway design **partial** until deploy+live URL.
2. **Auth:** Fail-closed Token authorizer against Secrets Manager `${prefix}/api-keys` (`keys[]`). Missing/invalid token → deny/401. Stage throttle + usage-plan quota for rate limits; usage-plan API key resource is optional/supporting (**partial** — methods do not require `x-api-key` unless explicitly enabled later).
3. **Wiring:** Same-app **direct prop references** (bucket ARNs/names, VPC, ALB DNS, Redis endpoint). No `Fn.importValue` for same-app deps.
4. **Observability:** CloudWatch dashboard + log-group **name contract** + X-Ray group + alarm scaffolds on `MRS/RT4D` custom metrics. App emission of `renderId` / `failureClass` / `renderCost`|latency is **declared/partial** until engine/handler emit them.
5. **Docker:** Build context = `mrs/` monorepo (`-f apps/rt4d-engine/Dockerfile`) because `@mrs/renderer-core` is `workspace:*`. Image run via `tsx` (engine `tsconfig` is `noEmit`).
6. **Deploy:** Out of milestone unless AWS credentials + explicit intent. Milestone = `cdk synth` + docker build validation.

### Consequences

- Hosted MCP remains **partial** until `cdk deploy` + proven public URL.
- Free-tier / cost risks: NAT gateway, Fargate, Redis `cache.t3.micro`, API GW, Lambda — not free-tier-safe; document in trail.
- CIEMS/JCR remains **declared-only** (Drive-G external).

## 3. Interface specification

| Surface | Contract |
|---------|----------|
| Public URL | `https://{apiId}.execute-api.{region}.amazonaws.com/{stage}/mcp` (output `McpUrl`) |
| Auth header | `Authorization: Bearer <key>` matching Secrets Manager JSON `{ "keys": string[] }` |
| Upstream | `http://{engineAlbDns}:8020` (private) |
| Buckets | `rendersBucketName` / `evidenceBucketName` (S3); ARNs for IAM |
| Structured logs (declared) | fields `renderId`, `failureClass`, `renderCost`, `latencyMs` |
| Ban | No hash recomputation in infra/lambda; no secrets in git; no `renderer-core` edits; no constitutional path edits |

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| `infra/cdk/**` | `constitution/`, `engine/constitution/`, policies, `AGENTS.md` |
| CECP trail under `docs/governance/cecp/trails/...` | `mrs/packages/renderer-core/**` |
| Brief evidence-spec infra note | Fake JCR enforcement / CIEMS runtime |
| Dockerfile for rt4d-engine | `cdk deploy` without credentials |

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `infra/cdk/cdk.json` | create | Builder |
| `infra/cdk/package.json` | fix deps | Builder/Implementor |
| `infra/cdk/tsconfig.json` | include bin | Builder |
| `infra/cdk/bin/infra.ts` | direct props wire | Implementor |
| `infra/cdk/lib/*-stack.ts` | complete/fix | Implementor |
| `infra/cdk/lambda/**` | auth format + pass-through | Implementor |
| `mrs/apps/rt4d-engine/Dockerfile` | monorepo build | Implementor |
| `docs/.../RT4D_ENGINE_EVIDENCE_SPEC.v1.md` | brief infra surface note | Implementor |
| CECP `01`–`06` + README | trail | Crew |

## 6. Acceptance criteria

- [ ] `npx cdk synth` succeeds (or blocker documented with evidence)
- [ ] Docker image build succeeds or precise failure report
- [ ] No `Fn.importValue` for same-app bucket/redis wiring
- [ ] McpUrl CfnOutput exported
- [ ] Auth fail-closed documented; no secrets committed
- [ ] Focused rt4d-engine + plugin tests still pass
- [ ] Hosted MCP status tagged **partial** (not live)

## 7. Handoff to Builder

Scaffold `cdk.json`, fix `package.json`/`tsconfig`, align stack prop surfaces and stub exports; leave logic fill to Implementor. Label observability custom metrics **declared**.
