# 02 — Builder scaffold manifest

| Field | Value |
|-------|-------|
| Role | Builder |
| Date | 2026-07-30 |
| Status | **enforced** (reuse) |

No new package scaffolds. Surfaces already exist:

| Surface | Path | Action |
|---------|------|--------|
| CCC probe CLI | `sovereign-x/cli/sx-image-gen-provider-probe.mjs` | reuse |
| SX legacy CLI | `sovereign-x/cli/sx-legacy-efficient.mjs` | reuse |
| Cinematic host | `tmp/book-movie-ch1/render_ch1_cinematic.mjs` | reuse (`--cinematic-v2`, `--amendment-vii`, `--proof`) |
| Cycle out dir | `tmp/book-movie-ch1/verification-cycle-2026-07-30/` | create |
| Trail | `docs/governance/cecp/trails/verification-cycle-media-2026-07-30/` | create |

Handoff → Implementor: execute probe + render commands.
