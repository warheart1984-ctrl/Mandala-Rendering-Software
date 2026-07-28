# Projection Continuity — Diagram

Status: **partial** documentation · Math/print SoT = Projector4D under `rt4d/output/`.
Aperture ≠ print.

> **BANNER:** Governed observation aperture — assist/preview only; CPU RT4D print
> remains SoT.

```text
                    Intent / Observation Mode preset
                                   │
                                   ▼
                     ┌─────────────────────────┐
                     │  P(θ, φ, τ, κ)  ProjCC  │
                     │  ProjectionKernel       │
                     │  (continuity layer)     │
                     └────────────┬────────────┘
                                  │ ProjectionState
                                  ▼
                     ┌─────────────────────────┐
                     │ Projector4D (math SoT)  │
                     │  π4→3: d4/(d4+w_eff)    │
                     │  π3→2: d3/(d3+z)        │
                     └────────────┬────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
     ApertureFrame3D      PathTracer bind      HyperCausticLens
     printSoT:false       observationProjection  tolerance north-star
     authority:observation  (**partial**)         (**partial**)
              │
              ▼
        Host viewport / LiveLink
        (≠ CPU RT4D print SoT / Digital Printer)
```

## Continuity sketch

```text
  (θ,φ,τ,κ) ──Δsmall──► (θ',φ',τ',κ')
       │                      │
       ▼                      ▼
   screen(p) ──‖Δ‖bound──► screen'(p)   (away from d4+w_eff=0)
```

## Boundary honesty

| Surface | Role |
| --- | --- |
| `output/projector.js` | Print-adjacent math SoT for closed-form projection |
| `projection/*` | Continuity / observation aperture layer |
| CPU RT4D still/print | Sovereign print path — unchanged by ProjCC |
| Vendor GPU assist | Optional acceleration — not required for ProjCC correctness |
