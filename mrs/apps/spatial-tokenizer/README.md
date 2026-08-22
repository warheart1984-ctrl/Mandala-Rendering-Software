# HoloRT4D Spatial Tokenizer (API stub + MCP)

CPU-only FastAPI scaffold for `POST /v1/spatial-tokenize`, plus a **ChatGPT/Codex MCP** surface.

| Capability | Status |
|------------|--------|
| Depth grid → Spatial-V1 token (via Node CLI) | **enforced** (math core) |
| MCP Streamable HTTP (`mcp/`) | **enforced** tools; UI **skeleton** |
| API / OpenAPI surface | **partial** |
| Billing `$1`/call | **declared** (not charged) |
| `image_base64` → metric depth | **declared** |

## MCP (ChatGPT / Codex)

```bash
cd mrs/apps/spatial-tokenizer/mcp
npm install && npm start
```

See [`mcp/README.md`](./mcp/README.md). Inspector: Streamable HTTP → `http://localhost:8793/mcp`.

## FastAPI stub

```bash
cd mrs/apps/spatial-tokenizer
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8792
```

Health: `GET http://localhost:8792/health`

## Prefer CLI for local determinism

```bash
node scripts/holort4d-tokenize.mjs --depth-bin path/to/depth.f32.bin --width 64 --height 64
```
