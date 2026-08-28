# EMR Recall Protocol (tool boundary v1)

**Electrom-Matic Recall** exposed as a read-only callable tool for any agent host
(GPT, Codex, Cursor, OpenCode, local Llama, JARVIS, etc.).

## Flow

```
User → Assistant → emr_recall tool → Continuity Ledger → EMR excite → bundle → context
```

## v1 surface

| Tool | Policy | Status |
|------|--------|--------|
| `emr_recall` | **READ** — governed bundle, no LTM mutation | **enforced** |
| `emr_remember` | **WRITE draft** — create via EMR gate | **partial** (`JARVIS_MCP_WRITE_ENABLED`) |
| `emr_upsert` | **WRITE draft** — supersede with lineage | **partial** (`JARVIS_MCP_WRITE_ENABLED`) |

## Example call

```json
POST /api/jarvis/tools/emr_recall
{
  "intent": "image_generation",
  "query": "Create a fantasy portrait",
  "subjects": ["image-signature", "creative-style"],
  "max_memories": 8
}
```

Structured intent (recall wave):

```json
{
  "intent": {
    "operation": "image_generation",
    "domain": "creative",
    "project": null,
    "authority_required": "user_preferences"
  },
  "query": "fantasy portrait epic dragon"
}
```

## Example response

```json
{
  "protocol": "emr-recall-v1",
  "bundle": [
    {
      "memory_id": "mem-…",
      "content": "All generated images must be signed J Halstead bottom-right unless explicitly overridden.",
      "subject": "image-signature",
      "type": "preference",
      "status": "verified",
      "confidence": 0.95,
      "activation": 0.97,
      "tags": ["creative", "image"]
    }
  ],
  "abstained": false,
  "abstention_reason": null,
  "conflicts": [],
  "provenance": [
    {
      "memory_id": "mem-…",
      "recalled_because": [
        "verified ledger record",
        "image_generation operation",
        "strong subject match"
      ],
      "activation": 0.97,
      "components": { "Q": 0.4, "P": 0.95, "A": 0.97 }
    }
  ],
  "recall_summary": ["✓ verified ledger record", "✓ strong subject match"]
}
```

## Tool catalog

`GET /api/jarvis/tools` returns OpenAI-compatible function schemas for agent registration.

## MCP adapter (assistant hosts)

Stdio MCP server proxies `emr_recall` to the HTTP API above. See
[docs/MCP_EMR_SETUP.md](./MCP_EMR_SETUP.md) for Cursor, OpenCode, and ChatGPT
(Secure MCP Tunnel) setup.

```bash
JARVIS_MEMORYBOARD_URL=http://127.0.0.1:8001 python -m mcp_server
```

## Write boundary

```
READ     → emr_recall (broadly allowed when auth permits)
WRITE    → emr_remember / emr_upsert (JARVIS_MCP_WRITE_ENABLED + user_requested; draft-only)
VERIFY / DELETE → operator REST only (not via MCP)
```

Retrieval may affect activation. It must **never** silently alter LTM truth, authority, provenance, or content.
