# Holographic creatures — public contract (Claim A)

**Status:** **partial** — synthetic informational creature layer.  
**Not enforced:** living constitutional ecosystem, holographic biology, living taxonomy.  
**Aspiration:** foundation of a governed biological universe = **declared**.

Companions: [`CHARACTER_HOLOGRAPHY.md`](./CHARACTER_HOLOGRAPHY.md) · [`HOLOGRAPHIC_CIEMS.md`](./HOLOGRAPHIC_CIEMS.md)

---

## Public contract (three pillars)

### 1. Creature Boundary Signature — creature = information pattern, not geometry

| Field | Role |
|-------|------|
| Entanglement profile | spine / coupling boosts → \(E_i\), \(w_{ij}\) |
| Curvature map | joint / bend bias → \(K\) |
| Tension fields | torso breath, facial micro-zones → \(\rho\) |
| Governance bias | intent / evidence / conformance / stewardship priors |

API: `spawn(signature)` / `instantiateTemplate(id)` applies the signature to a **procedural chamber lattice**. **No traditional mesh / GLB load.**

### 2. Constitutional Motion Primitives — motion = governed state evolution

Per frame: **Intent → Evidence → Conformance → Stewardship** → update \(E\), \(\rho\), \(K\), positions, CIEMS frame trace.

| Primitive | Tag |
|-----------|-----|
| `breathe` | **partial** |
| `reach` | **partial** |
| `walk` | **partial** (leg ρ/z wave in chamber `--holo`; not production locomotion) |

### 3. Holographic Species Taxonomy

**Genus → Species → Individual**

| Rank | Example | Contents |
|------|---------|----------|
| Genus | `bipedal` | Signature envelope (E/K/ρ), repertoire |
| Species | `mythar-humanoid` | Anatomy synthesis rules, gov archetype (“no joint inversion” soft) |
| Individual | params | `breathAmp`, `reachAmp`, `stature` |

Full multi-species system = **declared**.

---

## Golden path

```bash
node character/holography/creature-demo.mjs
# or
node scripts/spawn-mythar.mjs
# chamber (skip capsules; COMPOSITE boundary record):
node scripts/simulation-chamber.mjs scripts/scene-cards/scene-salt-atlas.json --holo --creature Mythar --record composite --out output/simulation/holo-mythar-001/
```

Writes `output/character-holography/creature/`:

| Artifact | Content |
|----------|---------|
| `boundary-signature.png` | Entanglement / signature viz on lattice |
| `anatomy-inferred.png` | Toy muscle/bone/soft overlay |
| `after-breathe.png` | Frame after breathe primitive |
| `after-reach.png` | Frame after reach primitive |
| `bulk-inferred.json` | Inferred clusters / paths |
| `receipt.json` | genus / species / individual, gov aggregates I/E/C/S, primitive name |
| `contract.json` | Machine-readable three-pillar contract |

```bash
node --test character/holography/test/holography.test.mjs
node character/holography/rig-ciems-demo.mjs   # → output/character-holography/rig-tensor/
```

---

## Honesty table

| Claim | Tag |
|-------|-----|
| Creature Boundary Signature + `spawn()` | **partial** |
| Rig entanglement tensors \(E_i\) | **partial** |
| Curvature → muscle activation | **partial** |
| Per-node CIEMS gov + frame I/E/C/S | **partial** (audit receipt) |
| Boundary anatomy synthesis | **partial** / toy |
| Constitutional `breathe` / `reach` / `walk` | **partial** |
| Taxonomy skeleton (bipedal → Mythar) | **partial** |
| Full species / living taxonomy | **declared** |
| Living constitutional ecosystem | **declared** (not enforced) |
| Holographic biology | **declared** (not enforced) |
| Governed biological universe foundation | **declared** aspiration |

---

## Formulas (informational)

\[
E_i=\sum_{j\in N(i)} w_{ij}\,\hat d^{ij}\otimes\hat d^{ij}
\]

\[
\varepsilon_i=\sum_j w_{ij},\quad
K_i=\alpha\|\nabla\varepsilon\|+\beta\Delta\varepsilon,\quad
A_k=\sigma(\overline{|K|}_{M_k}),\quad
\rho_i=g(K_i,A_k,\mathrm{align})
\]

`GovernanceCoord { intent, evidence, conformance, stewardship } ∈ [0,1]` — soft audit, not CHARTER edits.

---

## Modules

| Path | Role | Tag |
|------|------|-----|
| `character/holography/spawn.mjs` | `spawn` / `spawnMythar` / `CREATURE_CONTRACT` | **partial** |
| `character/holography/creature-template.mjs` | Mythar signature + instantiate | **partial** |
| `character/holography/constitutional-motion.mjs` | IECS motion loops | **partial** |
| `character/holography/taxonomy.mjs` | Genus/species/individual | **partial** |
| `character/holography/anatomy-synthesis.mjs` | Boundary → bulk toy | **partial** |
| `character/holography/rig-node.mjs` | \(E_i\) on nodes | **partial** |
| `character/holography/rig-ciems.mjs` | Frame gov receipt | **partial** |
| `scripts/spawn-mythar.mjs` | CLI golden path | **partial** |
