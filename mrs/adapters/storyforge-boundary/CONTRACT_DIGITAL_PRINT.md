# CONTRACT — MRS as a Governed Digital Printing System

> **Status:** **partial** → printer mode intake/evidence **enforced** (tests);
> full product RIP / commercial print pipeline **declared**.
> **Trail:** `docs/governance/cecp/trails/printer-mode-renderer-2026-07/`

## Governing invariant

**Rendering = deterministic printing of declared surfaces.**  
MRS does not hallucinate geometry, materials, or lighting. A print is a faithful
encoding of a declared `RenderRequest` / `SceneSpecification` (or Engine3D /
proton surface) under a normalized `PrintRequest`.

StoryForge Story→PromptSpec remains **SF-owned / declared** — never executed
inside MRS.

## Print stages

| Stage | Meaning | Tag |
|-------|---------|-----|
| Sampling / convergence | spp, stratified AA, adaptive early-stop | **enforced** (opt-in print/cinematic) |
| Reconstruction / denoise | optional CPU denoise | **partial** / **declared** (off by default) |
| Tonemap | aces-lite / reinhard | **enforced** when print qualityOpts set |
| Color | sRGB gamma | **enforced** |
| Encode | PNG | **enforced** |
| Hash + provenance | evidence.json + lineage + sha256 | **enforced** |

## Error state machine (fail loudly)

`OK` · `SURFACE_MISSING` · `SURFACE_INVALID` · `AOV_MISMATCH` ·
`SCENESPEC_GAP` · `ENGINE3D_BOUNDARY_FAIL` · `GENBLAZE_SMOKE_FAIL`

## How to run

```bash
# Unit tests (fast — mocked execute)
python -m pytest mrs/adapters/storyforge-boundary/test_printer_mode.py -q

# Live digital print (opt-in; needs Node + render-scene)
python mrs/adapters/storyforge-boundary/demo_digital_print.py \
  --out-dir output/cecp-digital-print --samples 16
```

## Module paths

- `governance/surface_contract.json`
- `printer/` (`errors`, `sovereignty`, `print_request`, `evidence`, `pipeline`)
- `demo_digital_print.py`
- Contract: this file

## Draft CI

Default draft quality clamps in `execute.py` are unchanged. Print/cinematic is
opt-in only.
