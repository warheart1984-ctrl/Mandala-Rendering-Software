# Trail: sovereign-x-vendor-router-2026-07

**Feature:** Sovereign X Router — register NVIDIA + AMD vendor skills as
upstream-only capabilities; reject GPU print SoT  
**Started:** 2026-07-28  
**Branch / PR:** `feat/engine3d-genblaze-cinematic-plugin` /
[PR #83](https://github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-/pull/83)  
**Sibling trail (do not revert):** `vendor-skills-fixup-2026-07`  
**Parent context:** `printer-gpu-quality-speed-2026-07`,
`docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md`,
`mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md`  
**overallStatus:** **partial**  
**mode / lens:** Boundary-Guardian + Anchor + Runtime-Sage  
**actorMode:** Anchor  
**softwareCreationMode:** Protocol + Boundary-Guardian  
**cognitive-profile:** Guardian (anti-overclaim / sovereignty)

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
- [x] `lineage.json`
- [x] `README.md`

## Hard bans (constitutional)

- GPU print / GPU deterministic plates / GPU RT4D SoT / GPU denoise-as-evidence /
  GPU integrator-as-print-backend — **REJECT** until parity proven
- Skills expand the router; they do **not** override Digital Printer
  (`mulberry32`, deterministic sampling/encode/hash, evidence, sovereignty)
- NIM/FLUX/Cosmos bytes must **not** become `beauty.png` SoT
- Do **not** claim CUDA/HIP/WebGPU print **enforced**
- AMD dispatch is **host-capability driven** (allowed even if Mandala has no
  in-repo AMD backend)

## Registry path

`mrs/packages/sovereign-x-router/data/vendor-capability-registry.json`

## Promotion stance

See `06-engineer-standards.md` — expected **PASS_WITH_GAPS** /
**PROMOTE_WITH_GAPS** (thin registration only; vendor runtimes not wired).
