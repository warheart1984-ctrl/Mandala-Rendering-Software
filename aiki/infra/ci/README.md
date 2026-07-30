# Optional CI note (skeleton)

After CKO-0001 is frozen, add a workflow step:

```bash
python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
```

Do not fail the MRS monorepo on NOT FROZEN during Phase-1 draft.
