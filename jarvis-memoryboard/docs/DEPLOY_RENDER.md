# Deploy Jarvis Memoryboard on Render

Host **EMR recall** (`emr_recall`) over HTTPS so ChatGPT and remote assistants
can call the Continuity Ledger without a local MCP tunnel.

| Component | Status |
|-----------|--------|
| Docker image + `render.yaml` | **live** (this doc) |
| Render Disk persistence | **live** (operator enables via blueprint) |
| `EMR_RECALL_API_KEY` gate on recall | **live** (`app/auth.py`) |
| Public write endpoints | **disabled** by default (`JARVIS_MEMORY_WRITE_ENABLED=false`) |
| HTTP MCP transport on Render | **declared** — use REST `POST /api/jarvis/tools/emr_recall` or local stdio MCP |

## Architecture

```
Remote client (ChatGPT Action, curl, hosted MCP bridge)
    → https://jarvis-memoryboard.onrender.com/api/jarvis/tools/emr_recall
    → EMR excite → Continuity Ledger (/var/data/jarvis-store.json)
```

Local dev unchanged: stdio MCP → loopback HTTP.

## Prerequisites

1. [Render](https://render.com) account
2. **Starter plan** (or higher) — free tier has no persistent disk and cold-start limits
3. Git repo with `jarvis-memoryboard/` at root (e.g. `warheart1984-ctrl/persistence-memory`)

## Deploy steps

### 1. Create Web Service from blueprint

**Option A — Blueprint**

```bash
# From repo root containing jarvis-memoryboard/render.yaml
render blueprint launch
```

**Option B — Dashboard**

1. New → Web Service → connect repo
2. Root directory: `jarvis-memoryboard` (if monorepo)
3. Runtime: Docker
4. Add **Persistent Disk**: mount `/var/data`, 1 GB
5. Health check path: `/health`

### 2. Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `EMR_RECALL_API_KEY` | **yes** (public) | — | Generate: `openssl rand -hex 32` |
| `JARVIS_STORE_PATH` | yes | `/var/data/jarvis-store.json` | Must live on Render Disk |
| `JARVIS_EMR_DYNAMICS_PATH` | recommended | `/var/data/emr-dynamics.json` | Reinforcement overlay |
| `JARVIS_MEMORY_WRITE_ENABLED` | recommended | `false` | Blocks POST/PATCH/DELETE on ledger |
| `JARVIS_PROTECT_LEDGER_READ` | recommended | `true` (Render) | Requires API key for `GET /api/jarvis/memory/*` |
| `JARVIS_CORS_ORIGINS` | optional | `*` | Restrict in production |
| `PORT` | auto | Render injects | Do not override |

### 3. Seed the ledger (optional)

After first deploy, import a snapshot:

```bash
curl -X POST "https://YOUR-SERVICE.onrender.com/api/jarvis/memory" \
  -H "Authorization: Bearer $ADMIN_KEY" ...
```

With `JARVIS_MEMORY_WRITE_ENABLED=false`, seeding requires temporarily enabling writes
or uploading `jarvis-store.json` via Render shell:

```bash
render ssh jarvis-memoryboard
# copy bundle seed to /var/data/jarvis-store.json
```

### 4. Verify

```bash
curl -s https://YOUR-SERVICE.onrender.com/health | jq
# expect: emr_recall_key_required: true, memory_write_enabled: false, deployment: render

curl -s -X POST https://YOUR-SERVICE.onrender.com/api/jarvis/tools/emr_recall \
  -H "Authorization: Bearer $EMR_RECALL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intent":"code","query":"EMR release bundle","max_memories":5}'
```

## ChatGPT / remote clients

**REST (live on Render):** Custom GPT Action or OpenAPI tool pointing at
`POST /api/jarvis/tools/emr_recall` with Bearer auth.

**MCP stdio (local):** Point `JARVIS_MEMORYBOARD_URL` at your Render URL and set
`EMR_RECALL_API_KEY` in the MCP server env (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jarvis-emr": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "cwd": "/path/to/jarvis-memoryboard",
      "env": {
        "JARVIS_MEMORYBOARD_URL": "https://YOUR-SERVICE.onrender.com",
        "EMR_RECALL_API_KEY": "your-key"
      }
    }
  }
}
```

**ChatGPT native MCP connector:** Still **declared** — needs HTTPS MCP transport
(not shipped in v1). Use REST Action or Secure MCP Tunnel to local stdio.

## Security notes

- With `JARVIS_PROTECT_LEDGER_READ=true` and `EMR_RECALL_API_KEY` set, all
  `GET /api/jarvis/memory/*` routes require the same operator key as recall.
  `/health`, `/`, and `GET /api/jarvis/tools` stay public.
- Never commit `EMR_RECALL_API_KEY` to git — Render secret only.
- Treat the hosted ledger as **operator-controlled corpus**, not multi-tenant.

## Local Docker smoke test

```bash
cd jarvis-memoryboard
docker build -t jarvis-memoryboard .
docker run --rm -p 8001:8001 \
  -e EMR_RECALL_API_KEY=test-key \
  -e JARVIS_STORE_PATH=/tmp/jarvis-store.json \
  -e JARVIS_MEMORY_WRITE_ENABLED=false \
  jarvis-memoryboard
```

## Rebuild release bundle after deploy

Update bundle manifest with hosted URL + auth mode when publishing to Zenodo.

```bash
python scripts/build-emr-bundle.py
```
