# Photoreal Governance Dashboard Specification (PGDS) v1.0

| Field | Value |
|-------|-------|
| **Artifact class** | CPE-PGDS-PHR |
| **Status** | Spec **declared** · API server **partial** |
| **Module** | `dashboardServer.js` |
| **Transport** | Node `http` (no Express dependency) |

## Purpose

Live read-only view over governed-run directories:

- PEP / SPR completeness
- FPEC eligibility
- CPCS certification
- DRE dual-run status
- CAT-PHR verdicts
- Checklist summaries

## API

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/runs` | `{ runs: [...] }` summary rows |
| GET | `/api/run/:id` | Full `cel` / `cpcs` / `fpec` / `dre` / `audit` / `checklist` |
| GET | `/` | Minimal static HTML table (optional) |

## How to run

```bash
# Point at a directory whose children are run folders (or a single run's parent)
npm run mrs:photoreal-dashboard -- --base-dir tmp/blender-10s-test/governed-render --port 4000
```

Open `http://127.0.0.1:4000/` for the HTML summary, or call the JSON APIs directly.

`baseDir` should contain run directories such as `587f836fc789a003/` with `fpec.json` / `cel.json` / `cpcs.json` etc.
