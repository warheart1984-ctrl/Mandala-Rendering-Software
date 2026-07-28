# 03 — Implementor notes

**Trail:** `printer-mode-renderer-2026-07`  
**Stage:** Implementor  
**softwareCreationMode:** Constructor + Protocol + Optimizer  

## Shipped

- Surface contract + error state machine + sovereignty checks  
- PrintRequest normalize + patch onto cinematic qualityOpts  
- Evidence printer (beauty, evidence.json, lineage.json, hashes)  
- `run_digital_print` pipeline + `demo_digital_print.py`  
- Tests: contract load, sovereignty errors, evidence completeness, mocked determinism  

## Folded from cinematic trail

Sampling (spp/adaptive/stratified), tonemap aces-lite, firefly clamp via
`qualityOpts` when print patches RenderRequest to `quality=cinematic`.

## Denoise

`denoise: true` is recorded in evidence as **partial**; CPU denoise not applied
by default (**declared** path). Adaptive sampling **enforced** when opt-in +
covered by cinematic/sceneQuality tests.
