# Certified Character State — 8-layer plan & honest status

> Grounded map of the "certified character state machine with multiple visual
> projections" vision onto what **exists** in this repo vs what is **missing**.
> Status tags follow the repo culture: **working / partial / skeleton /
> declared / blocked-with-evidence**. No overclaiming.

## Vision (user)

One `CertifiedCharacterState(t)` drives three render passes that are different
*projections of the same certified structure*:

1. **ENERGY / field** — field lines from ∇φ + bone tangents / mesh-flow.
2. **CLAY_RIG** — neutral gray GGX (~0.8 roughness), topology + wire + bone
   markers, no PBR.
3. **BEAUTY** — fur/SSS/roughness/eyes, HDR key/fill/rim. Beauty may **only
   shade structure that already exists**; it never invents geometry.

Each stage writes a **provenance hash-chain** (source mesh hash, rig hash,
material hash, world-state hash, seed, parent-stage id) so energy → rig → beauty
share a deterministic lineage. Priority: topology/deformation quality **>**
lighting — start at CanonicalMesh → RigBinding.

## 8-layer mapping (exists vs missing)

| # | Layer | Where it lives | Status | Honest note |
|---|-------|----------------|--------|-------------|
| L1 | **CanonicalMesh** (topology) | `character/models/topology.mjs` (`buildQuadHumanoid`) | **partial** | Procedural quad box-model, 442 v / 360 quads, all-quads except head poles (tris). Species-trait separation is **weak**: only the tail differs (`human` stub vs `anthro` 5-seg). No fox ears / surface-group addons yet. Strong enough to shade (beauty raster already works). |
| L2 | **RigBinding** (armature + skin) | `character/models/armature.mjs`, `character/models/weights.mjs` | **partial** | Full bone hierarchy (root→hips→spine→…, arms+fingers, legs, 4 tail bones) + nearest-bone `JOINTS_0/WEIGHTS_0` + inverse-bind. Procedural, not DCC-painted. |
| L3 | **CertifiedCharacterState(t)** | `character/certified/state.mjs` **(new)** | **partial** | Certified state + hashes are computed from L1/L2 + world + seed. `t` is carried but only `t=0` is exercised. Temporal state over time is **declared**. |
| L4 | **Provenance hash-chain** → Continuity Ledger | `character/certified/state.mjs` + `character/certified/memoryboard-client.mjs` **(new)** | **working** | Deterministic `stageHash` chain (root→energy→clay_rig→beauty) over mesh/rig/material/world-state/seed; ledger lineage via `parent-stage` evidence. Proven: written to + read back from `jarvis-memoryboard` (`POST/GET /api/jarvis/memory`), and same seed → identical hashes. |
| L5 | **ENERGY / field projection** | `character/renders/certified-passes.mjs` **(new)** + `mandala/proto/cpu-reference.mjs` (∇φ, read-only) | **partial** | Field lines integrated along −∇φ (proto reference kernel `computeGradientInto`) blended with bone tangents. **This is a field VISUALIZATION, NOT "4D physics"**: no temporal derivative / motion history yet. |
| L6 | **CLAY_RIG projection** | `character/renders/certified-passes.mjs` **(new)** | **partial** | Neutral gray matte fill (GGX ~0.8 roughness stand-in via the shader library) + wire + bone/joint markers. CPU raster stand-in. |
| L7 | **BEAUTY projection** (shade-only) | `character/renders/certified-passes.mjs` **(new)** + `character/shaders/library.mjs` | **partial** | Region materials (skin/fur/fabric/leather) + key/fill/rim. Shades only existing triangles + existing sim strands; invents no geometry. CPU Lambert/Blinn stand-in — fur **partial**; SSS / eyes / HDRI / path-traced beauty **declared**. |
| L8 | **Motion / temporal + RT4D mesh render** | `character/sim/*`, `mrs/.../render-still.mjs` (RT4D) | **declared / skeleton** | Sim is pose/Verlet interpolation (**partial**), not ∇V. RT4D exposes only `Hypersphere/Hyperplane/OrientedCapsule` — **no triangle-mesh path**, so passes use the deterministic CPU raster. A mesh→RT4D adapter and `CertifiedCharacterState(t>0)` are the next layers. |

## What THIS increment delivers (L3 + L4 + first cut of L5–L7)

- `character/certified/state.mjs` — `CertifiedCharacterState`, canonical
  `meshHash` / `rigHash` / `materialHash`, and a **deterministic** stage
  provenance chain (`stageHash_n = sha256(payload_n incl. parentStageHash)`).
  The memoryboard record id lineage (`parentStageId`) is kept as evidence and
  is intentionally **not** hashed, so `same seed → same hashes` holds.
- `character/certified/memoryboard-client.mjs` — client for the **real**
  Continuity Ledger routes (`POST /api/jarvis/memory`, `GET /api/jarvis/memory/{id}`,
  list). Reconciles the user's `/store` path: there is no `/store` route.
- `character/renders/certified-passes.mjs` — the "dumb executor": builds the
  φ field + ∇φ field lines and paints the three passes; includes the eased
  ping-pong camera (`0.5 − 0.5·cos(2πNp)`, stable look-at) mirroring the
  delivered Simulation Chamber easing.
- `scripts/character-passes.mjs` — CLI orchestrator. Renders the three hero
  stills, POSTs the certified chain, reads lineage back, optionally encodes an
  eased ping-pong mp4 per pass (via `scripts/cinematic-grade.mjs` when present,
  else plain ffmpeg), and has `--check-determinism`.

## Explicit caveats (honesty)

- **Energy = field visualization, not 4D physics.** ∇φ is a *spatial* gradient
  of a static potential the character emanates; there is no `∂/∂t`, no motion
  history, no temporal derivative. Do not read the energy pass as physics.
- **RT4D is not used to shade the mesh.** It has no triangle primitive; the
  three passes reuse the character package's deterministic CPU raster (the same
  path that already produces `char_wire/rig/final`).
- **cinematic-grade film pass** lives on an unmerged sibling branch; the hook is
  wired and used when the file is present, otherwise the mp4 is a plain encode
  and the summary says so.

## Next increments (not this turn)

1. L1 quality: species-trait **surface-group addons** (humanoid base + fox
   ears/tail as addon groups) + head-pole cleanup.
2. L8: `CertifiedCharacterState(t>0)` with motion history so the energy pass can
   *earn* a temporal/∇V claim; mesh→RT4D adapter for a path-traced beauty pass.
