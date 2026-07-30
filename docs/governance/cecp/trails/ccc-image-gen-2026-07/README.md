# CCC-ImageGen trail

Architectural fix: image generation requires a **provider**, not a local GPU.
See `03-implementor-notes.md` and `docs/4d-engine/CCC_IMAGE_GEN.md`.

**2026-07-30 re-verify:** full media verification cycle + catalog →
`docs/governance/cecp/trails/verification-cycle-media-2026-07-30/`
(probes: default / `--force-gpu-down` / `--try-generate`; ESFR
`PASS_WITH_GAPS` / `PROMOTE_WITH_GAPS`).

**2026-07-30 photoreal footing:** providers `photoreal.remote.diffusion` /
`photoreal.external.pbr` + `--beauty remote` — see
`docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` and
`docs/governance/cecp/trails/photoreal-provider-strategy-2026-07/`.
