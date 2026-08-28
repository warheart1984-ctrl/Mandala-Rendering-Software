# EMR Recall MCP Adapter

Expose the Jarvis **EMR Recall Protocol** (`emr_recall`) to assistant hosts
(Cursor, OpenCode, ChatGPT, Claude Desktop, etc.) via the Model Context Protocol.

## Live vs declared (status tags)

| Capability | Tag | When it works | Evidence |
|------------|-----|---------------|----------|
| `POST /api/jarvis/tools/emr_recall` on loopback | **live** | Memoryboard running on `127.0.0.1:8001` | `tests/test_emr_tool.py`, `tests/test_emr_mcp.py` |
| MCP stdio adapter (`python -m mcp_server`) | **live** | Same host as memoryboard; stdio process can reach `:8001` | `tests/test_emr_mcp.py::test_tools_call_proxies_to_http` |
| Cursor / OpenCode local MCP wiring | **live** (operator) | Host config points `cwd` at `jarvis-memoryboard` + memoryboard up | `config/mcp-cursor.example.json`, `.opencode/config.json` |
| ChatGPT remote connector without tunnel | **declared** | Not reachable — ChatGPT cannot call `localhost` | Documented only |
| ChatGPT via Secure MCP Tunnel | **declared** (operator) | Tunnel bridges stdio MCP → HTTPS; memoryboard still local on `:8001` | This doc + OpenAI tunnel docs; not CI-tested |
| Write path (`POST /api/jarvis/memory`) via MCP | **declared** | Not exposed in MCP v1 (read-only by design) | `docs/EMR_RECALL_PROTOCOL.md` |

## Architecture

```
User → Assistant host → MCP emr_recall tool
                            ↓ (stdio JSON-RPC)
                     mcp_server/emr_stdio.py
                            ↓ (HTTP POST)
              http://127.0.0.1:8001/api/jarvis/tools/emr_recall
                            ↓
                     EMR excite → Continuity Ledger bundle
```

The MCP adapter is a thin **read-only proxy**. It does not write to the ledger.

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

### Tool surface

| MCP tool | HTTP equivalent | Policy |
|----------|-----------------|--------|
| `emr_recall` | `POST /api/jarvis/tools/emr_recall` | **READ** — governed bundle |

Tool catalog (OpenAI function schemas): `GET /api/jarvis/tools`

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

## ChatGPT (remote MCP + Secure MCP Tunnel)

**Status: declared (operator-dependent).** ChatGPT runs in OpenAI's cloud and
cannot reach your `127.0.0.1:8001` memoryboard or a local stdio MCP process
directly. Remote integration requires **OpenAI's Secure MCP Tunnel** (or an
equivalent TLS bridge) on a machine that *can* reach both the tunnel egress
and your local memoryboard.

Official reference: [OpenAI MCP documentation](https://platform.openai.com/docs/mcp)
(includes Secure MCP Tunnel setup; exact CLI/package name may vary by release).

### Why a tunnel is required

```
ChatGPT (cloud) ──HTTPS──► Secure MCP Tunnel ──stdio──► mcp_server ──HTTP──► :8001 memoryboard
                              ▲
                              └── must run on your LAN/VPN host (not in ChatGPT)
```

Without the tunnel, adding a `localhost` URL in ChatGPT **will not work** — that
path is **declared** documentation only until you operate the bridge.

### Step-by-step (operator)

1. **Start memoryboard locally** (loopback only):

```bash
cd jarvis-memoryboard
. .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

2. **Verify HTTP recall works on the same machine:**

```bash
curl -s http://127.0.0.1:8001/api/jarvis/tools | head
curl -sX POST http://127.0.0.1:8001/api/jarvis/tools/emr_recall \
  -H "Content-Type: application/json" \
  -d '{"intent":"general","query":"continuity ledger","max_memories":3}'
```

3. **Install / authenticate OpenAI Secure MCP Tunnel** per
   [platform.openai.com/docs/mcp](https://platform.openai.com/docs/mcp).

4. **Launch tunnel with stdio MCP subprocess** (pattern — adjust flags to your
   OpenAI CLI version):

```bash
cd "/media/jon/New Volume/Mandala Rendering Software/jarvis-memoryboard"
export JARVIS_MEMORYBOARD_URL=http://127.0.0.1:8001

# Example pattern (exact command from OpenAI docs):
# openai-mcp-tunnel \
#   --name jarvis-emr \
#   --command python \
#   --arg -m --arg mcp_server \
#   --cwd "$(pwd)"
```

The tunnel should spawn `python -m mcp_server` and expose an **HTTPS URL**
ChatGPT can register.

5. **Register in ChatGPT:** Settings → Connectors → Add MCP server → paste
   the tunnel-provided HTTPS endpoint (not `http://127.0.0.1:8001`).

6. **Smoke test in ChatGPT:** invoke `emr_recall` with a query you know exists
   in the ledger. If memoryboard is down, the tool fails even when the tunnel
   is up — keep Terminal 1 running.

### Security notes

- Tunnel exposes **read-only** `emr_recall` only (MCP v1).
- Do **not** expose `POST /api/jarvis/memory` or other write routes through MCP.
- Bind memoryboard to `127.0.0.1`, not `0.0.0.0`, unless you understand LAN exposure.
- Treat the tunnel URL as a secret capability URL; rotate if leaked.

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
