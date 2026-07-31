# 06b — ESFR / Engineer Standards (v1.0 ship)

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `role` | ESFR |
| `lens` | Anchor + Guardian |
| `ESFRVerdict` | **PASS_WITH_GAPS** |
| `PromotionEligibility` | **PROMOTE_WITH_GAPS** |

## Inputs

- InspectorVerdict: PASS_WITH_GAPS (`05b-inspector-acceptance-v1-ship.md`)
- Module: Genblaze `constitutional_anime_render` + AnimeWorldProfile v1.0
- Lineage: extends prior trail stages 01–06 (skeleton→partial ship)

## Test matrix (summary)

| Category | Outcome |
|----------|---------|
| Unit (profile + pipeline labeling) | PASS (17) |
| Painter probe honesty | PASS |
| Live diffusion beauty | GAP (blocked) |
| Dual-run cel-proxy | PASS |
| Secrets hygiene | PASS (fail closed; no commit) |
| Claim ↔ evidence | PASS (lane tags) |
| CHEA / CCR / CDGF | **declared** only |

## Probes 01–08

Cited as **declared**/partial per `docs/governance/esfr/probes.esfr.md` —
no override of Inspector. Determinism probe satisfied for cel-proxy; diffusion
determinism remains declared.

## Promotion counsel

Promote the **entry-point package** (profile contract + constitution docs +
CLI + honest fallback) with gaps: diffusion painter unblock, ink-cel InkOptions
wire, CKL opt-in. Do not promote as Full Photoreal or Digital Printer.

## Anti-overclaim

- “Real anime renderer” = governed stylization pipeline **partial**, not studio-complete
- Structure lane working; beauty diffusion blocked on this AMD host session
