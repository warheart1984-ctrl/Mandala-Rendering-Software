# Anime Lane Cross-Engine Contract v1

| Field | Value |
| --- | --- |
| Title | Mandala Rendering System (MRS) × Genblaze × Unreal Engine AnimeStylizer |
| Version | **1.0** |
| Status | **Declared** (not promoted; not a runtime CKL gate) |
| Scope | Cross-engine governed anime rendering lane |
| Author | Jon Halstead (warheart1984-ctrl) |
| Drive-G-1 | Contract text is authoritative intent. Implementation maturity is **partial** / **skeleton** where noted. “Fully scaffolded” (§9) means **file-tree scaffold**, not verified UE compile or promoted lane. |
| SoT path | `docs/anime-lane/ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md` |
| Related | [`README.md`](./README.md) · [`ANIME_LANE_HEALTH_SCHEMA.v1.json`](./ANIME_LANE_HEALTH_SCHEMA.v1.json) · [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](../4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) · [`StructurePlateProjectionProvenance.v1.schema.json`](../../schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json) · [`unreal/AnimeStylizer/`](../../unreal/AnimeStylizer/) · [`DEVPOST_GOVERNED_ANIME_PIPELINE.md`](../ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md) |

---

## 1. Purpose

The Anime Lane is a governed, cross-engine rendering pathway that unifies:

- Genblaze/MRS backend (still-image generation, lane governance, provenance)
- AnimeStylizer Unreal Engine plugin (real-time stylization pipeline)
- Structure-plate overlays (Engine3D / RT4D projection plates)
- Export pipeline (PNG → ffmpeg → final video)

This contract defines the inputs, outputs, governance, provenance, and interoperability rules for the Anime Lane across all engines.

## 2. Lane Identity

| Field | Value |
| --- | --- |
| Lane Name | Anime Lane |
| Code | `anime` |
| Lane Class | Governed style lane |

Properties:

- Cross-engine
- Replayable
- Provenance-bearing

Lane Guarantees:

- Deterministic still-image generation
- Deterministic stylization pipeline
- Deterministic structure-plate blending
- Full provenance disclosure
- Multi-engine reproducibility

> Implementation note (**declared** guarantees): reproducibility is a contract target. Current Genblaze handoff is **partial**; UE RDG stylize is **skeleton/partial**.

## 3. Backend Contract (Genblaze/MRS)

### Endpoint

| Field | Value |
| --- | --- |
| Code | `POST /api/anime` |

### Behavior

- Forces `style="anime"`
- Uses governed still-image pipeline
- Returns:

```json
{
  "lane": "anime",
  "anime_lane": {
    "contract_version": "1.0",
    "style_forced": true,
    "provenance": { }
  }
}
```

### Health Disclosure

`/health` must expose:

- `anime_lane.endpoint`
- `anime_lane.status`
- `anime_lane.contract_notes`
- `anime_lane.provenance_schema`

### Plugin OpenAPI

- `/api/anime` must be advertised in ChatGPT/Custom GPT plugin
- Bearer protection when `CHATGPT_PLUGIN_KEY` is set

## 4. Unreal Engine Contract (AnimeStylizer)

### Module

- `AnimeStylizerModule`
- Startup/shutdown
- Pass registration
- Config struct exposure

### Rendering Passes

| Pass | Behavior |
| --- | --- |
| `AnimeOutlinePass` | Depth + normal Sobel; 8-neighbor edge detect |
| `AnimeCelShadingPass` | 2–8 band toon ramp; shadow tint; highlight boost |
| `AnimeColorGradePass` | Palette LUT (256×1); saturation; contrast; gamma |
| `AnimeTemporalAAPass` | Velocity reprojection; 3×3 clamp; history rejection |
| `StructurePlateBlend` (optional) | Engine3D / RT4D plate overlay; opacity-controlled; supports `projector4d-sot` and `drop_w` plates |

### Blueprint API

