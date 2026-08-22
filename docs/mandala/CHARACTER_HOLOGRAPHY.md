# Character holography — skin boundary / rig bulk

**Status:** **partial** — synthetic holographic character layer (Claim A).  
**Not** enforced: living organism, production biomechanics, “realistic by default”, or “governed reconstructable body”.

Maps Mandala holography duality onto the `character/` pipeline by **importing** `mandala/holography/` (EGT curvature \(K\) from \(\varepsilon\), EFR) — no second theory.

| Energy / entanglement | → | Boundary information on **skin** |
| Mesh | → | Emergent geometry from that information |
| Textured render | → | Bulk manifestation (rig / anatomy **toy**) |

Contract sibling: [`HOLOGRAPHIC_BULK_BOUNDARY.md`](./HOLOGRAPHIC_BULK_BOUNDARY.md).

---

## Module map

| Path | Role | Tag |
|------|------|-----|
| `character/holography/skin-egt.mjs` | Skin verts → EGT nodes; \(B_i\), \(\rho\), \(w_{ij}\) | **partial** |
| `character/holography/muscle.mjs` | `MuscleRegion` + activate/deform/fire | **partial** |
| `character/holography/rig-node.mjs` | Entanglement tensor \(E_i\) + RigNode frames | **partial** |
| `character/holography/curvature-activation.mjs` | \(K\to\) muscle activation \(A_k\) | **partial** |
| `character/holography/rig-ciems.mjs` | Per-node CIEMS gov + frame I/E/C/S | **partial** |
| `character/holography/anatomy-synthesis.mjs` | Boundary → muscle/bone/soft (toy) | **partial** |
| `character/holography/creature-template.mjs` | Mythar humanoid template instantiate | **partial** |
| `character/holography/constitutional-motion.mjs` | Intent→…→Stewardship motion loops | **partial** |
| `character/holography/taxonomy.mjs` | Genus/species/individual skeleton | **partial** |
| `character/holography/face-egt.mjs` | Face patch EGT + expression patterns | **partial** |
| `character/holography/full-body.mjs` | Global body EGT, breathing, bulk toy | **partial** |
| `character/holography/bulk-toy.mjs` | Bone/muscle cluster decode | **partial/toy** |
| `character/holography/demo.mjs` | CPU dual-view PNGs + receipt | **partial** |
| `character/holography/rig-ciems-demo.mjs` | \(E\)/\(K\) heatmaps + gov receipt | **partial** |
| `character/holography/creature-demo.mjs` | Template + anatomy + breathe | **partial** |
| Full anatomical RT4D reconstruct | — | **declared** |
| Living anatomical field / living taxonomy | — | **declared** |
| Production face retopo | — | **declared** |
| Production biomechanics / “realistic by default” | — | **declared** |

```bash
node character/holography/e2e-showcase.mjs   # → frame-final.png (+ showcase.mp4)
node character/holography/demo.mjs
node character/holography/rig-ciems-demo.mjs
node character/holography/creature-demo.mjs
node --test character/holography/test/holography.test.mjs
```

Visible smoke: [`E2E_SHOWCASE.md`](./E2E_SHOWCASE.md) → `output/character-holography/e2e-showcase/frame-final.png` (**partial**, e2e smoke passed).  
Creatures / spawn contract: [`HOLOGRAPHIC_CREATURES.md`](./HOLOGRAPHIC_CREATURES.md) → `output/character-holography/creature/` (`spawn()` / `scripts/spawn-mythar.mjs`).  
Artifacts (demo): `output/character-holography/`.

---

## 1. Rig–boundary mapping (skin EGT)

Each skin vertex \(v_i\):

- position, bone influence \(B_i\) (from `paintWeights` / char_rigged)
- info density \(\rho_i\) (deformation / stress proxy)
- edges \(w_{ij}\): mesh adjacency + bone-weight similarity + material region
- entanglement tensor \(E_i=\sum_j w_{ij}\,\hat d^{ij}\otimes\hat d^{ij}\) (**partial**)
- `GovernanceCoord` intent/evidence/conformance/stewardship (**partial** audit)

