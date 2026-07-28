# 05 — Inspector acceptance

**Trail:** `printer-mode-renderer-2026-07`  
**Stage:** Inspector  
**softwareCreationMode:** Testwright  

## Tests

```text
pytest test_printer_mode.py test_pipeline.py  → 19 passed
```

## Demo

```text
python demo_digital_print.py --out-dir output/cecp-digital-print --samples 16
```

## Expected artifacts

- `G:\Mandala Rendering Software\output\cecp-digital-print\beauty.png`
- `G:\Mandala Rendering Software\output\cecp-digital-print\evidence.json`
- `G:\Mandala Rendering Software\output\cecp-digital-print\lineage.json`

## Tag matrix

| Capability | Tag |
|------------|-----|
| Surface contract + sovereignty | **enforced** |
| Error state machine | **enforced** |
| Evidence + hashes | **enforced** |
| Adaptive sampling (opt-in) | **enforced** |
| Tonemap aces-lite (opt-in) | **enforced** |
| Denoise | **partial** / **declared** |
| Draft CI speed | **enforced** (unchanged clamps) |
