# 01 — Architect ADR: Digital Printer v2 (close HOLD gaps)

**Trail:** `digital-printer-v2-2026-07`  
**Stage:** Architect (CECP 01) — design-only  
**Branch:** `feat/engine3d-genblaze-cinematic-plugin` (PR #83)  
**Prior trail:** `printer-mode-renderer-2026-07` — initiative ESFR **HOLD**  
**softwareCreationMode:** Pipeline-Conductor + Boundary-Guardian  
**Status:** **declared** design → Implementor enforces

---

## Intent

Close four open §E promotion gaps from the prior printer trail with Drive-G-1
honest tags and named tests:

| Gap | Prior tag | v2 target |
|-----|-----------|-----------|
| Denoise | partial (opt-in) | **enforced** via quality-profile gate (CPU bilateral) |
| Soft penumbra | declared | **enforced** (deterministic soft area-light shadows) |
| RT4D specular on print path | partial (library only) | **enforced** on scene-spec → render-scene |
| Quality profiles | fast/hq enforced; cine/ref partial | All four **enforced** (deterministic params) |

## Scope

**In:** printer adapter, scene-spec convert/parse, render-scene, Genblaze
pass-through, named tests, this trail.  
**Out:** constitutional paths; GPU denoise; Unity/Unreal mesh SHA; live CSR
emission; proton Docker dual-layout (parallel agent — do not revert).

## ADR decision

1. **Denoise = quality-profile gated** — `print_fast` false; `print_hq` /
   `print_cinematic` / `print_reference` true. Explicit override wins.
2. **Soft penumbra** — `softPenumbra` + `penumbraLightSamples` on PrintRequest /
   qualityOpts; min light radius floors when enabled; seeded determinism.
3. **Specular** — SceneSpec `brdf`/`roughness`/`f0` → convert → render-scene GGX.
4. **Profiles** — lock params; statusTag `enforced` for all four (wall-clock is
   ops note, not non-determinism).

### Quality profile matrix (enforced params)

| Profile | dims | spp | depth | denoise | softPenumbra | penumbraLightSamples |
|---------|------|-----|-------|---------|--------------|----------------------|
| print_fast | 256² | 8 | 4 | false | false | 1 |
| print_hq | 512² | 24 | 6 | true | true | 4 |
| print_cinematic | 768² | 48 | 8 | true | true | 4 |
| print_reference | 768² | 64 | 10 | true | true | 8 |

## Anti-overclaim

- **Not** GPU denoise / commercial RIP / Unity sync / CSR as enforced.
- Soft penumbra = finite-radius area lights under print qualityOpts — not PCSS.
- Prior HOLD remains historical until this trail’s ESFR supersedes it.

## Handoff

Builder → Implementor → Reviewer → Inspector → ESFR

## Acceptance tests (named)

- `test_printer_mode.py` — profile locks + qualityOpts
- `bilateral-denoise.test.js` — filterHash determinism
- `render-scene-print-quality.test.js` — denoise provenance
- `soft-penumbra-print.test.js` — soft vs hard determinism
- `print-specular-ggx.test.js` — ggx survives convert → material
- `scene-spec.test.js` — brdf parse
- `normalization.test.js` — GGX library regression
- `test_printer_api.py` — Genblaze health / dry-run
