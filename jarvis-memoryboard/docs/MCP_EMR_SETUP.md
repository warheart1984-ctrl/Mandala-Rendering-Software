# EMR MCP Adapter (recall + gated writes)

Expose the Jarvis **EMR Protocol** to assistant hosts
(Cursor, OpenCode, ChatGPT, Claude Desktop, etc.) via the Model Context Protocol.

## Live vs declared (status tags)

| Capability | Tag | When it works | Evidence |
|------------|-----|---------------|----------|
| `POST /api/jarvis/tools/emr_recall` on loopback | **live** | Memoryboard running on `127.0.0.1:8001` | `tests/test_emr_tool.py`, `tests/test_emr_mcp.py` |
| `emr_remember` / `emr_upsert` tool endpoints | **partial** | `JARVIS_MCP_WRITE_ENABLED=true` + `user_requested=true` | `tests/test_emr_write.py`, `tests/test_emr_mcp*.py` |
| MCP stdio adapter (`python -m mcp_server`) | **live** | Same host as memoryboard; stdio process can reach `:8001` | `tests/test_emr_mcp.py` |
| Cursor / OpenCode local MCP wiring | **live** (operator) | Host config points `cwd` at `jarvis-memoryboard` + memoryboard up | `config/mcp-cursor.example.json` |
| Render public `POST /mcp` (Streamable HTTP) | **live** | Render deploy with `EMR_RECALL_API_KEY` | `mcp_server/mcp_http.py`, `docs/DEPLOY_RENDER.md` |
| ChatGPT remote MCP write tools | **declared** / operator | Requires `JARVIS_MCP_WRITE_ENABLED=true` (off on Render by default) + host `requireApproval` | `app/emr_write.py` |

## Architecture (constitutional loop)

```
                ┌──────────────────────────┐
                │        ChatGPT / LLM     │
                └──────────────┬───────────┘
                               │ propose (MCP tools)
                               ▼
                ┌──────────────────────────┐
                │        EMR (write)       │
                │  emr_remember / upsert   │
                │  abstention + provenance │
                └──────────────┬───────────┘
                               │ governed draft commit
                               ▼
                ┌──────────────────────────┐
                │   Continuity Ledger (LTM)│
                └──────────────┬───────────┘
                               │ governed recall
                               ▼
                ┌──────────────────────────┐
                │        EMR (read)        │
                │      emr_recall         │
                └──────────────┬───────────┘
                               │ STM injection
                               ▼
                ┌──────────────────────────┐
                │        ChatGPT / LLM     │
                └──────────────────────────┘
```

Agent never touches the ledger directly. Writes are **draft-only** and refuse
without explicit `user_requested=true`. Public Render keeps writes off until
`JARVIS_MCP_WRITE_ENABLED=true`.

## Prerequisites

1. **Jarvis Memoryboard** running on port 8001:

```bash
cd jarvis-memoryboard
. .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Or use the systemd user unit (`jarvis-memoryboard.service`) if installed.

2. Python 3.11+ with `jarvis-memoryboard` installed (editable install from repo root):

```bash
cd jarvis-memoryboard
pip install -e ".[dev]"
```

## MCP Server (stdio)

Run manually to verify:

```bash
cd jarvis-memoryboard
JARVIS_MEMORYBOARD_URL=http://127.0.0.1:8001 python -m mcp_server
```

Environment:

| Variable | Default | Purpose |
|----------|---------|---------|
| `JARVIS_MEMORYBOARD_URL` | `http://127.0.0.1:8001` | Memoryboard base URL |
| `EMR_RECALL_API_KEY` | — | Operator key when memoryboard requires auth (Render, protected local) |
| `JARVIS_MCP_WRITE_ENABLED` | `false` | Enable `emr_remember` / `emr_upsert` |
| `JARVIS_MCP_FIXED_SOURCE_AGENT` | — | Optional fixed `source_agent` for all MCP writes |
| `JARVIS_MEMORY_WRITE_ENABLED` | `true` (local) / `false` (Render) | REST ledger CRUD (separate from MCP tools) |

### Tool surface

| MCP tool | HTTP equivalent | Policy |
|----------|-----------------|--------|
| `emr_recall` | `POST /api/jarvis/tools/emr_recall` | **READ** — governed bundle |
| `emr_remember` | `POST /api/jarvis/tools/emr_remember` | **WRITE draft** — create (gated) |
| `emr_upsert` | `POST /api/jarvis/tools/emr_upsert` | **WRITE draft** — supersede lineage (gated) |

Tool catalog (OpenAI function schemas): `GET /api/jarvis/tools`

### Enabling writes (local)

