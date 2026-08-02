# RT4D ChatGPT / MCP Plugin (Phase 1)

**Product plugin** for the RT4D Anime Lane hybrid production surface.

| Tag | Value |
| --- | --- |
| MCP bridge | **partial** (Streamable HTTP `/mcp` works today) |
| Widget | **skeleton** |
| Public ChatGPT directory submission | **declared** (not claimed) |
| First technical milestone (persistent RT3D + RT4D effect + 5s timeline + replay receipt) | **declared** as a whole |

> **No claim without evidence.** Do not describe RT3D persistence, 5s film, Unity/Unreal export, or directory listing as shipped.

Architecture SoT: [`docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md`](../../../docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md)

---

## Hook up to ChatGPT today (operator how-to)

Honest scope: ChatGPT Dev Mode can call the **working** tools (`create_rt4d_scene`, `render_rt4d_preview`, `inspect_rt4d_provenance`). Previews are engine-backed when `RT4D_ENGINE_URL` is set, otherwise a **deterministic placeholder**. Widget is skeleton. Governance/export tools return declared NotImplemented stubs.

### 1. Install + start MCP locally

```powershell
cd "G:\Mandala Rendering Software\mrs\apps\rt4d-chatgpt-plugin\server"
npm install
npm start
```

Health check:

```powershell
curl.exe http://127.0.0.1:8010/health
```

Expect `"ok": true`, `"mcp_bridge": "partial"`.

Optional engine (Genblaze or compatible — no local RT4D math in this process):

```powershell
$env:RT4D_ENGINE_URL = "http://127.0.0.1:8080"   # your Genblaze base
# $env:RT4D_API_KEY = "..."   # only if that host requires bearer
npm start
```

| Local URL | Purpose |
| --- | --- |
| `http://127.0.0.1:8010/health` | Liveness + status tags |
| `http://127.0.0.1:8010/mcp` | **Streamable HTTP MCP** (ChatGPT Dev Mode) |
| `http://127.0.0.1:8010/sse` | Legacy SSE (MCP Inspector) |

### 2. Expose HTTPS with cloudflared (preferred)

ngrok is broken on this host — use **cloudflared** quick tunnel:

```powershell
cloudflared tunnel --url http://127.0.0.1:8010
```

Copy the printed HTTPS origin, e.g. `https://random-words.trycloudflare.com`.

**Public MCP URL pattern (what ChatGPT needs):**

```text
https://<cloudflare-subdomain>.trycloudflare.com/mcp
```

Keep both `npm start` and `cloudflared` running. Tunnel URLs are temporary — fine for Dev Mode; directory submission needs stable HTTPS (**declared**).

### 3. MCP Inspector smoke (before ChatGPT)

```powershell
npx @modelcontextprotocol/inspector
```

- Transport: **Streamable HTTP** → URL `http://127.0.0.1:8010/mcp`  
  (or SSE `http://127.0.0.1:8010/sse`)
- Call in order: `create_rt4d_scene` → `render_rt4d_preview` → `inspect_rt4d_provenance`
- Confirm `shotEvidence` + provenance fields come back

Also: `npm test` in `server/` (Phase 1 contract tests).

### 4. ChatGPT UI clicks

