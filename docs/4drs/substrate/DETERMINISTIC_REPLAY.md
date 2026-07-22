# Deterministic replay — hooks & validator outline

**Status:** **declared** (validator outline) / **partial** (existing browser provenance & CSSV).

## Contract

\[
S_{n+1} = T(S_n, u_n)
\]

Replay: \(S_n = T^{(n)}(S_0,\{u_k\}_{k=0}^{n-1})\).

## Existing evidence paths

| Artifact | Path | Status |
| --- | --- | --- |
| Provenance recorder | `engine/runtime/ProvenanceRecorder.*` | **partial** |
| Replay service | `engine/runtime/ReplayService.*` | **partial** |
| CSSV frames/transitions | `cssv/` | **partial** |
| Unity frame/seed hooks | `MRSUnityLiveLink.lastFrame/lastSeed` | **skeleton** |
| RT4D render seed | `renderRT4DFrame({ seed })` | **partial** |

## Validator outline (skeleton)

See `scripts/replay-validator-outline.mjs`:

1. Load \(S_0\) + input ledger \(\{u_n\}\) (CSSV or JSON).  
2. Step \(T\) for \(N\) frames with fixed seed.  
3. Compare hashes of selected state slices (params, entity poses).  
4. Fail on drift beyond documented epsilon.

**Does not** claim bit-identical multi-host replay as enforced.