- `ApplyAnimeStylization`
- `CaptureSceneAnimeStylized`
- `CreatePaletteLUT`
- `LoadStructurePlate`
- `SaveRenderTargetToPNG`

### Shader Stack

- `AnimeOutline.usf`
- `AnimeCelShading.usf`
- `AnimeColorGrade.usf`
- `AnimeTemporalAA.usf`

> Implementation maturity: module/passes/shaders/BP surface are **skeleton/partial** (scaffold present; RDG not engine-hooked; UE compile **unknown** in this repo).

## 5. Structure Plate Contract (Engine3D / RT4D)

### Input Plate Types

- Structure plate (3D)
- Anime-Structure plate (Projector4D)
- Literal-XYZ plate (`drop_w`)

### Plate Requirements

- Must be provided as `UTextureRenderTarget2D` (UE consumer) / PNG + texture load for operator path
- Must include provenance:

```json
{
  "projector_id": "...",
  "projection_method": "...",
  "reference_model": "...",
  "d4": null,
  "alpha": null,
  "lane": "anime-structure",
  "print_sot_touched": false
}
```

Schema (declared): [`schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json`](../../schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json)

### Blend Rules

- Blend mode: linear interpolate
- Opacity: 0.15–0.60 (recommended)
- High opacity allowed for engineering/debug lane
- Near-pole `projector4d-sot` plates must reduce opacity automatically

## 6. Cross-Engine Data Flow

### Pipeline

```
Genblaze/MRS → UE AnimeStylizer → Structure Plate Blend → PNG Frames → ffmpeg → Final Anime Video
```

Reliable hackathon demo may omit the UE leg:

```
Genblaze/MRS → structure plate → PNG Frames → ffmpeg → Evidence
```

### Data Flow Contract

Backend produces:

- Anime still-images
- Optional structure plates
- Full provenance

UE AnimeStylizer consumes:

- Scene GBuffer
- Velocity buffer
- Structure plates
- Palette LUT
- Stylization config

UE Output:

- Stylized PNG frames
- Optional structure-plate overlays
- Export-ready sequence

ffmpeg produces:

- Final video (`anime_demo.mp4`)

## 7. Provenance Contract

### Required Fields

- `lane`
- `style_forced`
- `palette_lut`
- `outline_pass_version`
- `cel_shading_version`
- `color_grade_version`
- `temporal_aa_version`
- `structure_plate_used`
- `structure_plate_provenance`
- `export_settings`

### Replay Requirements

- All passes must be deterministic
- All LUTs must be versioned
- All structure plates must include projector provenance
- Export settings must be logged

## 8. Multi-Lane Governance

### Anime Lane Coexistence

Anime Lane must coexist with:

- `/api/still`
- `/api/manga`
- `/api/realistic`
- `/api/celshade`
- `/api/rt4d`
- `/api/structure`

> Note: coexistence is a governance rule. Sibling endpoints may be **declared** / not all implemented yet.

### No Universal Winner

Anime Lane is not the universal stylization lane. It is a governed lane with specific artistic intent.

### Promotion Eligibility

Anime Lane is eligible for:

- Cross-engine promotion
- Structure-plate integration
- Anime-Structure projector lane binding

## 9. Promotion Gate (Anime Lane)

### Required for Promotion

- Full ink-cel evaluation
- Structure-plate stability
- Temporal AA ghosting thresholds
- Palette LUT validation
- CSE/CCC sign-off
- ProjCC binding
- CI provenance validator

### Current Status

- **Declared**
- Fully scaffolded (**files / API surface** — not verified UE compile)
- **Not yet promoted**

## 10. Versioning

| Field | Value |
| --- | --- |
| Contract Version | `1.0` |

### Upgrade Path

- **v1.1:** ink-cel integration
- **v1.2:** projector lane binding
- **v1.3:** multi-palette adaptive grading
- **v2.0:** full anime lane promotion
