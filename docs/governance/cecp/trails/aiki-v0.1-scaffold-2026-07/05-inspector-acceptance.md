# 05 — Inspector Acceptance

**Role:** Inspector · **Profile:** Scientist · **Mode:** Testwright  
**Status:** partial

## Acceptance criteria

| Check | Result |
|-------|--------|
| `aiki/` tree exists with math nested | PASS (implementation) |
| CKO-0001 + MATH 0001–0005 present | PASS |
| Constitution linked from README + RBC | PASS |
| `cli.py test-reproducibility --cko CKO-0001` reports NOT FROZEN / structure PASS | RUN in implementor verification |
| No false **enforced** claim | PASS |

## Evidence

Run from repo root:

```bash
python aiki/pipeline/cli.py replay CKO-0001
python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
```
