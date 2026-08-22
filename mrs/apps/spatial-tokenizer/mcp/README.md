# HoloRT4D Spatial Tokens — MCP Server

ChatGPT / Codex plugin surface for **HoloRT4D-Spatial-V1** tokens. Tools only (no custom UI).

| Item | Value |
|------|--------|
| Package | `@mrs/holort4d-spatial-mcp` |
| Server name | `holort4d-spatial` |
| Version | `1.0.0` |
| Transport | Streamable HTTP `POST /mcp` |
| Default port | `8793` |

## Status (honest tags)

| Capability | Status |
|------------|--------|
| Depth grid → Spatial-V1 (`tokenizeFromDepthGrid`) | **enforced** |
| Canonical SHA-256 hash | **enforced** |
| Streamable HTTP MCP tools | **enforced** (this package) |
| Face labels / motion from prev depth | **partial** |
| `image_base64` grayscale pseudo-depth | **partial** |
| Photo → metric depth (ML) | **declared** |
| Rate limit | **declared** stub (~120/min) |
| Billing | **declared** (not charged; no keys in results) |
| Custom ChatGPT UI / widget | **skeleton** (none yet) |

Math SoT: `mrs/packages/renderer-core/.../holort4d/spatial-tokens/`. FastAPI stub at `mrs/apps/spatial-tokenizer/` may coexist; **this MCP is the ChatGPT surface**.

## Tools

| Tool | Role |
|------|------|
| `spatial_tokenize` | Depth / pseudo-image / synthetic → Spatial-V1 JSON + hash |
| `get_spatial_scheme` | Scheme field docs + status tags |
| `verify_spatial_hash` | Recompute hash; optional match check |
| `list_spatial_modes` | `face` \| `room` \| `object` guidance |
| `tokenize_chamber_frame` | Sandboxed `output/**/*.bin` chamber tape |

Annotations: all tools `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

Optional skills resource: `skill://holort4d-spatial/spatial-token-usage/SKILL.md` (+ `skill://index.json` with SHA-256 digest).

## Run

```bash
cd mrs/apps/spatial-tokenizer/mcp
npm install
npm start
# or: npm run dev
```

Health: `GET http://localhost:8793/health`  
MCP: `POST http://localhost:8793/mcp`

Env: `PORT` or `HOLORT4D_SPATIAL_MCP_PORT` (default `8793`).

## MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect with **Streamable HTTP** → `http://localhost:8793/mcp`.

## ChatGPT developer mode

1. Start this server (public URL or tunnel if needed).
2. In ChatGPT → Settings → Connectors / Developer mode → add MCP server.
3. URL: `https://YOUR_HOST/mcp` (Streamable HTTP).
4. Confirm tools appear; try `list_spatial_modes` then `spatial_tokenize` with synthetic (omit depth) or a small depth array.

## Tests

```bash
npm test
```

Smoke test registers tools and calls `spatial_tokenize` with synthetic depth (no Inspector required).

## Security

- Inputs validated with Zod.
- No API keys or secrets in tool results.
- `tokenize_chamber_frame` paths must resolve under repo `output/`.
- Rate limit is a **declared** in-process stub.
