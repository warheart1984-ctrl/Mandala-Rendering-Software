# PLP v2 — Platform-Level Protocol

> **Status:** **declared / Phase C** (Drive-G-1). Minimal `PlpValidator` skeleton exists for wave + required fields; not a full gate.

## Stage 2 — wave (when `wave.enabled`)

- `gridSize.nx|ny|nz` positive integers  
- `c > 0`, `dt > 0` finite  
- `beta` / `gamma` finite when present  
- `waveDir` finite and non-zero  

## Stage 5 — wave safety (declared)

- No NaN/Inf in coupling helpers  
- Backend-neutral (no RHI-hard dependency in the document)  
- GPU wave step remains **roadmap**

Code: `mrs/packages/renderer-core/src/render/rt4d/plp/PlpValidator.js` (**skeleton**).

## Non-claims

- [ ] Full PLP v2 constitutional enforcement  
- [ ] Host adapters cannot bypass validation  
