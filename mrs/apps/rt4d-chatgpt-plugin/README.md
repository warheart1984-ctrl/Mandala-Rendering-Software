# RT4D ChatGPT / MCP Plugin (Phase 2 partial)

**Product plugin** for the RT4D Anime Lane hybrid production surface.

| Tag | Value |
| --- | --- |
| MCP bridge | **partial** (Streamable HTTP `/mcp` works today) |
| Widget | **partial** (local interactive dimensional preview) |
| ChatGPT embedded UI | **partial** — depends on MCP Apps / Dev Mode host support; **not** directory-ready |
| Public ChatGPT directory submission | **declared** (not claimed) |
| First technical milestone (persistent RT3D + RT4D effect + 5s timeline + replay receipt) | **declared** as a whole |
| Photoreal / AnimeStylizer character persistence | **declared** |

> **No claim without evidence.** The Three.js tesseract is a **dimensional preview**, not AnimeStylizer / photoreal anime. Do not describe RT3D persistence, 5s film, Unity/Unreal export, or directory listing as shipped.

Architecture SoT: [`docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md`](../../../docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md)

UI resource: `ui://rt4d/viewer-v1` (`text/html;profile=mcp-app` via MCP Apps SDK `RESOURCE_MIME_TYPE`).

---

## Hook up today (operator how-to)

Honest scope: MCP Inspector and ChatGPT Dev Mode can call working tools. Previews are engine-backed when `RT4D_ENGINE_URL` is set, otherwise a **deterministic placeholder**. Widget is a **partial** local dimensional viewer; ChatGPT embedding quality varies by platform.

### 1. Build the widget

```powershell
cd "G:\Mandala Rendering Software\mrs\apps\rt4d-chatgpt-plugin\widget"
npm install
npm run build
```

Produces single-file `assets/rt4d-viewer.html` (served by the MCP server). Local preview without MCP:

```powershell
npm run preview
# or: npm run dev
```

### 2. Install + start MCP

```powershell
cd "G:\Mandala Rendering Software\mrs\apps\rt4d-chatgpt-plugin\server"
npm install
npm start
```

Health check:

```powershell
curl.exe http://127.0.0.1:8010/health
```

Expect `"ok": true`, `"mcp_bridge": "partial"`, `"widget": "partial"` when the widget build exists.

Optional engine (prefer when set — no local RT4D math in this process):

```powershell
$env:RT4D_ENGINE_URL = "http://127.0.0.1:8080"   # Genblaze or compatible base
# $env:RT4D_API_KEY = "..."   # only if that host requires bearer
npm start
```

| Local URL | Purpose |
| --- | --- |
| `http://127.0.0.1:8010/health` | Liveness + status tags |
| `http://127.0.0.1:8010/mcp` | **Streamable HTTP MCP** (ChatGPT Dev Mode) |
| `http://127.0.0.1:8010/sse` | Legacy SSE (MCP Inspector) |

### 3. Expose HTTPS with cloudflared (preferred)

```powershell
cloudflared tunnel --url http://127.0.0.1:8010
```

Public MCP URL:

```text
https://<cloudflare-subdomain>.trycloudflare.com/mcp
```

### 4. MCP Inspector smoke

```powershell
npx @modelcontextprotocol/inspector
```

- Transport: **Streamable HTTP** → `http://127.0.0.1:8010/mcp`
- Resources: confirm `ui://rt4d/viewer-v1`
- Tools order: `create_rt4d_scene` → `render_rt4d_preview` → `update_rt4d_scene` (XW/YW/ZW + `projection.distance4d`) → `inspect_rt4d_provenance`
- Widget HTML loads from the resource; host may show App UI if MCP Apps supported

Also: `npm test` in `server/`.

### 5. What works where

| Surface | What works |
| --- | --- |
| **MCP Inspector** | Tools + resource fetch; structuredContent; update/re-preview. Interactive iframe depends on Inspector MCP Apps support. |
| **Widget `npm run dev` / `preview`** | Full Three.js controls, play/pause, provenance panel (local demo). `callTool` no-ops outside host. |
| **ChatGPT Dev Mode** | Tool calls work over Streamable HTTP. Embedded widget **partial** — requires host MCP Apps UI; do not claim directory listing. |

### 6. Tools

| Tool | Status |
| --- | --- |
| `create_rt4d_scene` | **partial** + opens viewer meta |
| `render_rt4d_preview` | **partial** (placeholder without `RT4D_ENGINE_URL`) |
| `inspect_rt4d_provenance` | **partial** |
| `update_rt4d_scene` | **partial** (rotations / projection / optional `rePreview`) |
| `export_rt4d_asset` | **skeleton** |
| Governance tools | **declared** stubs |

### 7. First test prompt

> Using the RT4D MCP tools: create a golden 4D dragon with XW and YW plane rotations, mode `add_rt4d_powers`, continuityState characterState name `golden-dragon`. Then `render_rt4d_preview`, then use the viewer (or `update_rt4d_scene`) to adjust ZW and projection distance. Inspect provenance. Do not claim persistent RT3D or AnimeStylizer — dimensional preview only.

### 8. Genblaze Actions vs this MCP plugin

| | **RT4D MCP plugin** (this package) | **Genblaze Custom GPT Actions** |
| --- | --- | --- |
| Path | `mrs/apps/rt4d-chatgpt-plugin` | `mrs/apps/genblaze-media` |
| Wire | MCP Streamable HTTP `/mcp` | OpenAPI Actions |
| Role | **Product** — hybrid Anime Lane + interactive viewer | **Companion** — Engine3D stills onboarding |

---

## Env

| Var | Meaning |
| --- | --- |
| `PORT` / `RT4D_PLUGIN_PORT` | Default `8010` |
| `RT4D_ENGINE_URL` | Genblaze (or compatible) base — **preferred when set** |
| `RT4D_API_KEY` | Optional bearer |
| `RT4D_ENGINE_TIMEOUT_MS` | Default `120000` |

```powershell
# server
npm test
npm run typecheck

# widget
cd ../widget
npm run build
npm run typecheck
```

---

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | MCP create → preview → provenance + modes + ContinuityState + Shot Evidence Envelope | **partial** |
| 2 | Interactive viewer (XW/YW/ZW, projection, play/pause, provenance panel) + `update_rt4d_scene` | **partial** (local viewer); ChatGPT embed host-dependent |
| 3 | Export / persistent RT3D character / manga·film composites / directory readiness | **declared** |

### Phase 3 export gaps (honest)

- `export_rt4d_asset` still NotImplemented (Unity / Unreal / game packs)
- No durable scene store across process restarts
- No verified continuity compare / replay / canonical approval
- No AnimeStylizer / photoreal character persistence
- ChatGPT public directory + stable production HTTPS **declared**

---

## Package layout

```
mrs/apps/rt4d-chatgpt-plugin/
├── .codex-plugin/plugin.json
├── skills/rt4d/SKILL.md
├── .app.json
├── server/          TypeScript MCP + Zod tools
├── widget/          React + Vite + Three.js source
├── assets/          Built rt4d-viewer.html (+ logo notes)
└── README.md
```

