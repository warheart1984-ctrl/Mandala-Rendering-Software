# Sovereign X — lookdev-from-image (NIM FLUX shell ingest)

**Artifact:** `docs/sx-router/specs/lookdev-from-image.md`  
**Status:** **partial** — dry-run / missing-key stubs **enforced** in unit tests; live NIM POST **declared** (requires `NVIDIA_API_KEY` + reachable endpoint).  
**Authority:** assist-only — **never** Digital Printer SoT (`cpu.rt4d.print` remains authoritative).

## Mode

`mode: "lookdev-from-image"`

## Flow

1. CLI / `GpuAssistModule.handleFluxImageIngest` / `LookDevEngine.runFromImage`
2. `router.route("gpu.gen.nvidia.nim_flux", { mode, imagePath|imageBase64, … })`
3. Skill `flux_generate.js` (registry → `~/.agents/skills/nvidia-gpu-assist` or in-repo `sovereign-x/skills/nvidia-gpu-assist/`)
4. Optional draft SceneSpec via `fluxSceneSpecExtractor` (empty geometry; human curation required)
5. Next step: human curation → `cpu.rt4d.print` (outside this mode)

## Run

```bash
# Dry-run (no network; recommended first)
npm run sx:flux-image -- --image ./still.png --dry-run

# With LookDevEngine + draft SceneSpec JSON
npm run sx:flux-image -- --image ./still.png --engine --dry-run

# Batch
npm run sx:flux-image-batch -- --dir ./stills --dry-run

# Inspector
npm run sx:capabilities -- inspect-flux-image
```

Bash wrappers (Unix): `sovereign-x/cli/sx-flux-image.sh`, `sx-flux-image-batch.sh`.

## Env

| Variable | Role |
|----------|------|
| `NVIDIA_API_KEY` / `NVIDIA_NIM_API_KEY` / `NGC_API_KEY` | Auth for live POST |
| `NIM_FLUX_ENDPOINT` | Full override URL (preferred when set) |
| `NVIDIA_GEN_BASE_URL` | Default `https://ai.api.nvidia.com/v1` |
| `GENBLAZE_IMAGE_MODEL` | Default `black-forest-labs/flux.1-schnell` |

Missing key or `--dry-run` → assistOnly stub (`code: FLUX_MISSING_API_KEY` / `FLUX_DRY_RUN`). Does **not** crash print paths.

## Honesty

- FLUX.1-schnell on NVIDIA cloud may reject `image` (T2I-only) → `FLUX_IMAGE_REJECTED_T2I` (assist continues; not false-PASS).
- Draft SceneSpec is **not** NIM vision reconstruction.
- No claim of live multi-host parity or GPU print SoT.

## Related

- Registry: `sovereign-x/router/registry/gpuSkillsRegistry.json`
- Trail: `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/`
