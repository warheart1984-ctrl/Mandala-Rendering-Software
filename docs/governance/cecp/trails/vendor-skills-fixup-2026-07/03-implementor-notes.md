# 03 — Implementor notes

**Trail:** `vendor-skills-fixup-2026-07`  
**Cites:** Architect ADR + Builder scaffold

## 1. Intent fulfilled

Implemented Genblaze NIM operator surfacing, check-only NVIDIA host probe, ROCm/CUDA detect scaffolding, and vendor honesty map — without claiming CUDA/HIP print SoT.

## 2. Files touched

| Path | Change |
|------|--------|
| `mrs/apps/genblaze-media/app/nvidia_errors.py` | `resolve_nvidia_help`, `nim_ops_checklist`, `next_step` on nim status |
| `mrs/apps/genblaze-media/app/main.py` | wire checklist + help into `/health` |
| `mrs/apps/genblaze-media/tests/test_api.py` | checklist + unavailable-help tests |
| `mrs/packages/renderer-core/src/render/rt4d/compare/printParity.js` | `probeVendorGpuHonesty` |
| `mrs/packages/renderer-core/scripts/test/cpu-gpu-comparison.test.js` | honesty assertions |
| `scripts/check-nvidia-gpu-host.mjs` | new |
| `scripts/detect-gpu-backend.py` | new |
| `.env.example` | NIM reliability + Lemonade knobs |
| `package.json` | `check:nvidia-gpu-host`, `detect:gpu-backend` |
| `docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md` | pointer to this trail |
| trail `00`–`06` | CECP artifacts |

## 3. Unit / integration tests

| Test | Enforces |
|------|----------|
| `test_health_includes_empty_504_policy` | `nim_ops_checklist` present |
| `test_resolve_nvidia_help_and_checklist` | help + layer order |
| `test_health_surfaces_nim_unavailable_help` | help when key+warmup 504 |
| existing empty-504 / warmup tests | regression |
| `vendor honesty map…` (node:test) | cuda/hip absent, cutile na |

## 4. Commands run + results

```text
.\.venv\Scripts\python.exe -m pytest (5 NIM health/help tests) → 5 passed
node --test cpu-gpu-comparison.test.js → 23 pass / 0 fail
node scripts/check-nvidia-gpu-host.mjs --json → honest partial/absent report
python scripts/detect-gpu-backend.py --json → primary cpu; print paths absent
```

## 5. Status tag updates

| Claim | Tag |
|-------|-----|
| NIM empty-504 + warmup | **enforced** (tests) |
| `/health` nim_ops_checklist | **enforced** (tests) |
| NVIDIA host check script | **partial** |
| GPU backend detect | **partial** |
| CUDA/HIP print | **absent** |
| cuTile printer | **na** |
| WebGPU live Node print | **partial** (unchanged gap) |

## 6. Remaining gaps

- Live WebGPU `navigator.gpu` on Node still skip ≠ pass
- No driver install automation on this Windows operator host
- No HIP print implementation (correctly absent)
- Live Render NIM E2E not re-run in this trail (unit + scripts only)

## 7. Handoff to Reviewer

Confirm Drive-G-1 wording, no protected paths, tests green.
