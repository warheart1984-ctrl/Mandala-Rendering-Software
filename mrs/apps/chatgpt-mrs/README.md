# MRS 4D Renderer × ChatGPT

Modern ChatGPT plugin that returns native MRS PNGs as MCP `image` content. It supports a deterministic local RT4D still and a complete Genblaze-backed **RT4D → governed SceneSpecification → Engine3D** journey. An optional viewport widget remains for Scene4DDTO wireframe tools; it is not forced for image results.

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
  PRIMARY NATIVE IMAGE TOOLS:
    render_4d_to_3d_pipeline → Genblaze RT4D → prompt-to-scene → Engine3D
    render_4d_prompt          → renderer-core/scripts/render-still.mjs (in-process)
    render_scene_spec_rt4d    → renderer-core/scripts/render-scene.mjs (subprocess)
    → content: [{type:text}, {type:image, mimeType:image/png, data:base64}]
  OPTIONAL viewport:
    create/update/inspect Scene4DDTO → Canvas2D widget (openai/outputTemplate)
```

Honest scope (Drive-G-1): procedural scene selection + seeded PathTracer4D. The full pipeline uses Genblaze for orchestration and B2-backed records, but requires `image_backend=rt4d` and sends `polish=false`; **no diffusion or text-to-image model creates the demonstrated frames**.

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

1. `render_4d_to_3d_pipeline` — prompt → RT4D concept → governed reveal → Engine3D structure/composite (three MCP images + stage provenance)
2. `render_4d_prompt` — prompt → procedural archetype → RT4D PNG (MCP image + provenance)
3. `render_scene_spec_rt4d` — SceneSpecification JSON string → RT4D PNG (MCP image + provenance)
4. `validate_scene_spec` / `describe_4drs_capabilities` — validation & honest capability card

Optional viewport tools: `create_4d_scene`, `update_4d_scene`, `inspect_4d_point`, `export_4d_scene`, `replay_4d_scene`.

## Tests

```bash
pnpm --filter @mrs/chatgpt-app-server test
# schema safety + 64×64 RT4D smoke + mocked 4D→3D + real Streamable HTTP MCP client
```

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` / `MRS_CHATGPT_PORT` | `8000` | HTTP listen |
| `MRS_PUBLIC_BASE_URL` | unset | Public origin for optional `/renders/:uuid.png` URLs |
| `MRS_RENDER_DIR` | OS tmp | PNG job directory |
| `MRS_RENDER_TIMEOUT_MS` | `120000` | Per-job timeout |
| `MRS_RENDER_MAX_PNG_BYTES` | `1500000` | MCP image size cap |
| `MRS_GENBLAZE_BASE_URL` | public MRS Render URL | Genblaze backend for `render_4d_to_3d_pipeline` |
| `MRS_GENBLAZE_TIMEOUT_MS` | `360000` | Per-stage Genblaze timeout |
| `MRS_GENBLAZE_API_KEY` | unset | Optional bearer token for protected Genblaze routes |
| `MRS_LIVELINK_URL` | `ws://127.0.0.1:9487` | Optional LiveLink |
| `MRS_AUTH_MODE` | `dev` | `dev` \| `api-key` |
| `JARVIS_MEMORYBOARD_URL` | `http://127.0.0.1:8001` | Jarvis memory board base URL for ChatGPT memory tools |

## Jarvis memory tools

The ChatGPT MCP server also exposes Jarvis memory tools:

1. `search_jarvis_memory` — read live or archived memories plus board context
2. `fetch_jarvis_memory` — fetch one memory by id
3. `write_jarvis_memory` — persist a memory or session summary
4. `update_jarvis_memory` — revise an existing memory by id
5. `delete_jarvis_memory` — delete an existing memory by id
6. `write_jarvis_session_summary` — persist a standard recap in one call

These are tool-only flows; no widget is required.
