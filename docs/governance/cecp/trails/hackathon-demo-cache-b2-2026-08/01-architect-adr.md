# 01 Architect ADR — hackathon demo cache B2

| Field | Value |
|-------|-------|
| mode | Pipeline-Conductor |
| status | complete |

## Intent

Ship a judge-understandable media demo: pre-render frames with GMI/GenBlaze credits, store on B2 with provenance, live path serves cache with honest `source` labels, disclose multi-provider failover (GMI primary, hfspace free fallback).

## Scope

- In: demo_cache module, pre_render CLI, provider_cascade, gmi_provider (optional SDK), API/health flags, ops docs, tests
- Out: constitutional SoT edits; ink-cel SoT; CI billed live GMI

## Contracts

- B2 keys: `{prefix}/demo-cache/{shot}/f{NNNN}/render.png|manifest.json`
- Sources: `b2-cache` \| `live-generate` \| `structure-only`
- Env: `GENBLAZE_DEMO_CACHE*`, `GMI_*`, B2_*, HFSPACE, FAL, NVIDIA

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `app/demo_cache.py` | create | Implementor |
| `app/provider_cascade.py` | create | Implementor |
| `app/gmi_provider.py` | create | Implementor |
| `app/pre_render.py` | create | Implementor |
| `app/config.py` / `main.py` | extend | Implementor |
| `docs/ops/HACKATHON_DEMO_CACHE_B2.md` | create | Architect/Impl |
| `tests/test_demo_cache.py` | create | Implementor |

## Acceptance tests

- [ ] Cache key layout stable
- [ ] Cascade order gmi…hfspace
- [ ] Claim labels distinguish cache vs live
- [ ] Fail-closed structure-only on miss+fail

## Handoff

Builder → Implementor → Reviewer → Inspector → ESFR
