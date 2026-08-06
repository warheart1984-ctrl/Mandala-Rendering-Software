# MRS intelligent service freeze — v1.5

**Freeze date:** 2026-08-06
**Product:** MRS v1.5 (Mandala Rendering System) — intelligent service node
**Service:** `mrs/mcp/` (`@mrs/mcp-server` v0.1.0) — dual MCP + REST + OpenAPI server
**Entry:** `node mrs/mcp/server.js` (from `mrs/`)

> **What "freeze" means here:** the **tool ids**, **REST routes**, **ports**, and
> **governance contracts** listed below are the v1.5 service surface. Breaking
> renames or silent removal of these names require a **post-v1.5** major bump or
> a new freeze doc. Freeze does **not** mean every tool is production-complete;
> maturity per tool is documented below.

**Companion freezes still in force:** [`rt4d-v1.0-freeze.md`](./rt4d-v1.0-freeze.md) (CPU RT4D),
[`mrs-v2.0-freeze.md`](./mrs-v2.0-freeze.md) (GPU/wavefront contracts).

---

## Frozen ports

| Port | Role | Env override |
| --- | --- | --- |
| **8080** | MCP JSON-RPC endpoint (POST root `/`, `{toolId, params, context}`) | `MRS_MCP_PORT` |
| **8081** | REST API (`/health`, `/ready`, `/version`, `/render`, `/api/v1/*`) | `MRS_REST_PORT` |
| **8082** | OpenAPI spec (`/openapi.json`) | `MRS_REST_PORT + 1` |

> Localhost only. **Not** the ChatGPT-reachable path — see
> [`chatgpt-actions-setup-pack.md`](./chatgpt-actions-setup-pack.md) for the AWS
> gateway, which is the canonical hosted surface.

---

## Frozen MCP tool surface (9 tools)

| toolId | Purpose | Maturity at freeze |
| --- | --- | --- |
| `mrs.health` | Basic health check | **enforced** (governed, smoke-verified) |
| `mrs.ready` | Readiness (core deps initialized) | **enforced** |
| `mrs.version` | Version + build metadata | **enforced** |
| `mrs.render.rt4d` | Constitutionally-governed 4D path tracing render | **partial** (governed path, renderer backend stub-tier) |
| `mrs.director.dep` | Director DEP orchestration: Plan → Route → Supervise → Enforce | **partial** |
| `mrs.sme.dispatch` | Dispatch to SME modules (txt, vis, aud, vid, gen, log, core) | **partial** |
| `mrs.sovereignx.route` | Route render via Sovereign X scheduler (GPU efficiency) | **partial** |
| `mrs.sovereignx.stats` | Sovereign X router statistics / efficiency metrics | **partial** |
| `mrs.sovereignx.hip.detect` | Detect HIP/ROCm SDK availability | **partial** (hardware-dependent) |

Telemetry tools (`mrs.health`, `mrs.ready`, `mrs.version`) are **exempt** from
lattice/constitutional gating via the conformance adapter (`mrs/mcp/conformance-adapter.js`).
All other tools are gated through `engine/governance/ConstitutionalKnowledgeLayer.js`
and `engine/constitution/contracts.js`.

---

## Frozen REST surface (port 8081)

| Method | Path | Tool equivalent |
| --- | --- | --- |
| `GET` | `/health` | `mrs.health` |
| `GET` | `/ready` | `mrs.ready` |
| `GET` | `/version` | `mrs.version` |
| `POST` | `/render` | `mrs.render.rt4d` |
| `POST` | `/api/v1/dep/execute` | `mrs.director.dep` |
| `POST` | `/api/v1/sme/dispatch` | `mrs.sme.dispatch` |
| `POST` | `/api/v1/sovereignx/route` | `mrs.sovereignx.route` |
| `GET` | `/api/v1/sovereignx/stats` | `mrs.sovereignx.stats` |
| `POST` | `/api/v1/sovereignx/hip/detect` | `mrs.sovereignx.hip.detect` |
| `GET` | `/openapi.json` | — (port 8082 also serves it) |

All REST handlers are `createProtectedHandler` — governed like MCP tools.

---

## Frozen governance contracts

Contract sources (`engine/constitution/contracts.js`), unchanged after v1.5:

| contractId | actor | allowed actions (frozen subset) |
| --- | --- | --- |
| `contract.cinematic4d.v1` | `4dce.renderer` | `render.session.start`, `render.frame.live`, `artifact.picture.export`, `artifact.movie.export`, `csr.replay.params` |
| `contract.director.v1` | `4dce.director` | `dispatch`, `collect`, `validate`, `check_policy`, `resolve_conflicts`, `request_approval`, `publish`, `plan`, `route`, `supervise`, `enforce_governance`, `render_4d_tesseract` |
| `contract.user.v1` | `user:*` | `submit_intent`, `poll_result`, `retrieve_evidence`, `request_replay`, `health_check`, `readiness_check`, `version_check` |
| `contract.sovereignx.v1` | `sovereignx` | `route_render`, `get_stats`, `detect_hip` |

Charter invariants (`engine/constitution/charter.js`, merged 4DCE+SME): `cinematic4d.vertexCount = 16`, `edgeCount = 32`, projection formulas with `d4` / `d3` — **enforced** by `js/constitution/cse.js` on render/export evidence.

---

## Frozen workspace wiring

- `@mrs/mcp-server` is a pnpm workspace member (`mrs/pnpm-workspace.yaml`, package `mcp`).
- Depends on `@mrs/renderer-core`, `@mrs/engine3d-core`, `@mrs/scene-schema`, `@mrs/sovereign-x-router` (all `workspace:*`).
- Root scripts: `service:mcp`, `service:rest`, `service:mcp:smoke`, `test:mcp`, `test:lattice`.

---

## Explicit non-claims at freeze

- [ ] Local MCP/REST endpoints reachable by ChatGPT (they are localhost-only)
- [ ] `mrs.render.rt4d` produces photoreal output
- [ ] SME dispatch invokes live native modules in every environment
- [ ] Sovereign X GPU routing is live on non-AMD/absent-ROCm hosts
- [ ] Lattice + SME governance are production-hardened under load

---

## Verification (at freeze)

| Check | Result |
| --- | --- |
| `npm run test:conformance` | ✅ COMPLIANT 17/17 |
| `npm run service:mcp:smoke` | ✅ pass: true (health/ready/version/mcp/openapi 200) |
| `node --test mrs/mcp/tools/*.js` | ✅ 7/7 |
| `node --test sme/dist/lattice/test/lattice.test.js` | ✅ 34/34 |
| `mrs/packages/renderer-core/.../normalization.test.js` | ✅ 23/23 |
| `npm test` | ✅ all smoke tests passed |
| AWS gateway `/openapi.json`, `/health`, unauth `/mcp` | ✅ 200 / 200 / 401 fail-closed |
