# RT4D v2 — Declared math notes (Phase C)

> **Status:** **declared math** (Drive-G-1). Not a claim of live GPU engines.

## Wave field

\[
\psi^{t+\Delta t} = 2\psi^{t} - \psi^{t-\Delta t} + c^2 \Delta t^2 \nabla^2 \psi^{t}
\]

Coupling: \(k' = k(1+\beta\psi)\), \(F = mg + \gamma\psi w\).

CPU: `WaveField`, `CurvatureField`, `ForceField`. WGSL: `wave_update.wgsl` (**declared**).

**Not B2-related.** Local demos only.

## Multi-GPU wave tiling (conceptual only)

`planWaveTiles` / per-device ψ partitions remain **docs-only** — see multi-GPU contract. Arbitrator stub always returns `"single"`. **Not implemented.**

## HDR

Reinhard + gamma — `HdrCanvas.toneMapPixel` (**partial**).
