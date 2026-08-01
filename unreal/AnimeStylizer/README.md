# AnimeStylizer — Cel-Shaded Anime Post-Process (Unreal Plugin Scaffold)

**Zero diffusion · zero API keys · structure/beauty lane aligned** with Constitutional Anime (not Print SoT / Digital Printer).

| Field | Value |
| --- | --- |
| Path in MRS | `unreal/AnimeStylizer/` |
| Unreal host | **skeleton** (per `AGENTS.md`) — not a full UE product |
| Plugin status | **skeleton / partial** — file tree + BP API + shader sketches; RDG not hooked into engine PP |
| Hackathon readiness | [`HACKATHON_READINESS.md`](./HACKATHON_READINESS.md) — evidence-bound matrix |
| Reliable demo (no UE) | `python scripts/hackathon-governed-anime-demo.py` |
| Genblaze handoff | `POST /api/anime` (**partial**) |
| License | MIT (same as MRS) |

> **Set to render?** Genblaze/structure→ffmpeg: **yes**. Full UE stylize: **no** (compile unknown; RDG skeleton).

## Status by feature

| Feature | Status | Notes |
| --- | --- | --- |
| Outline (8-neighbor Sobel depth+normal GBuffer) | **partial** (shader sketch) / **skeleton** (RDG) | `Shaders/AnimeOutline.usf` |
| Cel (2–8 band + shadow tint + highlight) | **partial** / **skeleton** | `Shaders/AnimeCelShading.usf` |
| Palette LUT 256×1 (6 presets) | **partial** | `GeneratePaletteLUTs.py` emits PNGs; BP `CreatePaletteLUT` |
| Color grade sat/contrast/gamma | **partial** / **skeleton** | `Shaders/AnimeColorGrade.usf` |
| Temporal AA velocity reproject + clamp | **partial** / **skeleton** | `Shaders/AnimeTemporalAA.usf` |
| Structure plate blend | **skeleton** | `LoadStructurePlate` + config; blend in PP material path |
| BP API surface | **partial** | Apply/Capture store config; LUT/load/save implemented |

### Performance (honesty)

| Claim | Status |
| --- | --- |
| R9 380 @ 1080p60 ≈ 1.1 ms total | **declared / operator-reported** from design brief — **not** measured in this repo |
| Per-pass cost table (~0.3 / 0.2 / 0.1 / 0.1 / 0.4 ms) | **declared** — treat as budget targets, not CI evidence |

## Copy into a UE project

MRS keeps plugins at `unreal/<Name>/` (same pattern as `FourDAdapter`, `GovernedEnginePlugin`).

1. Copy this folder into your project:
   - `YourProject/Plugins/AnimeStylizer/`  
   (entire tree: `.uplugin`, `Source/`, `Shaders/`, `Content/`, `Config/`, `README.md`)
2. Right-click `.uproject` → **Generate Visual Studio project files**
3. Build (VS / Rider). Enable: **Edit → Plugins → Rendering → AnimeStylizer**
4. Optional: merge comments from `Config/DefaultEngine.ini` into the project’s `Config/DefaultEngine.ini`
5. Generate LUTs:
   ```bash
   python Content/LUTs/GeneratePaletteLUTs.py
   ```
   Import PNGs as Texture2D: **Compression=TC_VectorDisplacementmap**, **SRGB=False**, **Filter=TF_Linear**, **NoMipmaps**

## Structure plate contract

Structure plates come from the Engine3D / RT4D **anime-structure** lane (not Print SoT):

