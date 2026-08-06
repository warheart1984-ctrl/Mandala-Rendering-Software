# MRS MCP (Model Context Protocol) Setup Guide

> **Source**: Dar-z Morris integration notes  
> **Branch**: `feat/mcp-001-scaffold` (merge or reference SHA)  
> **Last Updated**: 2026-08-05

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.12+ | Required for MCP server |
| Node.js | 22+ | For frontend/build tooling |
| uv | latest | Fast Python package manager |
| Docker Desktop | latest | For MRS API container |
| Git | latest | Version control |

---

## Installation

```bash
# Clone repository
git clone <repo-url>
cd Mandala-Rendering-System-MRS

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate    # Windows PowerShell

# Upgrade pip and install core dependencies
python -m pip install --upgrade pip
python -m pip install \
    "mcp==1.29.0" \
    fastapi \
    uvicorn \
    httpx

# Install MRS as editable package (REQUIRED for MCP)
python -m pip install -e .
```

> **Important**: Do **not** remove `pyproject.toml`. It enables `pip install -e .` which is required for MCP to discover the package.

---

## Project Layout

```
Mandala-Rendering-System-MRS/
├── mrs/
│   ├── app/              # FastAPI application
│   ├── adapters/         # Runtime adapters
│   ├── packages/         # Internal packages
│   └── mcp/
│       ├── client.py     # MCP client
│       └── server.py     # MCP server (FastMCP)
├── conformance/          # Conformance framework
├── docs/                 # Documentation (add MCP_SETUP.md here)
├── scripts/
│   └── test-conformance.sh
└── pyproject.toml        # Package config (keep this!)
```

---

## Running MRS (Docker)

```bash
# Build image
docker build -t mrs:test .

# Run container
docker run \
    -p 8000:8000 \
    mrs:test
```

### Verify MRS Health

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl http://localhost:8000/version
```

**Expected `/ready` response:**
```json
{
  "status": "ready",
  "ready": true
}
```

---

## Running MCP Server

```bash
# Activate venv
source .venv/bin/activate

# Run MCP server (stays running)
mcp run mrs/mcp/server.py
```

### Open MCP Inspector

```bash
# In a separate terminal
source .venv/bin/activate
mcp dev \
    -e . \
    mrs/mcp/server.py
```

**Inspector should show:** `Connected`

---

## Current MCP Tools

| Tool | Description |
|------|-------------|
| `health()` | Check service health |
| `ready()` | Check readiness |
| `version()` | Get version info |

These map to the FastAPI endpoints: `/health`, `/ready`, `/version`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MRS_BASE_URL` | `http://localhost:8000` | MRS API base URL |
| `MRS_BASE_URL` | `https://<cloudflare-url>` | Cloudflare tunnel URL (optional) |

```bash
export MRS_BASE_URL=http://localhost:8000
# Or for cloudflare:
export MRS_BASE_URL=https://xxxxx.trycloudflare.com
```

---

## Cloudflare Tunnel (Optional)

Expose local MRS to internet for remote MCP clients:

```bash
# Start tunnel
cloudflared tunnel --url http://localhost:8000
# Output: https://xxxxx.trycloudflare.com

# Set env var
export MRS_BASE_URL=https://xxxxx.trycloudflare.com
```

---

## ChatGPT MCP Integration

Configure ChatGPT to use MRS via MCP:

**Command:** `uv`  
**Arguments:**
```
run
--with
mcp
--with-editable
/path/to/Mandala-Rendering-System-MRS
mcp
run
mrs/mcp/server.py
```

Replace `/path/to/Mandala-Rendering-System-MRS` with the actual absolute path.

---

## Core Files Reference

These are the essential files for understanding/reproducing the integration:

| File | Purpose |
|------|---------|
| `pyproject.toml` | Package configuration (editable install) |
| `mrs/mcp/server.py` | FastMCP server definition |
| `mrs/mcp/client.py` | MCP client utilities |
| `mrs/apps/genblaze-media/app/main.py` | Example FastAPI app |
| `scripts/test-conformance.sh` | Conformance test runner |
| `conformance/` | Conformance framework |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: mrs` | Run `pip install -e .` from repo root |
| MCP Inspector shows disconnected | Ensure `mcp run` is running in another terminal |
| Docker port 8000 conflict | Stop other services on 8000 or change port |
| Cloudflare tunnel fails | Check `cloudflared` is installed and authenticated |
| ChatGPT can't connect | Verify `MRS_BASE_URL` matches running server URL |

---

## Current Status (as of 2026-08-05)

- ✅ FastAPI operational contract (`/health`, `/ready`, `/version`)
- ✅ Docker build & run
- ✅ Conformance framework
- ✅ MCP Inspector connected
- ✅ Python editable package install
- ✅ FastMCP integration

---

## Next Steps

1. **Merge `feat/mcp-001-scaffold`** into main or note commit SHA
2. **Extend MCP tools** beyond health/ready/version (render, DEP, SME, etc.)
3. **Add authentication** to MCP server for production
4. **Document tool schemas** in `docs/MCP_TOOLS.md`
5. **Wire MCP into desktop app** (chat ingest, render triggers)

---

## Quick Reference Card

```bash
# One-liner to start everything locally
cd Mandala-Rendering-System-MRS && \
docker build -t mrs:test . && \
docker run -d -p 8000:8000 --name mrs-api mrs:test && \
sleep 3 && \
source .venv/bin/activate && \
mcp run mrs/mcp/server.py
```

Then in another terminal:
```bash
source .venv/bin/activate
mcp dev -e . mrs/mcp/server.py
```