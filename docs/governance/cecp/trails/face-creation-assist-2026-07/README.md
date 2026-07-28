# CECP Trail (light) — face-creation-assist-2026-07

| Field | Value |
|-------|-------|
| `trailId` | `face-creation-assist-2026-07` |
| `feature` | Genblaze Face Creation Assist + GPU print safeguard + FX-8350 tuning docs |
| `started` | 2026-07-28 |
| `pr` | #83 |
| `overallStatus` | **partial** / **declared** |
| `crew` | Implementor-forward drop-in (Architect→ESFR light note; full six-stage deferred) |

## Modes (representative)

| Lens | Use |
|------|-----|
| Sentinel | GPU print safeguard before dispatch |
| Boundary-Guardian | Genblaze assist ≠ StoryForge / print SoT |
| Monk | FX-8350 docs declared-only |

## Delivered

- `sovereign-x/integrations/genblaze/modes/{faceCreationAssist,characterBuilderPipeline,sceneToCharacterSpec}.js`
- `sovereign-x/cli/sx-face-creation.mjs`
- `sovereign-x/router/contracts/gpuPrintSafeguard.js` (wired in `router/index.js`)
- `docs/sx-router/specs/rt4d-amd-fx8350-tuning.md` (**declared**)
- Opt-in Genblaze Python shell: `FACE_CREATION_ASSIST_ENABLED`

## Bans

- No GPU print SoT
- No StoryForge imports under `mrs/apps/genblaze-media/app/*.py`
- No PathTracer4D behavior change from FX-8350 doc alone

## Related

- FLUX ingest: `docs/sx-router/specs/lookdev-from-image.md`
- Parent Phase I: `../gpu-determinism-phase1-2026-08/`
