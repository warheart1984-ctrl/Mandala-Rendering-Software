# BYOK-Assisted Pipeline (Genblaze → NIM → SceneSpec → RT4D)

**Artifact:** `docs/genblaze/pipeline/byok-assisted-pipeline.md`  
**Status:** Constitutional diagram · assist path **partial** · print SoT **enforced** elsewhere

```
┌──────────────────────────────────────────────────────────────┐
│                        GENBLAZE UI                           │
│  - User enters API key (session only)                        │
│  - User selects model (override allowed)                     │
│  - User uploads image / enters prompt                        │
└───────────────┬──────────────────────────────────────────────┘
                │  X-NVIDIA-API-Key / Bearer (local BYOK)
                ▼
┌──────────────────────────────────────────────────────────────┐
│               GENBLAZE REQUEST LAYER (loopback)              │
│  - Honors BYOK when local (or GENBLAZE_ALLOW_BYOK=1)         │
│  - Injects Authorization + X-NVIDIA-API-Key toward NIM       │
│  - Sends prompt + optional image + model override            │
│  - Never persists key                                        │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│                             NIM FLUX                         │
│  - T2I / assist creative output (vendor)                     │
│  - Returns assist-only creative output                       │
└───────────────┬──────────────────────────────────────────────┘
                │  (no key in artifact)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                     SceneSpec Extractor                      │
│  - Converts FLUX output → SceneSpec hints                    │
│  - Cameras, lighting, materials, palette, tags               │
│  - Assist-only                                               │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│                     CharacterSpec Converter                  │
│  - SceneSpec → CharacterSpec                                 │
│  - Face style, palette, tags, lighting                       │
│  - Assist-only                                               │
└───────────────┬──────────────────────────────────────────────┘
                │  human curation
                ▼
┌──────────────────────────────────────────────────────────────┐
│                         RT4D CPU PRINT                       │
│  - Deterministic                                              │
│  - Sovereign                                                   │
│  - No BYOK keys ever enter                                    │
│  - No GPU/NIM bytes as print SoT                              │
└──────────────────────────────────────────────────────────────┘
```

This is the constitutional rendering pipeline for Genblaze assist → sovereign print.