```bash
export JARVIS_MCP_WRITE_ENABLED=true
# optional: export JARVIS_MCP_FIXED_SOURCE_AGENT=user-requested-mcp
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Write calls require `user_requested: true`. Hosts should set MCP `require_approval`
(or equivalent) so the model cannot silently commit.

---

## Cursor

Add to your Cursor MCP config (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jarvis-emr": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "cwd": "/absolute/path/to/jarvis-memoryboard",
      "env": {
        "JARVIS_MEMORYBOARD_URL": "http://127.0.0.1:8001"
      }
    }
  }
}
```

Restart Cursor after saving. The `emr_recall` tool appears in agent tool lists.

See also: `config/mcp-cursor.example.json` in this directory.

---

## OpenCode

Add to `.opencode/config.json` under `mcp.servers` (HTTP MCP for MRS is already
configured; EMR uses stdio because the memoryboard is local):

```json
{
  "mcp": {
    "servers": {
      "jarvis-emr": {
        "command": "python",
        "args": ["-m", "mcp_server"],
        "cwd": "jarvis-memoryboard",
        "env": {
          "JARVIS_MEMORYBOARD_URL": "http://127.0.0.1:8001"
        }
      }
    }
  }
}
```

See: `config/mcp-opencode.example.json`

---

## OpenAI integration (ChatGPT, Responses API, Secure MCP Tunnel)

