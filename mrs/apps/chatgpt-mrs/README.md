# MRS × ChatGPT App

MCP App that exposes 4D scene tools and a skybridge viewport widget.

## Architecture

```
ChatGPT / MCP Inspector
        │  SSE  GET /mcp  +  POST /mcp/messages
        ▼
@mrs/chatgpt-app-server  (:8000)
  tools: create / update / inspect / export / replay
  resource: ui://mrs-viewport/mrs-viewport.html  (text/html+skybridge)
        │
        ├─ in-memory Scene4DDTO Map
        ├─ MRSInspector4D (in-process)
        ├─ optional WS → LiveLinkServer (default ws://127.0.0.1:9487)
        └─ widget HTML ← apps/chatgpt-mrs/assets/mrs-viewport.html
                ▲
                │ Vite build
        @mrs/chatgpt-app-web → @mrs/renderer-web → @mrs/renderer-core (Canvas2D)
```

## Setup

```bash
cd mrs
pnpm install
pnpm --filter @mrs/chatgpt-app-web build
pnpm --filter @mrs/chatgpt-app-server start
```

Server: `http://127.0.0.1:8000`

- Health: `GET /health`
- MCP SSE: `GET /mcp`
- Messages: `POST /mcp/messages?sessionId=...`

### MCP Inspector

1. Open https://modelcontextprotocol.github.io/inspector/
2. Transport: SSE → `http://localhost:8000/mcp`
3. Call `create_4d_scene` with `{ "surface": "tesseract" }`

### ChatGPT + ngrok

```bash
ngrok http 8000
```

Add the public `/mcp` URL as a ChatGPT custom MCP / app connector (per current OpenAI Apps docs). Widget MIME is `RESOURCE_MIME_TYPE` (`text/html+skybridge`).

## Capability table (Drive-G-1)

| Capability | Status | Evidence |
|------------|--------|----------|
| Create/update in-memory scene | **real** | `server/src/scene-store.ts`, tools |
| Viewport Canvas2D render | **real** | `@mrs/renderer-web` + `CanvasRenderer` |
| WebGPU in widget | **optional/declared** | probed; active path is Canvas2D only |
| Inspect point (local inspector) | **real** | `MRSInspector4D.handleWireMessage` |
| Inspect via LiveLink | **optional** | `MRS_INSPECT_VIA_LIVELINK=1` + running server on 9487 |
| Export `json` / `mesh` | **real** | in-process DTO/mesh |
| Export `glTF` / `image` | **best-effort** | `ExportManager` (needs native `canvas`) |
| Export `replay` | **not_implemented** | clear structured error |
| Replay `timeline` | **declared** | metadata only on scene |
| Replay `cssv` | **not_implemented** | clear structured error |
| LiveLink `set_config` on update | **best-effort** | fails soft if no server |

## Versions (pinned from openai-apps-sdk-examples evidence)

| Package | Pin / resolved | Source |
|---------|----------------|--------|
| `@modelcontextprotocol/sdk` | `^1.29.0` (resolved with ext-apps peer) | ext-apps 1.7.x peer; examples also cite `^1.12.1` |
| `@modelcontextprotocol/ext-apps` | `^1.0.1` (resolved **1.7.4**) | openai-apps-sdk-examples / mcp_app_basics |
| SSE transport pattern | kitchen_sink_server_node | GET `/mcp` + POST `/mcp/messages` |
| `@openai/apps-sdk-ui` | **not installed** | declared gap — minimal `Badge`/`Button` in `web/src/ui.tsx` |

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` / `MRS_CHATGPT_PORT` | `8000` | HTTP listen |
| `MRS_LIVELINK_PORT` | `9487` | LiveLink WS port |
| `MRS_LIVELINK_URL` | `ws://127.0.0.1:9487` | Full WS URL |
| `MRS_INSPECT_VIA_LIVELINK` | unset | Set `1` to try LiveLink before local inspector |
| `MRS_AUTH_MODE` | `dev` | `dev` \| `api-key` |
| `MRS_API_KEY` | unset | Required when `api-key` mode |

## Tools

1. `create_4d_scene` — builds `Scene4DDTO`, stores in Map, returns widget template meta
2. `update_4d_scene` — merges patch; best-effort LiveLink `set_config`
3. `inspect_4d_point` — screen or ray → `MRSInspector4D`
4. `export_4d_scene` — format-specific (see table)
5. `replay_4d_scene` — timeline declared / cssv not_implemented
