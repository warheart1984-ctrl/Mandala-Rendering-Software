# Lattice + governance Hamiltonians

**Status:** lattice H **working** (scalar 2D / certified 3D coupling). Governance H_gov **working** on a demo graph. Vector σ, 32³ viz, real CAR/CDR store: **partial** / **declared**. Claim A only.

Physics σ (Mandala lattice φ) and governance σ (AAIS graph) are **different fields**. Organ Map unchanged.

## Physics — lattice H(σ)

```
H(σ) = Σ_i U(σ_i) + Σ_⟨i,j⟩ J_ij W(σ_i, σ_j)
U(σ_i) = (m²/2) ‖σ_i‖² + λ ‖σ_i‖⁴
W(σ_i, σ_j) = (1/2) ‖σ_i − σ_j‖²
dσ_i/dt = −∂H/∂σ_i
σ_i(t+1) = σ_i(t) − η ∂H/∂σ_i
```

Scalar: `∂U/∂σ = m² σ + 4λ σ³`. Coupling with Neumann = `−J ∇²σ`. Certified proto default `m²=0, λ=0, J=1, η=κ` matches the old Laplacian update, now named `lattice-hamiltonian`.

**Mass:** φ⁴ U is **not** mass-conserving. AAIS `proto.scalar-mass-conservation` still rejects illegal commits. Hamiltonian relaxation is the solver; invariants still gate.

**“Singularity replacement”:** structural phase-change analogue (order parameter vs m²). Not infinite density. Not a proven critical exponent (**partial**).

```bash
node mandala/engine/hamiltonian/run.mjs
node --test mandala/engine/test/hamiltonian.test.js
```

Artifacts: `output/mandala-hamiltonian/`

## Governance — H_gov (6 coordinates)

Physics lattice H (`mandala/substrate/hamiltonian.mjs`) is a **separate field**. Do not smash them.

```
σ_i = (r, a, e, c, t, jFit) ∈ [0,1]⁶
U_gov = α_r r² + α_a a² + α_c (1−c)² + α_e (1−e)² + α_t (1−t)² + α_j (1−jFit)²
W_gov = (1/2) Σ w_k (Δk)²     ← 1/2 is inside W; ∂W/∂r_i = w_r (r_i−r_j)
H_gov = Σ_i U_gov + Σ_⟨i,j⟩ J_ij W_gov     ← each unordered pair once
x ← clamp01(x − η ∂H/∂x)                  ← Jacobi (all grads from current σ, then commit)
```

Inner `relaxGovStep`: η=0.05, α_t=α_j=0.8. Nightly (JS+Python): η=0.01, all α=w=1. Same H_gov, not a second Hamiltonian. Jacobi, not Gauss-Seidel.

```bash
node --test mandala/engine/test/hamiltonian.test.js
node mandala/engine/hamiltonian/nightly.mjs
python3 mandala/engine/hamiltonian/nightly_governance.py
python3 mandala/engine/hamiltonian/test_governance_api.py
python3 mandala/engine/hamiltonian/governance_api.py
# dashboard: http://127.0.0.1:8765/dashboard
```

GPU compute path: **declared** (`gpu-hgov.skel.glsl`) — not dispatched, not claimed on RX 580.

API is a localhost analogue (127.0.0.1). Auth omitted; tokens assumed later — no fake OAuth. Not a sold SaaS.

JACA map (names reused; **not** AAIS-UL v20): CAR → evidence; CDR → edges; CEL → parameters; CPE analogue → execute only if `H_gov < threshold` (engine ABI path). CIEMS `CPE-*` packets are a homonym.

Real CAR/CDR store: **declared**. 8+ dims: **declared**. Gradient descent on a governance cost is a computational analogue, not vacuum-as-decision-making.
