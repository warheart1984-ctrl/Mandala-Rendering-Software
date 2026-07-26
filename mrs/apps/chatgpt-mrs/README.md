# MRS 4D Renderer × ChatGPT

MCP connector that **renders deterministic procedural 4D stills** (CPU RT4D) and returns PNGs to ChatGPT as MCP `image` content. An optional skybridge viewport widget remains for Scene4DDTO wireframe tools — it is not the primary render path.

## ChatGPT connector form

| Field | Value |
|-------|--------|
| **Name** | `MRS 4D Renderer` |
| **Description** | `Render deterministic procedural 4D scenes and return PNGs with provenance.` |
| **MCP URL** | `https://<your-ngrok>/mcp` (Streamable HTTP) |
| **Auth** | No authentication |

## Architecture

```
ChatGPT
   │  Streamable HTTP  POST /mcp
   ▼
@mrs/chatgpt-app-server  (:8000)
  PRIMARY:
    render_4d_prompt          → renderer-core/scripts/render-still.mjs (in-process)
    render_scene_spec_rt4d    → renderer-core/scripts/render-scene.mjs (subprocess)
    → content: [{type:text}, {type:image, mimeType:image/png, data:base64}]
  OPTIONAL viewport:
    create/update/inspect Scene4DDTO → Canvas2D widget (openai/outputTemplate)
```

Honest scope (Drive-G-1): procedural scene selection + seeded PathTracer4D. **Not** diffusion / text-to-image / Genblaze / FLUX.

## Setup

```bash
cd mrs
pnpm run setup
pnpm --filter @mrs/chatgpt-app-web build
pnpm --filter @mrs/chatgpt-app-server start
```

- Health: `GET /health`
- MCP: `POST /mcp` (Streamable HTTP)
- Legacy SSE: `GET /sse` + `POST /mcp/messages`

## Primary tools

1. `render_4d_prompt` — prompt → procedural archetype → RT4D PNG (MCP image + provenance)
2. `render_scene_spec_rt4d` — SceneSpecification JSON string → RT4D PNG (MCP image + provenance)
3. `validate_scene_spec` / `describe_4drs_capabilities` — validation & honest capability card

Optional viewport tools: `create_4d_scene`, `update_4d_scene`, `inspect_4d_point`, `export_4d_scene`, `replay_4d_scene`.

## Tests

```bash
pnpm --filter @mrs/chatgpt-app-server test
# schema OpenAI-safety + 64×64@2spp render smoke
```

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` / `MRS_CHATGPT_PORT` | `8000` | HTTP listen |
| `MRS_PUBLIC_BASE_URL` | unset | Public origin for optional `/renders/:uuid.png` URLs |
| `MRS_RENDER_DIR` | OS tmp | PNG job directory |
| `MRS_RENDER_TIMEOUT_MS` | `120000` | Per-job timeout |
| `MRS_RENDER_MAX_PNG_BYTES` | `1500000` | MCP image size cap |
| `MRS_LIVELINK_URL` | `ws://127.0.0.1:9487` | Optional LiveLink |
| `MRS_AUTH_MODE` | `dev` | `dev` \| `api-key` |
