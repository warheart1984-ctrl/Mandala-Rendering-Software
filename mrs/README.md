# MRS monorepo

pnpm workspace for the Mathematical Reality Substrate (MRS) renderer and ChatGPT App.

## Packages

| Package | Path | Role |
|---------|------|------|
| `@mrs/renderer-core` | `packages/renderer-core` | Former `4d-renderer/` — surfaces, CanvasRenderer, inspector, LiveLink |
| `@mrs/scene-schema` | `packages/scene-schema` | `Scene4DDTO` tool/widget contract |
| `@mrs/renderer-web` | `packages/renderer-web` | Browser Canvas2D host (WebGPU optional/declared only) |
| `@mrs/chatgpt-app-server` | `apps/chatgpt-mrs/server` | MCP SSE server + 5 tools |
| `@mrs/chatgpt-app-web` | `apps/chatgpt-mrs/web` | Vite React skybridge widget |

## Migration note

`G:\New folder\4d-renderer` is a **compatibility shim**: `src/` junctions to `packages/renderer-core/src` so root `npm` scripts and `examples/**` imports keep resolving. Prefer `@mrs/renderer-core` for new work.

## Quick start

```bash
cd mrs
pnpm install
pnpm --filter @mrs/chatgpt-app-web build
pnpm --filter @mrs/chatgpt-app-server start
```

See `apps/chatgpt-mrs/README.md` for MCP Inspector / ChatGPT / ngrok.

## LiveLink ports (evidence)

| Service | Default | Source |
|---------|---------|--------|
| LiveLinkServer | **9487** | `renderer-core/src/live-link/LiveLinkServer.js` |
| Inspector WS helper | **9490** | `scripts/inspector-ws-server.mjs` |

Override with `MRS_LIVELINK_PORT` / `MRS_LIVELINK_URL`.
