# 02 — Builder scaffold manifest

**Trail:** `vendor-skills-fixup-2026-07`  
**Cites:** `01-architect-adr.md`

## 1. Intent

Create operator tooling scaffolds and trail structure for vendor-skills fixup without expanding into unrelated refactors.

## 2. Scaffold manifest

| Path | Kind | Tag |
|------|------|-----|
| `scripts/check-nvidia-gpu-host.mjs` | check-only script | **partial** |
| `scripts/detect-gpu-backend.py` | detect script | **partial** |
| `docs/governance/cecp/trails/vendor-skills-fixup-2026-07/` | CECP trail | **declared**→**partial** |

## 3. Dependency graph

```
tao-setup skill (patterns)
    └── scripts/check-nvidia-gpu-host.mjs
            ├── nvidia-smi (optional)
            ├── ffmpeg -encoders (optional)
            └── docker info (optional)

rocm-setup / rocm-doctor (patterns)
    └── scripts/detect-gpu-backend.py
            ├── nvidia-smi / rocm-smi / rocminfo / hipInfo
            └── optional torch

dynamo-troubleshoot (layering only)
    └── app/nvidia_errors.nim_ops_checklist → GET /health
```

## 4. Build artifacts inventory

- No new npm packages
- No Docker image changes
- No HIP/CUDA native code (**absent**)

## 5. Test placeholders

- Extend `tests/test_api.py` (NIM help/checklist)
- Extend `cpu-gpu-comparison.test.js` (vendor honesty)

## 6. Handoff to Implementor

Fill script bodies, health wiring, tests, ESFR evidence.
