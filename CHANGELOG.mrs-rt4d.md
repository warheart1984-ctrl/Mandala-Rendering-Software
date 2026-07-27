# MRS RT4D Changelog

All notable changes to the MRS RT4D sovereign renderer are documented here.

## [1.0.0] - 2026-07-26

### Added

- Full GLB 2.0 to TriangleMesh4D to Scene4D to BVH4D to PathTracer4D pipeline
- Emissive triangle NEE with multiple importance sampling (MIS)
- TBN-based normal map perturbation
- Vertex color support (COLOR_0 accessor)
- Tangent/bitangent interpolation in SkinnedMeshIntersector
- Scene graph with node hierarchy and transforms
- Multi-buffer GLB support
- Per-triangle material slots via mergeGlbPrimitives
- Orbit camera animation renderer (render-animation.mjs)
- Evidence chain for all renders (intent, execution, checksum, provenance)
- GLB texture decode: pure-JS PNG decoder, JPEG fallback
- GPU emissive triangle buffer packing (GpuPathTracer4D)
- 83 tests across 5 test suites
- Dockerfile for reproducible container builds
- CI/CD workflow for GitHub Actions
- Demo GLB sample (basic-scene.glb)

### Fixed

- MaterialId timing bug in addTriangleMesh
- Normal map fallback when TBN is missing
- MIS strategy consistency between sampling and PDF
- HyperBox zero-extent slab handling for w=0 meshes

## [0.9.0] - Internal prototype

- Basic BVH4D
- TriangleMesh4D
- CPU path tracer with deterministic camera
- Kelvin lighting and energy lattice shading
- Bilateral denoiser
