# 4D Rendering System (4DRS) documentation

| Document | Role |
| --- | --- |
| [NAMING.md](./NAMING.md) | Formal names (4DRS, RT4D, Hyper-Caustic Lens) |
| [SPEC-v1.0.md](./SPEC-v1.0.md) | Published specification |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module architecture |
| [First-4D-Renderer.md](./First-4D-Renderer.md) | Technical note |
| [api/rt4d-v1.0-freeze.md](./api/rt4d-v1.0-freeze.md) | Stable API freeze (CPU RT4D v1.0) |
| [api/mrs-v2.0-freeze.md](./api/mrs-v2.0-freeze.md) | MRS v2.0 architectural / export freeze |
| [validation/Hyper-Caustic-Lens.md](./validation/Hyper-Caustic-Lens.md) | Official validation scene |
| [substrate/](./substrate/) | Math foundations, MRS-CRC, MRS-IC, BVH GPU, Unity live-link, 4D Inspector |
| [contracts/](./contracts/) | Canonical MRS-IC v1.1 / v1.2 + [INVARIANT_STACK](./contracts/INVARIANT_STACK.md) (PI/EI + cross-runtime / CKL soft·enforce) |
| SX-PTIG lifecycle | ContinuityGuarantee ≠ AcceptanceGuarantee — [`../../mrs/packages/renderer-core/src/gpu/constitution/SX-PTIG.md`](../../mrs/packages/renderer-core/src/gpu/constitution/SX-PTIG.md) (**declared** + tested heuristics) |
| CROS (separate) | Creative-render scaffold CI-001..006 — [`../../mrs/packages/cros`](../../mrs/packages/cros) (not RT4D; not implemented by genblaze-media) |
| [inspector/](./inspector/) | 4D Inspector documentation index |
| [RELEASE_NOTES_v1.0.md](./RELEASE_NOTES_v1.0.md) | GitHub / Zenodo release notes |
| [roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md](./roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md) | MRS v2.0 umbrella (**contracts frozen** · capability roadmap) |
| [constitution/](./constitution/) | 4D Engine v1 constitution mirror → [`docs/4d-engine/v1/`](../4d-engine/v1/README.md) |

Charter: [`../../constitution/CHARTER.md`](../../constitution/CHARTER.md)  
4D Engine v1 (declared): [`../4d-engine/v1/README.md`](../4d-engine/v1/README.md)  
RT4D GPU evolution (v2–v4 **roadmap**): [`../4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md`](../4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md)  
Genblaze media v2 (**ops roadmap**, not RT4D): [`../ops/GENBLAZE_MEDIA_V2_ROADMAP.md`](../ops/GENBLAZE_MEDIA_V2_ROADMAP.md)  
Engine code: [`../../mrs/packages/renderer-core/src/render/rt4d/`](../../mrs/packages/renderer-core/src/render/rt4d/) (`@mrs/renderer-core`)
