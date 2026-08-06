# @mrs/mythar-encoder

Deterministic **Mythar → NSM prime → SceneSpec** encoder implementing the
declared v2 front-end contract:
`docs/4d-engine/v2/scene-spec/MYTHAR_SCENESPEC_CONTRACT.md`

Status: **declared** (encoder exists; not wired to `render_rt4d_from_prompt`).

## Pipeline

```
Mythar expression / seed-dict EN·ZH
   │  (subprocess: python -m mythar compile)
   ▼
Stage 1 · MytharEncode   → root/composite surfaces (registry_refs)
Stage 2 · PrimitiveToPrimes → PrimeVector (60-prime constitutional table)
Stage 3 · PrimesToSceneSpec → SceneSpec (deployed shape, mode-aware)
   │
   ▼
Evidence record (PromptRecord + PrimeVector + SceneSpec + promptHash)
```

## Usage

```js
import { encode } from '@mrs/mythar-encoder';

const out = encode('ja tor', { mode: 'cinematic' });
if (out.ok) {
  out.sceneSpec.surface;   // 'clifford-torus' (mode override)
  out.primeVector;         // { PATH: 1, BETWEEN: 0.6, ... }
  out.provenance.roots;    // ['tor']
  out.evidenceBundleId;    // 'ev-...'
}

// English seed-dict input; unknown tokens surface, never silently hashed:
const partial = encode('light crystal', { sourceLanguage: 'en' });
partial.provenance.unresolvedTokens; // ['crystal']
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MYTHAR_PYTHON` | `python` | interpreter invoking `python -m mythar` |
| `MYTHAR_PYTHONPATH` | `G:\mythar\mythar-v0.2\src` | compiler source root |
| `MYTHAR_REGISTRY_DIR` | `G:\mythar\mythar-registry` | registry directory (honored by compiler) |

Mythar (`G:\mythar`) is the source of truth and is **never** modified by MRS.

## Honest scoping (non-claims)

- Not wired to `render_rt4d_from_prompt`; the frozen v1.5 hash path
  (`buildSceneSpec`) remains authoritative until conformance is validated.
- English→Mythar mapping is a **declared seed dict** (~18 EN / 8 ZH tokens
  mirrored from `mythar-v0.2/src/mythar/semantic_input.py`), not a phonemic
  reconstruction engine. Unknown tokens are surfaced as `unresolved_tokens`.
- `promptHash` is identity-only; it does **not** select surface/planes in v2.

## Tests

```sh
npm test   # 22 tests: unit (pure) + live-compiler integration (§6 A-D)
```

Integration tests skip when the Mythar compiler is unavailable.
