# 02 — Evidence

**Trail:** `printer-mode-renderer-2026-07`  
**Status:** **partial** (live demo evidence present; CSR/GK logs skeletal)

## Live print demo (repo output)

Path: `output/cecp-digital-print/`

| Artifact | Present | Notes |
|----------|---------|-------|
| `beauty.png` | yes | Copied to trail `06-print-plate.png` |
| `evidence.json` | yes | mrs-digital-print-evidence |
| `lineage.json` | yes | Demo lineage |
| `*.provenance.json` | yes | render-scene CLI provenance |
| CSR records | skeletal | See `04-csr-records.json` — **declared** until CSE emits live CSR |
| Governance decision logs | skeletal | See `03-governance-kernel-eval.md` |

## How to reproduce

```bash
python mrs/adapters/storyforge-boundary/demo_digital_print.py \
  --out-dir output/cecp-digital-print --samples 16
```

## Beauty hash (from demo evidence)

See `evidence.json` → `artifacts[beauty-png].sha256` and trail
`05-provenance-frames.json`.
