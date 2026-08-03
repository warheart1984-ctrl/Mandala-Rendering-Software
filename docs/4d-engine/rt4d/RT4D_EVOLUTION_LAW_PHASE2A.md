# RT4D Evolution Law — Phase-2A

| Field | Value |
|-------|-------|
| Status | **partial** (`toy_model` / `substrate_verified`) |
| Trail | `docs/governance/cecp/trails/rt4d-evolution-law-2a-2026-08/` |
| Parent | `rt4d-governed-spacetime-lab-2026-08` |

## Sequencing

1. **2A** Evolution law + lawHash (this doc)  
2. **2B** CKL temporal authority gates  
3. **2C** Light-cone visualization  

Gates need a validity notion under a declared law. Viz does not strengthen the execution contract.

## Toy law

```
position(t+Δt) = position(t) + velocity × Δt
velocity(t+Δt) = velocity(t)
```

`lawId`: `inertial-motion-v1` · `classification`: `toy_model` · default Δt = 1/60

## Evidence binding

Envelope may include `evolutionLaw`, `initialStateHash`, `finalStateHash`, `trajectoryRoot`, `stepCount`, `replayStatus`.

## Tests

```bash
cd mrs/packages/renderer-core
npm run test:evolution-law
# AC-E1..E8
```

## Anti-overclaim

Not a physics engine. Not relativity dynamics. Not CKL-enforced. Not physical time travel.