Curvature: `recomputeCurvature` from `mandala/holography/egt.mjs`  
\(K_i=\alpha\|\nabla\varepsilon\|+\beta\Delta\varepsilon\) (defaults \(\alpha=1\), \(\beta=0.25\)).

Bulk bones/muscles from \(B_i\) clusters = **partial/toy**. Boundary-field synthesis = `anatomy-synthesis.mjs` (**partial**).

---

## 2. Entanglement-driven muscle (`MuscleRegion`)

```
MuscleRegion {
  id, vertexIds, anchorVertexIds, fiberDir
}
```

**Activate** at \(t\): \(\rho_i = \mathrm{activationSignal}(m,t)\) on belly; for edges both in muscle  
\(w_{ij} \mathrel{+}= \rho\cdot\mathrm{align}(\widehat{\Delta x},\widehat{\mathrm{fiber}})\cdot\mathrm{entanglementScale}\).

**Deform** (not blendshapes):

1. Anchors stay near rest  
2. Contraction along fiber  
3. Bulge along estimated normal  
4. Smooth by \(w_{ij}\)  

Then recompute \(\varepsilon,K\). CPU/EFR: higher \(\rho\) warmer, higher \(K\) tighter warp.

---

## 3. Boundary-encoded facial rigs

Procedural humanoid head lacks facial resolution → **face patch** grid demo.  
Production face retopo = **declared**.

- Zones: brow, eye, nose, mouth, cheek, jaw  
- \(\rho\) = expression tension; `controlInfluence` for smile / anger / surprise  
- Edges: same-zone, lids/lips (orbicularis), zygomaticus / frontalis toy tags  
- Smile ≠ blendshape: \(\rho\uparrow\) corners/cheeks/lower lids; \(w\uparrow\) smile lines; causal mouth→eyes  
- Rig: jaw/cheek/brow controls **read** boundary state; deform corners / cheek bulge / lids  

---

## 4. Full-body EGT / breathing (**partial**)

Global EGT over skin verts + layer weights `skin|muscle|bone`.  
Edge tags: muscle, fascia_front/back, joint.

Toy bulk (not osteology / not production anatomy):

- bones ≈ high-\(K\) low-deformation paths  
- muscles ≈ high-\(\rho\) clusters  
- soft tissue ≈ lower-\(|K|\) regions  

Motion: breathing \(\rho\) oscillation on torso (few frames); optional walk-wave on legs.  
Not production biomechanics; not a governed reconstructable body.

CPU dual views: boundary heatmap / warped / combined PNGs (**partial**).

---

## Organ links

| Organ | Link |
|-------|------|
| **Mandala** | Pixels — EFR heatmaps / beauty tint from \(\rho,K\) |
| **Simulation Chamber** | Motion — `--holo` COMPOSITE path (partial); default still 15-part capsules |
| **tools** | Character export / procedural humanoid as mesh source |

RHFD framing: mesh as lattice defect in Mandala substrate — see character README.

---

## Honesty table

| Claim | Tag |
|-------|-----|
| Skin↔EGT + demo PNGs | **partial** / working demo |
| MuscleRegion fire/deform | **partial** |
| Rig entanglement \(E_i\) + CIEMS gov | **partial** |
| Boundary anatomy synthesis | **partial** / toy |
| Creature templates / Mythar | **partial** |
| Constitutional breathe/reach/walk | **partial** |
| Chamber `--holo` COMPOSITE record | **partial** (boundary density, not photoreal) |
| Face patch expressions | **partial** |
| Full-body breathing sequence | **partial** |
| Production biomechanics | **declared** |
| Production face retopo | **declared** |
| Full anatomical RT4D reconstruct | **declared** |
| Living anatomical field / living taxonomy | **declared** (not enforced) |
| “Realistic becomes default” | **declared** (marketing only — not enforced) |
| Governed reconstructable body | **declared** (not enforced) |
