# Builder scaffold manifest — AnimeStylizer UE plugin

| Field | Value |
| --- | --- |
| Trail | `anime-stylizer-ue-plugin-2026-08` |
| Role | Builder (+ light Implementor for LUT script + honesty tags) |
| Path | `unreal/AnimeStylizer/` |
| Status | **skeleton / partial** |
| Charter edits | none |

## Intent

Land user-provided AnimeStylizer Unreal plugin tree into MRS Unreal host without overclaiming RDG completeness or R9 380 timings.

## Manifest (landed)

- `AnimeStylizer.uplugin`
- `Source/AnimeStylizer/` Module, Types, BlueprintLibrary, Outline/Cel/ColorGrade/TemporalAA pass shells
- `Shaders/*.usf` algorithm sketches
- `Content/LUTs/GeneratePaletteLUTs.py` (runnable; 6 palettes)
- `Content/Materials/AnimeStylizerMaterialNodes.txt`
- `Config/DefaultEngine.ini` (snippet)
- `README.md` (honesty + structure-plate contract link + ffmpeg)

## Implementor next

1. Enable Renderer + `IMPLEMENT_GLOBAL_SHADER`
2. View extension / PP insertion
3. Structure-plate blend in graph
4. Profile before promoting ms claims
