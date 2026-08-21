# Mandala Engine (partial — organs wired, not v1.0 release)

**Identity:** The Mandala Engine — a constitutional 4D simulation and rendering platform.
**This folder:** scene graph (v0.1) plus callable organs (physics, materials, painter, mythar, AAIS ABI, editor CLI, SDK). Not Unreal/Unity/Blender parity. Not a full renderer rewrite.

| Piece | Status |
|-------|--------|
| Scene graph (`scenegraph.mjs`) | **skeleton** |
| Organ tags (closed Organ Map) | **enforced** in tests |
| Physics core (`physics/`) | **partial** |
| Lattice Hamiltonian (`hamiltonian/` + `../substrate/hamiltonian.mjs`) | **working** (scalar); scan **partial** |
| Governance Hamiltonian (`hamiltonian/governance.mjs`) | **working** (demo 6D graph); real CAR/CDR **declared** |
| Materials (`materials/`) | **partial** |
| AAIS Organ ABI v1 (`aais/`) | **working** freeze |
| AI Painter (`painter/`) | **partial** (CPU; SD may be blocked-with-evidence; pro uncensored gated — see [`docs/mandala/AI_PAINTER_PRO_TIER.md`](../../docs/mandala/AI_PAINTER_PRO_TIER.md)) |
| Mythar (`mythar/`) | **partial** (sound lattice; edge-tts if present) |
| Editor CLI/HTML (`editor/`) | **partial** |
| SDK (`sdk/`) | **partial** |
| GPU async queue | **partial** (CPU fallback; proto ∇φ) |
| v1.0 full engine | **not declared done** |

Roadmap SoT: [`docs/mandala/MANDALA_ENGINE_ROADMAP.md`](../../docs/mandala/MANDALA_ENGINE_ROADMAP.md).
ABI (no AAIS-UL v20): [`ABI.md`](./ABI.md).

```bash
node --test mandala/engine/test/scenegraph.test.js
node --test mandala/proto/test/four-proofs.test.js
node mandala/engine/run-e2e.mjs
node mandala/engine/hamiltonian/run.mjs
node mandala/engine/editor/cli.mjs list --seed 7 --steps 4
```

E2E artifacts: `output/mandala-engine-e2e/` (does not overwrite `output/simulation/salt-atlas/`).
