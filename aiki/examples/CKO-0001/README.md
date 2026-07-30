# Canonical example: CKO-0001

**Status:** skeleton / ready-for-script  
**Role:** End-to-end example **and** regression reference for RBC-0001

This folder is the practical companion to `knowledge/objects/CKO-0001.yaml`. Contributors should be able to see the flow:

`input/` → (pipeline / human production) → `output/` → `replay/` + `archive/published/CKO-0001/`

| Path | Purpose |
|------|---------|
| [`input/`](input/) | Pipeline-ready inputs (CKO pointer/copy, script, visual plan, metadata) |
| [`output/`](output/) | Published artifacts land here after first YouTube publish (empty until then) |
| [`replay/`](replay/) | Checklist + expected hash list for `aiki replay CKO-0001` / reproducibility tests |

## Commands

```bash
python aiki/pipeline/cli.py replay CKO-0001
python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
```

## Accuracy note

CKO-0001 is **not** claimed published or YouTube-live. Lifecycle: **ready-for-script**. RBC remains **not frozen** until archive hashes exist.
