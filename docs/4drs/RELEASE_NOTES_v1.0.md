# Release notes — 4D Rendering System v1.0

**Tag:** `v1.0.0`  
**Engine formal name:** RT4D (*Ray Tracer for Four Dimensions*)  
**Official validation scene:** Hyper-Caustic Lens  

## Highlights

- Formal naming and published spec under `docs/4drs/`
- RT4D module set with **stable API freeze** (`math`, `geometry`, `material`, `integrator`, `accel`, `output`, `scene`)
- Hyper-Caustic Lens marked official; baseline settings frozen in `docs/4drs/validation/baseline.json`
- Technical note: `docs/4drs/First-4D-Renderer.md`
- Zenodo-oriented metadata: `.zenodo.json`, `CITATION.cff`

## Artifacts

- Spec: `docs/4drs/SPEC-v1.0.md`
- Architecture: `docs/4drs/ARCHITECTURE.md`
- Charter: `constitution/CHARTER.md`
- Validation images: `docs/4drs/validation/artifacts/`

## Zenodo

1. Log into [Zenodo](https://zenodo.org) → GitHub → enable this repository  
2. Create/publish GitHub Release `v1.0.0` (this tag)  
3. Zenodo mints a DOI; update `CITATION.cff` `doi:` field when available  

Or upload the release tarball with `.zenodo.json` metadata manually.
