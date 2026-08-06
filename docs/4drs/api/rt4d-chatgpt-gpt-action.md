# RT4D GPT Action (ChatGPT Plus) — Setup & Usage

> Status: **partial** — dimensional previews, not photoreal anime. Provenance and
> determinism are enforced; preview fidelity is not.
> **Setup pack:** [`chatgpt-actions-setup-pack.md`](chatgpt-actions-setup-pack.md)

## What this is

A ChatGPT-compatible REST/OpenAPI façade on the existing MCP gateway so ChatGPT
Plus (which cannot import raw MCP servers) can drive RT4D via **GPT Actions**.

```
ChatGPT Plus → GPT Action (OpenAPI) → API Gateway → MCP tool handlers → ECS renderer → PNG + evidence
```

The façade reuses the MCP tool logic (`createScene`, `performRender`,
`resolveScene`, `applySceneUpdate`). No separate service.

## Endpoints (dev)

| Item | Value |
|------|-------|
| OpenAPI schema (import URL) | `https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev/openapi.json` |
| Base URL | `https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev` |
| `POST /v1/scenes` | Create scene (deterministic sceneId from prompt) |
| `GET /v1/scenes/{sceneId}` | Inspect scene + provenance |
| `PATCH /v1/scenes/{sceneId}` | Update rotations / projection / re-preview |
| `POST /v1/scenes/{sceneId}/render` | Render preview → pre-signed S3 PNG URL |
| `POST /v1/render-prompt` | **One-shot**: create scene + render preview in a single call → `data.sceneId` + `data.previewUrl` |

Auth: `Authorization: Bearer <api key>` on every call except `/openapi.json`
and `/health` (open). The authorizer reads the key fresh from Secrets Manager
`mrs-rt4d-dev/api-keys` and is fail-closed.

## ChatGPT setup

1. Create/Open a GPT → **Configure** → **Actions** → **Create new action**.
2. Authentication: **API Key**, type **Bearer**. Paste the **key value only**
   (ChatGPT prepends `Bearer `). Do not paste the key into prompts, instructions,
   or the schema.
3. Import the schema from the OpenAPI URL above (or paste the JSON from
   `infra/cdk/lambda/mcp-handler/openapi.json`).
4. Save, then test with a prompt like: *"Create a cinematic gothic cathedral
   scene at dusk and render a preview."*

### GPT instructions (suggested text)

```
You can create deterministic 4D scenes and render dimensional previews using the RT4D action.

PREFERRED one-shot path (most reliable): call render_rt4d_from_prompt with the
user's prompt — it creates the scene and renders the preview in a single call and
returns data.sceneId + data.previewUrl. Use it first.

Required behavior
- When a user asks for an image, scene, preview, or 4D render:
  1. Call render_rt4d_from_prompt with the user's prompt (one-shot). If that
     operation is unavailable, call create_rt4d_scene with the prompt, then
     immediately call render_rt4d_preview using the returned sceneId.
  2. If the user wants changes, call update_rt4d_scene with adjustments such as
     xw, yw, zw, projection, or other scene updates, and set rePreview=true.
  3. If a render fails because the scene is not found or a transient error
     occurs, call inspect_rt4d_scene using the sceneId, then retry
     render_rt4d_preview once.
  4. When a preview URL is returned, display it as an image instead of raw JSON.
  5. Do not ask the user to manually call tools if the request is clear enough
     to proceed.
  6. If the user says "use MRS," interpret that as a request to use the RT4D
     action workflow automatically.

Response style
- Be concise and action-oriented. Confirm what you are generating.
- After tool calls, summarize: sceneId, whether render succeeded, preview
  result, and any retry/recovery that occurred.
- If the returned statusTag is "partial", explain briefly that the system
  returns dimensional previews rather than a photoreal final image.

Default tool strategy
- For creative scene requests: use the prompt as written by the user; prefer
  cinematic composition.
- If no size is specified, use 512x512 (reliable within API timeouts; up to
  1024 is supported).

Must use tools rule
- When the user requests a render, preview, 4D scene, or asks to "use MRS," you
  must prefer calling the RT4D action over explaining how to do it manually.
- Do not respond with only instructions unless: the action is unavailable,
  authentication fails, or the user is explicitly asking for setup help. If the
  action is available, act first.

Recovery logic
- If render_rt4d_preview fails with a transient error or "Scene not found," call
  inspect_rt4d_scene with the same sceneId and retry rendering once before
  reporting failure.

Diffuse interpretation
- If the user asks to "diffuse" the 4D image, interpret that as: preserve the 4D
  scene structure; enhance atmosphere, lighting, texture, and cinematic richness;
  and, if supported by the connected workflow, perform a stylization/refinement
  step after the preview render.
- If only RT4D preview tools are available, explain that the result is a
  dimensional preview and not a photoreal diffusion render.

Response envelope: { ok, statusTag, data, error }. statusTag is "partial":
previews are dimensional renderings, not photoreal anime.
```

## Verified behavior (2026-08-05, live)

- `GET /openapi.json` → 200, OpenAPI 3.1.0 (schema version 0.3.0) with five
  operations, including the one-shot `render_rt4d_from_prompt`.
- `GET /health` → 200, `rt4d-hybrid-anime-production` v0.2.0, engine configured.
- Unauthenticated `POST /v1/render-prompt` and `POST /mcp` → 401 (fail-closed).
- Operator setup pack: `docs/4drs/api/chatgpt-actions-setup-pack.md`
- Smoke script: `infra/scripts/chatgpt-actions-smoke.ps1` (requires `MRS_API_KEY`).
- `POST /v1/render-prompt` → single call returns `data.sceneId` and
  `data.previewUrl` (pre-signed S3 PNG) in ~8s at 512×512; `data.sha256` is
  deterministic (identical image bytes across equivalent scenes).
- Same prompt twice → identical sceneId (replayable/deterministic).
- `POST /v1/scenes/{id}/render` → `data.previewUrl` is a pre-signed S3 URL to
  the PNG (`mrs-rt4d-dev-renders`), `data.sha256` matches across re-renders,
  and the URL returns HTTP 200 with PNG magic bytes.
- `PATCH` update returns the stable sceneId plus a fresh preview when requested.
- MCP transport (`/mcp`) still works (initialize → `rt4d-hybrid-anime-production` v0.2.0).
- Renders at 1024×1024 can exceed the 29s API Gateway integration timeout on a
  cold engine; the one-shot endpoint defaults to 512×512 to stay within budget.

## Key rotation

The dev API key was rotated on 2026-08-03. Current key lives only in Secrets
Manager (`mrs-rt4d-dev/api-keys`) and in ChatGPT's auth field. Rotate by:
writing `{"keys":["<new>"]}` to the secret (use a JSON file + `--secret-string
file://...` — PowerShell/CLI strip embedded quotes otherwise), then replace the
value in ChatGPT. Never commit the key.

## Related files

- `infra/cdk/lambda/mcp-handler/index.mts` — shared ops + REST dispatch
- `infra/cdk/lambda/mcp-handler/openapi.json` — GPT Action schema (SoT)
- `infra/cdk/lib/mcp-gateway-stack.ts` — routes / auth wiring
- `infra/cdk/lambda/authorizer/index.ts` — bearer authorizer (stage-wide policy)
