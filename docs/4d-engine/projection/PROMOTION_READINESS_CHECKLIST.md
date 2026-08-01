# Promotion Readiness Checklist — Anime-Structure Plate Projector Lane

| Field | Value |
| --- | --- |
| Status | **~70% ready** — promotion **declared / not ready** |
| Gate | [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md) |
| Contract §6 | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) |
| Blocked on | pole-stress thresholds (partial wire), ink-cel projection, CI provenance validator |
| Print SoT / Digital Printer | untouched |

Honest checkboxes: `[x]` only where repo evidence exists.

## A. Mathematical Stability

- [x] Core projector defined: \((x',y',z') = \frac{d_4}{d_4+w}(x,y,z)\)
- [x] α-equivalence validated: \(\alpha = 1/d_4\)
- [x] Sign-variant projector documented
- [ ] Pole behavior fully characterized (near-pole stress ran; full characterization incomplete)
- [x] Numerical stability thresholds defined (reject / fallback) — **partial** Option C defaults in `rt4d-project-compare.mjs` + [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md)

## B. Evidence & Replayability

- [x] Runner exists (`rt4d-project-compare.mjs`)
- [x] Sparse hits experiment (90 hits)
- [x] Scene-rich experiment (194 hits)
- [x] Replay determinism (hash PASS)
- [x] Provenance schema declared
- [ ] Provenance validator integrated into CI

## C. Rendering Integration

- [x] Soft-raster fallback plates generated
- [ ] Full ink-cel projection test
- [ ] Engine3D shading-space alignment review
- [ ] Normals transport decision (3D vs 4D)

## D. Documentation

- [x] Formal contract (v1)
- [x] Design note (“w as story vs flat axis”)
- [x] Folder index
- [x] Cross-links (ProjCC, verify note)
- [x] Promotion gate doc (v1) — [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md)

## E. Governance

- [x] Multi-lane verdict locked (no universal winner)
- [x] Default promotion declared (not promoted)
- [x] Promotion proposal ready for PR (#95 package)
- [ ] Constitutional review (CSE/CCC alignment) — draft checklist exists; sign-off not complete

## Readiness

**Promotion readiness ≈ 70%**

Blocked on: pole-stress thresholds (runner **partial**; not CI-enforced), ink-cel projection, CI provenance validator.
