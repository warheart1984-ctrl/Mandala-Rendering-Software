# CONTRACT — MRS as a Governed Digital Printing System

> **Status:** printer mode intake/evidence/profiles/denoise/penumbra/specular
> print path **enforced** (tests); commercial RIP / GPU denoise **declared**.
> **Trail:** `docs/governance/cecp/trails/digital-printer-v2-2026-07/`  
> **Prior:** `docs/governance/cecp/trails/printer-mode-renderer-2026-07/`

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
| Reconstruction / denoise | CPU BilateralDenoiser (profile-gated) | **enforced** when denoise=true (hq+) |
| Soft penumbra | finite-radius area lights + radius floors | **enforced** when softPenumbra=true |
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
- `demo_digital_print.py` / `run_print.py`
- Contract: this file
- HTTP: `docs/governance/cecp/PRINTER_SERVICE_API.md` (`/printer/*` on Genblaze)
- Deployment: `docs/governance/cecp/DIGITAL_PRINTER_DEPLOYMENT_CHARTER_v1.0.md`

## Quality profiles

`print_fast` | `print_hq` | `print_cinematic` | `print_reference` — all **enforced**
(deterministic params; wall-clock is ops). Denoise/softPenumbra gated by profile.

### Quality then speed (ops — not free lunch)

Climb the profile ladder for quality first (`print_hq` → `print_cinematic` →
`print_reference`); do not silently cut spp to “feel fast.” Monte Carlo noise
falls with samples — measured by the quality-per-sample ladder
(`mrs/packages/renderer-core/src/render/rt4d/compare/qualityPerSample.js`,
test: `scripts/test/quality-per-sample.test.js`). Adaptive sampling / denoise
improve *perceived* noise within a fixed budget; they are not extra unbiased
samples. GPU acceleration of the same math is a separate, parity-gated path
(`docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`).

**Genblaze NIM / FLUX** are creative assist only — never Digital Printer beauty
SoT. See Genblaze README § “Digital Printer vs NIM”.

**Sovereign X vendor router** (`@mrs/sovereign-x-router`) may register NVIDIA/AMD
vendor-skill capabilities for **upstream** look-dev / SceneSpec / parity / AI
assist only. Dispatch stubs **reject** GPU print-SoT capability IDs. Skills do
not override this contract (mulberry32, deterministic sampling/encode/hash,
evidence, sovereignty). Trail:
`docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/`.

## Timeout

`MRS_PRINT_TIMEOUT_SECONDS` (fallback `MRS_RENDER_TIMEOUT_SECONDS`, default 900) — **enforced** on printer HTTP + CLI.
## Draft CI

Default draft quality clamps in `execute.py` are unchanged. Print/cinematic is
opt-in only.
