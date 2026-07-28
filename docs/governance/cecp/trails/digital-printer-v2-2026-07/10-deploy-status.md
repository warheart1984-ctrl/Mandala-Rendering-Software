# Deploy — Digital Printer (Render)

**Trail:** `digital-printer-v2-2026-07`  
**Date:** 2026-07-28  
**Status:** **blocked** — Render MCP unavailable in Cursor session

## Attempted

1. `GetDynamicTools` pattern `render` → **no Render MCP namespace** in catalog.  
2. Available MCP: `cursor`, `cursor-app-control`, `cursor-ide-browser`, `plugin-figma-figma` (needsAuth).  
3. Therefore: **no live deploy URL** from this crew pass. Do not invent one.

## Prepared in-repo (no secrets)

| Artifact | Change |
|----------|--------|
| Root `Dockerfile` | COPY `printer/`, `governance/`, `run_print.py`; `PRINTER_API_ENABLED=1`; dry-run smoke |
| `render.yaml` | `PRINTER_API_ENABLED=1`, `PRINTER_PIPELINE_SCRIPT`, `MRS_PRINT_TIMEOUT_SECONDS` |
| Health | Prefer `/printer/health` (also mirrored under `/health`) |

## Operator steps (when Render MCP / dashboard available)

### Option A — Cursor MCP (preferred when available)

1. Add Render MCP to Cursor `mcp.json` (user/project):

```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer ${RENDER_API_KEY}"
      }
    }
  }
}
```

2. Create API key at Render Dashboard → Account Settings → API Keys (do **not** commit).  
3. Restart Cursor / re-auth MCP.  
4. Re-run crew Phase 3: create/deploy Docker web service from repo root Dockerfile with:
   - `PRINTER_API_ENABLED=1`
   - health check `/printer/health` (or `/health`)
   - no secrets in git

### Option B — Dashboard / Blueprint

1. Open Render Dashboard → Blueprint / existing `mandala-rendering-system-mrs` service.  
2. Confirm Root Directory empty, Dockerfile `./Dockerfile`.  
3. Sync env from `render.yaml` (including printer keys).  
4. Manual Deploy from PR `#83` branch tip.  
5. Verify: `GET https://<service>/printer/health` → `available: true`.

## Live URL

**None from this pass** — blocked on Render MCP / operator deploy.