OpenAI docs: [MCP and Connectors](https://platform.openai.com/docs/mcp) ·
[Secure MCP Tunnel](https://platform.openai.com/docs/mcp#secure-mcp-tunnel)

### Choose a connection path

| Path | When to use | Endpoint |
|------|-------------|----------|
| **Local stdio** | Cursor, OpenCode, Claude Desktop on your machine | `python -m mcp_server` → loopback `:8001` |
| **Public Render `/mcp`** | ChatGPT/Codex/Responses API; ledger can be on Render Disk | `https://YOUR-SERVICE.onrender.com/mcp` |
| **Secure MCP Tunnel** | Memoryboard must stay **private** (localhost, LAN, no public ingress) | OpenAI-hosted tunnel → `tunnel-client` on your host |

You **do not** need Secure MCP Tunnel if a public HTTPS `/mcp` on Render is
acceptable. Use the tunnel when the Continuity Ledger must never be exposed to
the public internet.

**Plan note:** ChatGPT **Plus** does not support custom MCP apps. **Pro+** or
Business/Edu with **developer mode** is required for remote MCP and tunnel apps.

Canonical repo paths (either works):

- Mandala mirror: `jarvis-memoryboard/` in Mandala-Rendering-Software
- Deploy SoT: `/home/jon/dev/persistence-memory` → `warheart1984-ctrl/persistence-memory`

### Path A — Public Render `/mcp` (no tunnel)

See [DEPLOY_RENDER.md](./DEPLOY_RENDER.md). After deploy:

1. Settings → Apps → Advanced → **Developer mode**
2. Apps → **Create** → Connection: **Remote MCP**
3. URL: `https://YOUR-SERVICE.onrender.com/mcp`
4. Auth: **Bearer token** → `EMR_RECALL_API_KEY`
5. **Scan Tools** → expect **`emr_recall`**, **`emr_remember`**, **`emr_upsert`**
   (writes refuse unless `JARVIS_MCP_WRITE_ENABLED=true`)

Smoke test:

```bash
curl -s -X POST https://YOUR-SERVICE.onrender.com/mcp \
  -H "Authorization: Bearer $EMR_RECALL_API_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Path B — Secure MCP Tunnel (private memoryboard)

ChatGPT cannot reach `127.0.0.1`. Run **tunnel-client** on a host that can
reach your private MCP server; it opens **outbound-only** HTTPS to OpenAI.

```
ChatGPT / Responses API
        │
        ▼
OpenAI tunnel control plane (tunnel_id)
        │  long-poll (outbound from your network)
        ▼
tunnel-client  ──stdio or HTTP──►  MCP emr_recall  ──►  memoryboard :8001
```

**Download:** [openai/tunnel-client releases](https://github.com/openai/tunnel-client/releases)
(current public release: **v0.0.13** — always prefer the latest release page over
hard-coded asset URLs).

**Permissions (Platform):**

| Action | Role |
|--------|------|
| Create/edit tunnel | Tunnels **Read + Manage** |
| Run `tunnel-client` / select tunnel in ChatGPT | Tunnels **Read + Use** |
| ChatGPT developer-mode apps | Workspace admin enables developer mode separately |

Associate the tunnel with **both** the Platform org and the **ChatGPT workspace**
that will create the app, or the tunnel will not appear in ChatGPT.

#### B1 — Tunnel to local stdio MCP (recommended for private ledger)

Terminal 1 — memoryboard (loopback only):

```bash
cd jarvis-memoryboard   # or /home/jon/dev/persistence-memory
. .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Terminal 2 — tunnel-client (keep running):

```bash
cd jarvis-memoryboard   # same repo; needs pip install -e ".[dev]"
export CONTROL_PLANE_API_KEY="sk-..."   # runtime API key for tunnel-client
export JARVIS_MEMORYBOARD_URL="http://127.0.0.1:8001"
# export EMR_RECALL_API_KEY="..."       # only if local memoryboard requires it

tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile jarvis-emr \
  --tunnel-id tunnel_XXXX \
  --mcp-command "python -m mcp_server"

tunnel-client doctor --profile jarvis-emr --explain
tunnel-client run --profile jarvis-emr
```

`python -m mcp_server` and `python -m mcp_server.emr_stdio` are equivalent
(`__main__.py` delegates to `emr_stdio`).

Admin UI (loopback): `http://127.0.0.1:<admin-port>/ui` — confirm healthy/ready
before testing from ChatGPT.

#### B2 — Tunnel to local HTTP `/mcp`

Use when memoryboard is already running with Streamable HTTP on loopback:

```bash
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile jarvis-emr-http \
  --tunnel-id tunnel_XXXX \
  --mcp-server-url "http://127.0.0.1:8001/mcp"
```

If `EMR_RECALL_API_KEY` is set, configure tunnel-client / Harpoon MCP-side auth
per [tunnel-client docs](https://github.com/openai/tunnel-client) so requests
include `Authorization: Bearer …`.

#### Register in ChatGPT (Tunnel connection)

1. Keep `tunnel-client run --profile jarvis-emr` healthy
2. ChatGPT → Plugins → **+** → Create developer-mode app
3. Connection: **Tunnel** (not Remote MCP URL)
4. Select your tunnel (or paste `tunnel_id`)
5. Scan tools → **`emr_recall`** (+ write tools if MCP write flag enabled)
6. New chat → select app → e.g. “Recall my image-generation preferences”

### Path C — Responses API (public `/mcp`)

Test without the ChatGPT UI using the `mcp` built-in tool:

```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5.6",
    "tools": [
      {
        "type": "mcp",
        "server_label": "jarvis-emr",
        "server_description": "Governed EMR memory (recall + optional draft writes).",
        "server_url": "https://YOUR-SERVICE.onrender.com/mcp",
        "authorization": "'"$EMR_RECALL_API_KEY"'",
        "allowed_tools": ["emr_recall"],
        "require_approval": "always"
      }
    ],
    "input": "Recall my image-generation preferences from the continuity ledger."
  }'
```

Expect `mcp_list_tools` with `emr_recall` (and write tools when enabled), then `mcp_call`
with the governed bundle. Re-send `authorization` on every request (not stored by the API).
For write tools, keep `require_approval: always` and only enable `JARVIS_MCP_WRITE_ENABLED`
on private/staging hosts.

For **tunnel-backed** testing via API, use the tunnel target exposed by your
Platform tunnel settings instead of `server_url`.

### OpenAI security notes

- Public Render defaults: recall on, MCP writes **off** (`JARVIS_MCP_WRITE_ENABLED=false`).
- Writes require `user_requested=true`, force `status=draft`, and may abstain on conflicts / Clause V dumps.
- Do **not** expose unrestricted PATCH/DELETE via MCP.
- Bind local memoryboard to `127.0.0.1` unless you intend LAN exposure.
- Treat `EMR_RECALL_API_KEY` and tunnel credentials as secrets; rotate if leaked.
- `/api/jarvis/tools` is an OpenAI-style function catalog, **not** MCP transport.

---

## Direct HTTP (no MCP)

Agents that support OpenAI function calling can call the REST API directly:

```bash
curl -sX POST http://127.0.0.1:8001/api/jarvis/tools/emr_recall \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "image_generation",
    "query": "fantasy portrait epic dragon",
    "subjects": ["image-signature"],
    "max_memories": 8
  }'
```

Tool catalog:

```bash
curl -s http://127.0.0.1:8001/api/jarvis/tools
```

---

## Verification

```bash
cd jarvis-memoryboard
. .venv/bin/activate
pytest tests/test_emr*.py -q
```

Expected: all EMR + MCP tests pass (52+ tests).

---

## Related docs

- [EMR_RECALL_PROTOCOL.md](./EMR_RECALL_PROTOCOL.md) — protocol schema and examples
- [CONSTITUTIONAL_MEMORY_CONTRACT.md](./CONSTITUTIONAL_MEMORY_CONTRACT.md) — ledger contract
- [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) — host memoryboard + remote `emr_recall` on Render
