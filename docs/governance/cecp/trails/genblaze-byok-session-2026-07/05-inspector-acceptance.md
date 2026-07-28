# 05 — Inspector acceptance

```
.\.venv\Scripts\python.exe -m pytest tests/test_byok.py -q
# 7 passed
```

Manual: open `http://127.0.0.1:8787/#byok-settings`, save session key, Generate still — expect `byok.byok_used` when key present (do not paste keys into chat/logs).