- [`docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](../../docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md)
- Projection index: [`docs/4d-engine/projection/README.md`](../../docs/4d-engine/projection/README.md)

```cpp
UTexture2D* StructurePlate = UAnimeStylizerBlueprintLibrary::LoadStructurePlate(
    TEXT("C:/path/to/structure.png")
);

FAnimeStylizerConfig Config = UAnimeStylizerBlueprintLibrary::GetDefaultAnimeConfig();
Config.bUseStructurePlate = true;
Config.StructurePlate = StructurePlate;
Config.StructureBlend = 0.3f; // 0 = pure structure, 1 = pure anime
```

## Blueprint API

| Function | Role |
| --- | --- |
| `ApplyAnimeStylization` | Store config; returns source RT until RDG lands (**skeleton**) |
| `CaptureSceneAnimeStylized` | Scene capture then apply (**partial**) |
| `CreatePaletteLUT` | 256×1 from color stops (**partial**) |
| `LoadStructurePlate` | PNG → Texture2D (**partial**) |
| `SaveRenderTargetToPNG` | RT → PNG (**partial**) |
| `GetDefaultAnimeConfig` / `SetAnimeStylizationEnabled` | Defaults / module flag |

Operator workaround until RDG: build a **Post Process** material from `Content/Materials/AnimeStylizerMaterialNodes.txt` and assign to a Post Process Volume or Scene Capture.

## Quick Start (config)

```cpp
FAnimeStylizerConfig Config = UAnimeStylizerBlueprintLibrary::GetDefaultAnimeConfig();
Config.CelBands = 4;
Config.PaletteIntensity = 1.0f;
Config.Saturation = 1.1f;
Config.Contrast = 1.15f;
Config.Gamma = 1.0f;
Config.bEnableTemporalAA = true;

UTextureRenderTarget2D* StyledRT = UAnimeStylizerBlueprintLibrary::CaptureSceneAnimeStylized(
    this, SceneCaptureComponent, Config
);
```

## Palette LUTs (6 presets)

| LUT | Mood |
| --- | --- |
| `AnimePalette_Morning` | Warm sunrise |
| `AnimePalette_Noon` | Bright daylight |
| `AnimePalette_Night` | Moody moonlight |
| `AnimePalette_Sunset` | Dramatic evening |
| `AnimePalette_Cyberpunk` | Neon |
| `AnimePalette_Monochrome` | Manga gray |

PNGs may already exist under `Content/LUTs/`; re-run the generator anytime. There are **not** six named `FAnimeStylizerConfig` stylization preset packs — only these LUT palettes + default config fields.

## Verification checklist (aspirational claims)

| Claim | Result | Notes |
| --- | --- | --- |
| Fully scaffolded + install→export docs | **pass** | This README + readiness matrix |
| Compiles UE 5.3+ | **unknown** | No repo UE build evidence |
| PP material applies without errors | **unknown** | Node notes only (`.txt`, not `.uasset`) |
| LUTs generate/import | **pass** / **unknown** | Generate **pass**; UE import **unknown** |
| BP nodes expose all config | **partial** | Struct exposed; Apply is skeleton |
| Structure plate blend Engine3D/RT4D | **fail** (skeleton) | Load + config only |
| ffmpeg clean H.264 | **unknown** until demo run | Operator recipe; demo script when ffmpeg present |
| Preset pack: 6 LUTs + 6 stylization presets | **partial** | 6 LUTs **pass**; 6 stylization packs **fail** |
| Cross-engine Genblaze→UE→ffmpeg full provenance | **partial** | Genblaze→ffmpeg **yes**; UE optional |
| “You’re set to render” (full UE) | **fail** | Use Genblaze path instead |

## Export (ffmpeg)

```bash
# After Sequencer / SceneCapture PNG sequence:
ffmpeg -y -framerate 30 -i "Saved/VideoCaptures/frame_%04d.png" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -vf "scale=1920:1080:flags=lanczos" \
  anime_demo.mp4
```

## Non-claims

- **Not** TV anime / hand-drawn line art  
- **Not** Full Photoreal / Digital Printer SoT  
- **Not** CKL-enforced provenance (declared only)  
- **Not** a measured R9 380 profile in this repository  
- Unreal host remains **skeleton** — this plugin does not make MRS a shipping UE product  

## Tree

```
AnimeStylizer/
├── AnimeStylizer.uplugin
├── README.md
├── HACKATHON_READINESS.md
├── Config/DefaultEngine.ini
├── Content/
│   ├── LUTs/GeneratePaletteLUTs.py + AnimePalette_*.png (6)
│   └── Materials/AnimeStylizerMaterialNodes.txt
├── Shaders/
│   ├── AnimeOutline.usf
│   ├── AnimeCelShading.usf
│   ├── AnimeColorGrade.usf
│   └── AnimeTemporalAA.usf
└── Source/AnimeStylizer/
    ├── AnimeStylizer.Build.cs
    ├── Public/   (Module, Types, BlueprintLibrary, *Pass.h)
    └── Private/  (matching .cpp)
```

## Implementor handoff

1. Enable `Renderer` in `AnimeStylizer.Build.cs`  
2. `IMPLEMENT_GLOBAL_SHADER` for each `.usf` under `/Plugin/AnimeStylizer/`  
3. Insert passes into the post-process / view extension chain  
4. Implement structure-plate blend in the graph (or finish PP material)  
5. Profile on target GPU before promoting any ms claims beyond **declared**
