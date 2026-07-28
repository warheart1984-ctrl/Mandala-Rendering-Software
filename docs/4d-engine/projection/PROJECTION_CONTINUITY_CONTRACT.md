# Projection Continuity Contract (ProjCC / PCC)

| Field | Value |
| --- | --- |
| Status | **partial** (docs; suite-enforced capabilities listed below) |
| Contract id | `ProjCC-v0.1` |
| Trail | `docs/governance/cecp/trails/pcc-projection-2026-07/` |
| Math / print SoT | `mrs/packages/renderer-core/src/render/rt4d/output/projector.js` (**Projector4D**) |
| Continuity layer | `mrs/packages/renderer-core/src/render/rt4d/projection/` (not a second SoT) |
| Drive-G-1 | Continuity / aperture are **observation assist**. No claim that aperture is beauty print or Digital Printer SoT. Charter CKL gate for ProjCC remains **declared**. |
| Naming note | Distinct from substrate **4D-PCC** (Physics Constitutional Contract) in `docs/4drs/substrate/CONSTITUTIONAL_CONTRACTS.md`. |

> **BANNER:** Governed observation aperture — assist/preview only; CPU RT4D print
> remains SoT. Aperture ≠ print.

## 1. Preamble (Drive-G-1)

Intentional 4D projection is a **continuity contract** over observation parameters
\((\theta,\varphi,\tau,\kappa)\) that drive the existing RT4D projector formulas — not a
parallel print path and not a replacement for CPU RT4D print sovereignty.

| Claim | Allowed tag now |
| --- | --- |
| Contract text + diagrams | **declared** |
| `ProjectionState` + `ProjectionKernel` | **enforced** (`test:projection`) |
| Continuous \(P(\theta,\varphi,\tau,\kappa)\) vs `Projector4D` closed form | **enforced** (fidelity + continuity + strength) |
| Observation mode presets (incl. orbit / soft_caustic) | **enforced** (incl. undefined-clobber regression) |
| `ApertureFrame3D` viewport-as-aperture API | **enforced** (metadata `printSoT:false`) |
| Hyper-Caustic Lens north-star (tolerance sweeps) | **partial** (real asserts; not PNG gallery FULL_PASS) |
| Path-tracer `observationProjection` bind | **partial** (wired + tested; not full ray rewrite) |
| Package projection governance filter | **partial** |
| Charter CKL / `default.policies.json` ProjCC row | **declared** / **not claimed** as runtime enforced |

## 2. Purpose

1. Make observation parameters first-class and continuous.
2. Keep \(4\mathrm{D}\rightarrow 3\mathrm{D}\rightarrow 2\mathrm{D}\) fidelity anchored to
   `Projector4D` (`d_4/(d_4+w)`, `d_3/(d_3+z)`).
3. Separate **projection aperture** (what is seen) from **print SoT** (CPU RT4D
   still/print pipeline).
4. Provide honest hooks for Hyper-Caustic Lens validation and future path-tracer
   observation routing.

## 3. Continuous map \(P(\theta,\varphi,\tau,\kappa)\)

\[
P(\theta,\varphi,\tau,\kappa)\;\mapsto\;\mathrm{ProjectionState}
\]

| Symbol | Domain | Role |
| --- | --- | --- |
| \(\theta\) | \([0,\pi]\) | Polar view angle after \(4\mathrm{D}\rightarrow 3\mathrm{D}\) |
| \(\varphi\) | \([0,2\pi)\) | Azimuthal view angle |
| \(\tau\) | \(\mathbb{R}\) | \(w\)-slice / temporal observation offset (\(w_{\mathrm{eff}}=w-\tau\)) |
| \(\kappa\) | \(\ge 0\) | Caustic / aperture weight (**declared** modulation; \(\kappa=0\) ≡ classic projector) |

**Fidelity invariant (EI-PROJ-FIDELITY alignment):** when \(\theta=0\), \(\varphi=0\),
\(\tau=0\), \(\kappa=0\), projected coordinates must match `Projector4D` closed form
within `PHYSICAL_INVARIANT_TOL`.

**Continuity invariant:** away from the pole \(d_4+w_{\mathrm{eff}}=0\), small parameter
steps yield small changes in projected screen coordinates (local Lipschitz / finite
difference bound in tests).

## 4. ProjectionState

Frozen record produced by the kernel:

- Projector parameters: `d4`, `d3`, `scale`, `width`, `height`
- Continuous params: `theta`, `phi`, `tau`, `kappa`
- Observation: `modeId`, optional `intentId` / provenance fields
- Status tag: `declared` | `partial` (never self-assert `enforced`)

## 5. Observation modes (presets)

Presets compose ProjCC state with PLP / LiveLink vocabulary
(`perspective_w`, `slice_hyperplane`, LiveLink perspective / W-slice ids).
Status: **partial** for preset resolution; full v2 path-routing from
`OBSERVATION_MODE_RFC.md` remains **declared**.

## 6. ApertureFrame3D

Viewport-as-aperture API: maps a 2D viewport rectangle + ProjCC state to an
`ApertureFrame3D` (origin, basis, focal / near hints). Does **not** become print SoT.

## 7. Hyper-Caustic Lens

Official scene: `createHyperCausticLens` + `docs/4drs/validation/Hyper-Caustic-Lens.md`.
Verifier hooks may soft-skip when reference hashes / datasets are absent. Do not
claim north-star visual PASS without artifacts.

## 8. Sovereignty & GPU assist

- CPU RT4D print / still path remains sovereign.
- Vendor GPU skills (NVIDIA / AMD / HIP / ROCm) are **assist-only** for boundary
  honesty — projection aperture ≠ print SoT; no vendor lock-in required for ProjCC.
- GPU acceleration of continuous projection is **declared** roadmap.

## 9. Promotion rules

| From | To | Requires |
| --- | --- | --- |
| **declared** | **partial** | Unit tests green under `node --test` |
| **partial** | **enforced** | Runtime gate + conformance row + CI evidence (not in v0.1) |

## 10. Related artifacts

- Diagram: [`PROJECTION_CONTINUITY_DIAGRAM.md`](./PROJECTION_CONTINUITY_DIAGRAM.md)
- Integration: [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md)
- RFCs: [`../v2/observation/OBSERVATION_MODE_RFC.md`](../v2/observation/OBSERVATION_MODE_RFC.md),
  [`../v2/bvh-projection/BVH_AND_PROJECTION_RFC.md`](../v2/bvh-projection/BVH_AND_PROJECTION_RFC.md)
- SoT: `mrs/packages/renderer-core/src/render/rt4d/output/projector.js`
