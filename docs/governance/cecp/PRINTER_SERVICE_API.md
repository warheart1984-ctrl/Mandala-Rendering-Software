# Printer Service API — `/printer` contract

> **Status:** **partial** — HTTP routes enforced in Genblaze tests; live execute
> opt-in via `PRINTER_API_ENABLED=1`. MCP = capability stubs (**skeleton**).  
> **App:** `mrs/apps/genblaze-media`  
> **Provider:** `app/printer_provider.py`  
> **Trail:** `digital-printer-v2-2026-07` (prior: `printer-mode-renderer-2026-07`)

## Base URL

`/printer`

## Endpoints

### `GET /printer/health`

Deterministic health (no execute). Also mirrored under main `GET /health` → `printer`.

### `POST /printer/print`

Runs the deterministic print pipeline.

**Query:** `dry_run=true` — sovereignty + evidence only (no Node).

**Env:** `PRINTER_API_ENABLED=1` required for live execute; `MRS_PRINT_TIMEOUT_SECONDS` (fallback `MRS_RENDER_TIMEOUT_SECONDS`, default 900).

**Body (RenderRequest):** full RenderRequest JSON (preferred).

**Body (compact):**

```json
{
  "scene": { "...SceneSpecification..." },
  "surfaces": { "aovs": ["beauty"] },
  "samples": 16,
  "quality": "print_hq",
  "denoise": true,
  "softPenumbra": true
}
```

**Quality profiles (all enforced params):** `print_fast` | `print_hq` | `print_cinematic` | `print_reference`

| Profile | dims | spp | depth | denoise | softPenumbra |
|---------|------|-----|-------|---------|--------------|
| print_fast | 256² | 8 | 4 | false | false |
| print_hq (default) | 512² | 24 | 6 | true | true |
| print_cinematic | 768² | 48 | 8 | true | true |
| print_reference | 768² | 64 | 10 | true | true |

### Quality then speed (operator guidance)

Prefer quality first, then accept wall-clock as ops — there is no free Monte Carlo lunch.

1. Smoke / intake: `print_fast`
2. Delivery default: `print_hq`
3. Higher plate quality: `print_cinematic` → `print_reference`
4. Keep `seed` fixed when comparing profiles
5. Do not silently lower `samples` to “feel fast”; use a lower named profile instead

Design / plan:

- `docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`
- `docs/superpowers/plans/2026-07-28-digital-printer-gpu-quality-speed.md`
- Trail: `docs/governance/cecp/trails/printer-gpu-quality-speed-2026-07/`

Default `backend` is `cpu` (SoT). Ungated `webgpu` / `cuda` / `hip` are rejected until parity receipts exist.

**Response:**

```json
{
  "beauty": "<base64 or null on dry-run>",
  "evidence": { },
  "lineage": { },
  "hash": "sha256-..."
}
```

### `POST /printer/validate`

Validates surface contract + SceneSpec / RenderRequest.

```json
{ "ok": true, "violations": [] }
```

### `POST /printer/provenance`

Returns evidence / lineage / provenance frames for a print or dry-run.

## MCP capabilities (skeleton)

File: `mrs/apps/genblaze-media/app/printer_mcp_capabilities.json`

| Capability | HTTP |
|------------|------|
| `printer.print_surface` | `POST /printer/print` |
| `printer.validate_scene` | `POST /printer/validate` |
| `printer.get_evidence` | `POST /printer/provenance` |
| `printer.get_lineage` | `POST /printer/provenance` |

## Deploy notes

- Root `Dockerfile` must COPY `storyforge-boundary/printer/` + `governance/` + `run_print.py`.
- Render Blueprint (`render.yaml`): set `PRINTER_API_ENABLED=1`.
- Preferred health check path for printer service: `/printer/health` (also under `/health`).
- **Render MCP:** not available in this Cursor session — deploy via dashboard / CLI; do not fake a live URL.
