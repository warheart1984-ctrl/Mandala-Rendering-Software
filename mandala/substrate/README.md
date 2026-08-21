# Mandala substrate

RHFD vacuum → Mandala pixels + Simulation Chamber motion. **Partial.** See [MAPPING.md](./MAPPING.md).

```bash
node --test mandala/substrate/test/ground-state.test.js
node mandala/substrate/clean-plate.mjs
node --test mandala/proto/test/four-proofs.test.js
```

Lattice Hamiltonian (named −∇H, Claim A): [`hamiltonian.mjs`](./hamiltonian.mjs). Certified proto default recovers Laplacian. Artifacts: `output/mandala-hamiltonian/`.

Governed-runtime proto (tiny 32³×64 universe): [`../proto/README.md`](../proto/README.md).

