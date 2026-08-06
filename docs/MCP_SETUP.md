# MRS MCP / REST Setup Guide

> **Source**: MRS v1.5 intelligent service — `mrs/mcp/`
> **Last Updated**: 2026-08-06
> **Freeze**: [`docs/4drs/api/mrs-v1.5-service-freeze.md`](./4drs/api/mrs-v1.5-service-freeze.md)

The MRS intelligent service is a single **Node.js** entry point (`mrs/mcp/server.js`)
that serves three surfaces: MCP (port 8080), REST (port 8081), and OpenAPI (port 8082).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | Required for MCP/REST server |
| pnpm | 9+ | Workspace package manager |

---

## Installation

```bash
# Clone repository
git clone <repo-url>
cd Mandala-Rendering-Software

# Install root + workspace deps
npm install
cd mrs && pnpm install
```

`pnpm install` links the internal packages (`@mrs/renderer-core`,
`@mrs/engine3d-core`, `@mrs/scene-schema`, `@mrs/sovereign-x-router`) into
`mrs/mcp/node_modules/@mrs/` as workspace junctions. **If smoke fails with
`Cannot find module '@mrs/...'`, re-run `pnpm install` in `mrs/`.**

---

## Project Layout

```
mrs/
├── mcp/
│   ├── server.js          # MCP (8080) + REST (8081) + OpenAPI (8082)
│   ├── tool-registry.js   # 9 MCP tools
│   ├── tools/             # health, ready, version, render, director-dep,
│   │                      # sme-dispatch, sovereignx-route
│   └── conformance-adapter.js  # lattice/constitutional gating adapter
├── packages/              # renderer-core, engine3d-core, scene-schema, ...
└── pnpm-workspace.yaml    # includes "mcp" as a workspace package
```

---

## Running the Service

```bash
# From repo root — starts MCP (8080), REST (8081), OpenAPI (8082)
npm run service:mcp
```

| Port | Surface | URL |
|------|---------|-----|
| 8080 | MCP JSON-RPC (POST) | `http://localhost:8080/` |
| 8081 | REST API | `http://localhost:8081/health` |
| 8082 | OpenAPI spec | `http://localhost:8082/openapi.json` |

Port overrides: `MRS_MCP_PORT` (default 8080), `MRS_REST_PORT` (default 8081).

### Verify Health

```bash
curl http://localhost:8081/health
curl http://localhost:8081/ready
curl http://localhost:8081/version
```

**Expected `/ready` response:**
```json
{
  "status": "ready",
  "ready": true
}
```

---

## MCP Tools (9)

| toolId | Description |
|--------|-------------|
| `mrs.health` | Basic health check |
| `mrs.ready` | Readiness (core deps initialized) |
| `mrs.version` | Version + build metadata |
| `mrs.render.rt4d` | Constitutionally-governed 4D render |
| `mrs.director.dep` | Director DEP workflow: Plan → Route → Supervise → Enforce |
| `mrs.sme.dispatch` | Dispatch to SME modules (txt, vis, aud, vid, gen, log, core) |
| `mrs.sovereignx.route` | Route render via Sovereign X scheduler |
| `mrs.sovereignx.stats` | Sovereign X router statistics |
| `mrs.sovereignx.hip.detect` | HIP/ROCm SDK availability detection |

MCP tool invocation (port 8080):

```json
POST /
{ "toolId": "mrs.health", "params": {}, "context": {} }
```

---

## REST Surface (port 8081)

| Method | Path | Tool equivalent |
|--------|------|-----------------|
| `GET` | `/health` | `mrs.health` |
| `GET` | `/ready` | `mrs.ready` |
| `GET` | `/version` | `mrs.version` |
| `POST` | `/render` | `mrs.render.rt4d` |
| `POST` | `/api/v1/dep/execute` | `mrs.director.dep` |
| `POST` | `/api/v1/sme/dispatch` | `mrs.sme.dispatch` |
| `POST` | `/api/v1/sovereignx/route` | `mrs.sovereignx.route` |
| `GET` | `/api/v1/sovereignx/stats` | `mrs.sovereignx.stats` |
| `POST` | `/api/v1/sovereignx/hip/detect` | `mrs.sovereignx.hip.detect` |
| `GET` | `/openapi.json` | OpenAPI 3.1 spec |

---

## Verification

```bash
npm run test:conformance   # 17/17 COMPLIANT
npm run service:mcp:smoke  # pass: true
npm run test:mcp           # 7/7
npm run test:lattice       # 34/34
npm test                   # full suite
```

---

## Localhost vs. ChatGPT

The local service listens on `localhost` only — **ChatGPT cannot reach
`localhost:8080/8081/8082`**. For ChatGPT integration, the canonical path is the
hosted AWS gateway:

- Base URL: `https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev`
- OpenAPI import: `<base>/openapi.json`
- Auth: fail-closed (unauth requests → 401)
- Setup: [`docs/4drs/api/chatgpt-actions-setup-pack.md`](./4drs/api/chatgpt-actions-setup-pack.md)

Cloudflare tunnels and Docker port 8000 from earlier iterations are **obsolete**.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot find module '@mrs/...'` | Re-run `pnpm install` in `mrs/` (workspace junctions) |
| Port 8080/8081 conflict | Set `MRS_MCP_PORT` / `MRS_REST_PORT` |
| ChatGPT can't connect | Use the AWS gateway URL, not localhost |

---

## Quick Reference Card

```bash
# Start everything locally
npm run service:mcp

# Verify
curl http://localhost:8081/ready
curl http://localhost:8081/version
npm run service:mcp:smoke
```
