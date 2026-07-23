# Contributing to Mandala Rendering System

> **All contributions are governed by the Constitutional Engine Charter (4DCE v1.0).**

## Before You Contribute

1. **Read `AGENTS.md`** — the full agent lawbook that governs this repository
2. **Understand the 5 core principles** — No execution without intent, No state change without evidence, No authority without contract, Replayable reality, Sovereign independence
3. **Know the protected paths** — `constitution/`, `engine/constitution/`, `engine/governance/policies/`, `AGENTS.md` require explicit owner authorization to modify

## Contribution Requirements

### Intent Declaration
Every PR must include:
- **What** you are changing
- **Why** you are changing it (cite issue, test failure, or user request)
- **Which files** are affected
- **What tests** verify the change

### Evidence Production
Every change must produce evidence:
1. Intent declaration in the PR description
2. File manifest listing all modified files
3. Test plan with specific commands and expected outcomes
4. Conformance check analysis (which of the 16 checks are affected)
5. Regression analysis (what existing functionality is preserved)

### Testing
Before submitting a PR:
```bash
# Run normalization tests (23 tests must pass)
node src/render/rt4d/test/normalization.test.js

# Run full test suite
npm test

# Run conformance checks (16/16 must pass)
npm run test:conformance
```

### Mathematical Integrity
This is a mathematical rendering system. Verify:
- Lambertian BRDF = 3ρ/(4π), pdf = 3cosθ/(4π)
- GGX NDF denominator includes π²
- BVH4D slab intersection correctness
- Projection formulas (d₄ then d₃)

## Protected Paths

The following paths require **explicit owner authorization** to modify:

```
constitution/
engine/constitution/
engine/governance/policies/
engine/conformance/default.conformance-profile.json
AGENTS.md
CITATION.cff
.zenodo.json
```

These are constitutional artifacts. Changes to them affect the governance framework itself and require careful review.

## Code of Conduct

This project follows the Constitutional Engine Charter. The short version:

> **"No action without evidence. No claim without proof. No system without governance."**
