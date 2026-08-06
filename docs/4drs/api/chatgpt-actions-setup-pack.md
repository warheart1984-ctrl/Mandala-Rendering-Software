# ChatGPT Actions Setup Pack — MRS RT4D (Live AWS)

> **Status: partial** — REST GPT Actions on live AWS dev gateway are **deployed and
> verified** (OpenAPI, health, fail-closed auth). Dimensional previews only, not
> photoreal anime. Authenticated render smoke requires your API key (Secrets Manager).

## Actions vs MCP — which to use?

| Path | When to use | URL |
|------|-------------|-----|
| **GPT Actions (recommended for ChatGPT Plus)** | Custom GPT → Configure → Actions. OpenAPI import. No MCP developer mode needed. | REST base below |
| **MCP connector** | ChatGPT Apps / developer MCP connector (Streamable HTTP). Same backend, different wire protocol. | `POST …/dev/mcp` |

Both hit the same AWS API Gateway → Lambda → ECS engine. **ChatGPT Plus custom GPTs
use Actions (REST/OpenAPI), not raw MCP.**

Do **not** use ngrok or `mrs/apps/chatgpt-mrs` localhost for production GPT Actions.
That plugin path is for local MCP development.

---

## 1. OpenAPI import URL (hosted, live)

```
https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev/openapi.json
```

- OpenAPI **3.1.0**, schema version **0.3.0**
- Source of truth in repo: `infra/cdk/lambda/mcp-handler/openapi.json`
- Public (no auth required to fetch the schema)

### Operations exposed to ChatGPT

| operationId | Method | Path | Purpose |
|-------------|--------|------|---------|
| `render_rt4d_from_prompt` | POST | `/v1/render-prompt` | **Preferred** one-shot: prompt → scene + preview URL |
| `create_rt4d_scene` | POST | `/v1/scenes` | Create scene from prompt |
| `inspect_rt4d_scene` | GET | `/v1/scenes/{sceneId}` | Inspect provenance |
| `update_rt4d_scene` | PATCH | `/v1/scenes/{sceneId}` | Update rotations/projection |
| `render_rt4d_preview` | POST | `/v1/scenes/{sceneId}/render` | Render preview for existing scene |

Base URL (must match `servers[0].url` in schema):

```
https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev
```

---

## 2. Authentication

| Field | Value |
|-------|-------|
| Type | **API Key** |
| Auth type | **Bearer** |
| Header | `Authorization: Bearer <key>` |
| ChatGPT UI | Paste **key value only** (ChatGPT prepends `Bearer `) |

### Where the key lives (never commit)

| Item | Value |
|------|-------|
| AWS account | `450753703992` |
| Region | `us-east-2` |
| Secret name | `mrs-rt4d-dev/api-keys` |
| JSON shape | `{"keys":["<api-key>"]}` |

Retrieve (operator shell, after `aws login`):

```powershell
aws secretsmanager get-secret-value `
  --secret-id mrs-rt4d-dev/api-keys `
  --region us-east-2 `
  --query SecretString --output text
```

Parse `.keys[0]` from the JSON. Paste into ChatGPT → GPT → Configure → Actions →
Authentication.

**Fail-closed:** missing or invalid Bearer → HTTP **401** `{"message":"Unauthorized"}`.

---

## 3. Privacy policy URL

Use either (both verified HTTP 200):

```
https://raw.githack.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-/main/docs/legal/rt4d-privacy-policy.html
```

```
https://mandala-rendering-system-mrs.onrender.com/privacy-policy
```

Paste into GPT → Configure → **Privacy policy**.

---

## 4. Step-by-step — wire ChatGPT Actions

1. Open [ChatGPT](https://chatgpt.com) → **Explore GPTs** → your RT4D GPT (or create one).
2. **Configure** → **Actions** → **Create new action** (or edit existing).
3. **Import from URL** → paste the OpenAPI URL above → **Import**.
4. Confirm **Server URL** is `https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev`.
5. **Authentication** → API Key → Bearer → paste key from Secrets Manager (value only).
6. **Privacy policy** → paste URL from section 3.
7. **Instructions** — copy suggested text from `docs/4drs/api/rt4d-chatgpt-gpt-action.md`.
8. **Save** → **Test** with: *"Render a cinematic trefoil knot preview at 512x512."*

ChatGPT should call `render_rt4d_from_prompt` and display `data.previewUrl` as an image.

---

## 5. Smoke test (operator)

From repo root, after exporting the key:

```powershell
$env:MRS_API_KEY = "<key-from-secrets-manager>"
.\infra\scripts\chatgpt-actions-smoke.ps1
```

Checks: `openapi.json` 200, `health` 200, unauth 401, authenticated
`POST /v1/render-prompt` returns `sceneId` + `previewUrl`.

---

## 6. Live verification (2026-08-05)

| Check | Result |
|-------|--------|
| `GET /openapi.json` | **200** — OpenAPI 3.1.0, 5 operations, AWS base URL |
| `GET /health` | **200** — `rt4d-hybrid-anime-production` v0.2.0, engine configured |
| `POST /v1/render-prompt` (no auth) | **401** Unauthorized (fail-closed) |
| `POST /mcp` (no auth) | **401** Unauthorized |
| Privacy policy (githack) | **200** |
| Privacy policy (Render) | **200** |
| Authenticated render | **Requires operator key** — run smoke script |

---

## 7. ChatGPT importer notes

- Schema uses `BearerAuth` (`type: http`, `scheme: bearer`) — matches ChatGPT's Bearer API Key mode.
- Prefer `render_rt4d_from_prompt` in GPT instructions (single call, stays under API Gateway ~29s timeout).
- Default 512×512 in one-shot; 1024×1024 may timeout on cold ECS.
- `statusTag: "partial"` is honest — dimensional previews, not photoreal.

---

## 8. Not for Actions

| Artifact | Purpose |
|----------|---------|
| `mrs/apps/chatgpt-mrs/` | Local MCP plugin (ngrok). **Not** the live Actions target. |
| `mrs/apps/chatgpt-mrs/openapi.engine.json` | Direct engine REST (Render.com). Separate from AWS gateway façade. |
| `POST …/dev/mcp` | MCP Streamable HTTP — use MCP connector, not Actions import. |

---

## Related

- Full usage doc: `docs/4drs/api/rt4d-chatgpt-gpt-action.md`
- CDK stack: `infra/cdk/lib/mcp-gateway-stack.ts`
- Lambda handler: `infra/cdk/lambda/mcp-handler/index.mts`
