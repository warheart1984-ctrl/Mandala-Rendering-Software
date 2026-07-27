# Contributing to MRS RT4D

Thank you for your interest in contributing to the MRS RT4D sovereign renderer.

This project implements a constitutional, evidence-producing 4D path tracer with a full GLB to TriangleMesh4D to Scene4D to BVH4D to PathTracer4D pipeline. All contributions must preserve determinism, reproducibility, and the evidence chain.

## Codebase Structure

```
mrs/
  packages/
    renderer-core/     # 4D renderer, integrators, materials, BVH, GLB importer
    engine3d-core/     # 3D engine utilities (no dependency from renderer-core)
  scripts/             # CLI tools (render-still.mjs, render-animation.mjs)
  demo/                # Sample GLB files for testing
```

## Contribution Requirements

### 1. Determinism

All rendering logic must remain deterministic:

- No random calls without a seeded RNG
- No time-based or system-based entropy
- No nondeterministic GPU operations

### 2. Evidence Chain

Every render must continue producing:

- `intentHash`
- `executionHash`
- `pngChecksum`
- provenance JSON

Do not modify evidence fields without architectural review.

### 3. Tests

All **83 tests** must pass before merging:

- 34 GLB importer tests
- 28 render-still tests
- 15 triangle-mesh tests
- 3 texture decoder tests
- 3 render-animation tests

Add tests for any new feature.

### 4. No engine3d-core dependency

`renderer-core` must remain fully standalone. Do not import from `@mrs/engine3d-core`.

### 5. Code Style

- ES modules only
- No comments unless required for clarity
- Follow existing file structure and naming conventions

## Running Tests

```bash
node --test \
  mrs/packages/renderer-core/scripts/test/glb-importer.test.js \
  mrs/packages/renderer-core/scripts/test/render-still.test.js \
  mrs/packages/renderer-core/scripts/test/triangle-mesh.test.js \
  mrs/packages/renderer-core/scripts/test/glb-texture-decoder.test.js \
  mrs/packages/renderer-core/scripts/test/render-animation-glb.test.js
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Run `npm ci && node --test ...` (all 83 tests)
4. Submit a pull request describing:
   - What changed
   - Why
   - How determinism and evidence were preserved

## Reporting Issues

Please include:

- GLB file (if relevant)
- CLI command used
- Expected vs actual output
- Renderer version
- Evidence JSON

## Code of Conduct

> "No action without evidence. No claim without proof. No system without governance."
