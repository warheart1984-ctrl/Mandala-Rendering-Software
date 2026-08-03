# RT4D Spacetime / Temporal-State Laboratory — Phase-1

| Field | Value |
|-------|-------|
| Status | **partial** |
| Trail | `docs/governance/cecp/trails/rt4d-governed-spacetime-lab-2026-08/` |
| Claim | Coordinate + transform **substrate** for a governed lab — **not** physical time travel |

## Defensible statement

The renderer already supplies the coordinate and transformation substrate needed to represent spacetime, temporal trajectories, observer-dependent slices, deterministic state histories, and governed timeline operations.

Missing (beyond Phase-1): full causal structure, rich observer semantics, complete merge reconciliation, CIEMS bind (**declared**).  
**Phase-2A update:** toy inertial evolution law is now **partial** (`toy_model`) — see `RT4D_EVOLUTION_LAW_PHASE2A.md`.

## Modes (do not collapse)

| Mode | Fourth axis | Default metric |
|------|-------------|----------------|
| `geometry` | spatial \(w\) | Euclidean |
| `spacetime` | \(ct\) | Minkowski `-+++` |
| `simulation` | state evolution index | Euclidean (indexing) |
| `timeline` | lineage coordinate | Euclidean (lineage) |

Default: **`geometry`**.

## Math correction

Under Minkowski, planes mixing time with space are **Lorentz boosts** (\(\cosh\eta,\sinh\eta\)), not Euclidean rotations (`Transform4D.rotate` with \(\cos/\sin\)).

## Three meanings of “time travel”

1. **Spacetime visualization** — render another slice  
2. **Simulation rewind** — restore a snapshot / deterministic replay  
3. **Timeline editing** — fork + intervene + recompute (counterfactual computation)

Only (3) structurally resembles fiction; it is still branching computation.

## Code

- `mrs/packages/renderer-core/src/render/rt4d/metric/`
- `mrs/packages/renderer-core/src/render/rt4d/modes/`
- `mrs/packages/renderer-core/src/render/rt4d/temporal/`
- `mrs/packages/renderer-core/src/render/rt4d/semantics/`
- Schema: `mrs/packages/renderer-core/schemas/rt4d/temporal-evidence-envelope.schema.json`

## Tests

```bash
cd mrs/packages/renderer-core
npm run test:spacetime-lab
```