1. Open [ChatGPT](https://chatgpt.com) (account with **Developer Mode** / MCP connectors enabled).
2. **Settings** → **Apps & Connectors** / **Developer** (wording varies by rollout) → enable **Developer Mode** if needed.
3. **Add MCP server** / **Connect** → paste:

   ```text
   https://<your-cloudflared-host>/mcp
   ```

4. Auth: **None** for local Phase 1 (do not commit secrets).
5. Save. Paste the assigned connection ID into [`.app.json`](./.app.json) when you get one (optional bookkeeping).
6. Start a new chat and ensure the connector/server is selected / available to the model.

If ChatGPT cannot reach the URL: confirm `/health` via the **public** HTTPS host, and that cloudflared is still up.

### 5. Tools that appear

| Tool | In ChatGPT today | Status |
| --- | --- | --- |
| `create_rt4d_scene` | Yes | **partial** |
| `render_rt4d_preview` | Yes | **partial** (placeholder without `RT4D_ENGINE_URL`) |
| `inspect_rt4d_provenance` | Yes | **partial** |
| `update_rt4d_scene` | Listed | **skeleton** (NotImplemented) |
| `export_rt4d_asset` | Listed | **skeleton** |
| `validate_character_continuity` | Listed | **declared** stub |
| `replay_anime_shot` | Listed | **declared** stub |
| `compare_render_versions` | Listed | **declared** stub |
| `approve_canonical_shot` | Listed | **declared** stub |

Widget HTML resource is **skeleton** — do not expect a polished interactive viewer.

### 6. First test prompt (paste into ChatGPT)

> Using the RT4D MCP tools: create a golden 4D dragon with XW and YW plane rotations, mode `add_rt4d_powers`, continuityState characterState name `golden-dragon`. Then `render_rt4d_preview`, then `inspect_rt4d_provenance`. Show sceneId, intentId, timelineId, worldId, projector planes, and the Shot Evidence Envelope hashes.

Dimensional Awakening lite (same Phase 1 path, richer prompt):

> Create an anime mage in a ruined temple, mode `add_rt4d_powers`, with a tesseract sigil rotating on XW and YW. Render preview and inspect the Shot Evidence Envelope. Do not claim persistent RT3D character or verified 5s film replay — those are declared.

### 7. Genblaze Actions vs this MCP plugin

| | **RT4D MCP plugin** (this package) | **Genblaze Custom GPT Actions** |
| --- | --- | --- |
| Path | `mrs/apps/rt4d-chatgpt-plugin` | `mrs/apps/genblaze-media` |
| Wire | MCP Streamable HTTP `/mcp` | OpenAPI Actions (`/plugin/openapi.json`, `/.well-known/ai-plugin.json`) |
| Role | **Product** — hybrid Anime Lane modes, ContinuityState, Shot Evidence Envelope | **Companion side tool** — Engine3D stills / anime HTTP onboarding |
| ChatGPT setup | Developer Mode → Add **MCP server** | Custom GPT → **Actions** → import OpenAPI URL |

Do not confuse them: Actions ≠ MCP. Use this plugin for RT4D product tools; use Genblaze Actions when you want Engine3D still HTTP from a Custom GPT.

---

## Public demonstration narrative

Not “anime generated with AI.” A governed **production lane**:

**Anime Prompt → RT3D Anime Scene → RT4D Dimensional Pass → Composite → Image / Manga / Animation / Movie**

Clearest early structure demo: **golden 4D dragon** with **XW/YW** rotations. Category demo: **Dimensional Awakening** (architecture §7) — end-to-end **declared** until persistent RT3D + 5s timeline + verified replay ship.

### ChatGPT modes

| Mode | Product lane |
| --- | --- |
| `create_anime_character` | Portrait |
| `create_anime_scene` | Anime Scene (MVP) |
| `add_rt4d_powers` | Anime Scene |
| `animate_dimensional_transformation` | Anime Scene |
| `render_manga_panel` | Manga |
| `render_cinematic_sequence` | Film |

---

## Env

| Var | Meaning |
| --- | --- |
| `PORT` / `RT4D_PLUGIN_PORT` | Default `8010` |
| `RT4D_ENGINE_URL` | Genblaze (or compatible) base — **no local RT4D math** |
| `RT4D_API_KEY` | Optional bearer |
| `RT4D_ENGINE_TIMEOUT_MS` | Default `120000` |

```powershell
npm test
npm run typecheck
```

---

## Phases 1–5

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | MCP create → preview → provenance + modes + ContinuityState + Shot Evidence Envelope + skeleton viewer | **partial** |
| 2 | Wire RT3D anime scene / persistent character via Engine3D | **declared** |
| 3 | Dimensional animation timelines + Direction tools | **declared** |
| 4 | Composite → manga / cinematic / game asset exports | **declared** |
| 5 | Stable HTTPS + optional directory submission | **declared** |

---

## Package layout

```
mrs/apps/rt4d-chatgpt-plugin/
├── .codex-plugin/plugin.json
├── skills/rt4d/SKILL.md
├── .app.json
├── server/          TypeScript MCP + Zod tools
├── widget/          Skeleton HTML viewer
├── assets/
└── README.md
```
