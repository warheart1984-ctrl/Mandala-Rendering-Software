# Mandala holography (Claim A)

**Synthetic holographic dual (partial):** projector \(P\) / \(h_{\mu\nu}\), EGT time-as-relationships, EFR dual render. Not AdS/CFT. Reconstruct = **partial/toy**.

Contracts:
- [`docs/mandala/HOLOGRAPHIC_BULK_BOUNDARY.md`](../../docs/mandala/HOLOGRAPHIC_BULK_BOUNDARY.md)
- [`docs/mandala/HOLOGRAPHIC_CIEMS.md`](../../docs/mandala/HOLOGRAPHIC_CIEMS.md) — CIEMS / Sovereign lens (soft lab invariant)

```bash
node --test mandala/holography/test/holography.test.js
node --test mandala/holography/test/tiny-scene.test.js
node --test mandala/holography/test/expansions.test.js
node --test mandala/proto/test/four-proofs.test.js
node mandala/holography/demo.mjs
node mandala/holography/demo.mjs --egt
node mandala/holography/test-scene.mjs
node mandala/holography/test-scene.mjs --interference
```

α=1, β=0.25 defaults for \(K_i=\alpha\|\nabla\varepsilon\|+\beta\Delta\varepsilon\).

Artifacts:
- Tiny scene → `output/mandala-holography/tiny-scene/`
- Interference → `output/mandala-holography/interference/`
- Optional console → `mandala/holography/console/holography-console.html`
