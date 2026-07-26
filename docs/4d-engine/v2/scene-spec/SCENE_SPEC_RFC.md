# Scene Specification RFC — LLM → MRS render contract

| Field | Value |
| --- | --- |
| Status | **Partial** — still-render path **enforced** in renderer-core + Genblaze; clip / live-link **declared** or **partial** |
| Audience | Hackathon Genblaze + Backblaze demo; LLM tool authors |
| Drive-G-1 | Status tags below are binding. Do not claim MP4 encoding, diffusion, or semantic text-to-image. |
| Depends on | WorldDocument v1 (`@mrs/scene-schema`), PLP `projectWorld`, RT4D `PathTracer4D`, Genblaze B2 pipeline |

## 1. Purpose

Define a structured **SceneSpecification** JSON contract so an LLM (or other authoring tool) specifies **WHAT** to render — entities, transforms, materials, camera, observation mode, optional animation — while MRS executes **HOW** (validate → convert → deterministic RT4D path trace → PNG + provenance → optional B2 upload).

Pattern: `LLM → SceneSpecification → validate → convert → render → provenance`.

## 2. Relationship to existing shapes (**enforced** overlap)

SceneSpecification **extends** WorldDocument v1 rather than inventing a parallel entity format:

| Layer | Package | Role |
| --- | --- | --- |
| WorldDocument / Scene4DDTO | `@mrs/scene-schema` | Structural DTOs + `validateWorldDocument` / `validateScene4DDTO` (**enforced** tests) |
| SceneSpecification | `@mrs/renderer-core/scene-spec` | WorldDocument fields + camera / lights / output / animation; capability validate; convert to RT4D + PLP world |
| PLP | `renderer-core/plp` | WorldDocument → Scene3D mesh projection (**enforced** for surface kinds) |
| RT4D still | `scripts/render-scene.mjs` | Spec → Hypersphere/Hyperplane Scene4D → path-traced PNG (**enforced**) |

Prefer extending WorldDocument `entities[]`, `materials[]`, `defaultObservation`, `transform4d` over duplicating Scene4DDTO widget fields. Scene4DDTO remains the ChatGPT single-surface widget contract; SceneSpecification is the multi-entity render contract.

## 3. SceneSpecification shape

### 3.1 Root (**enforced** structural + capability checks)

```json
{
  "schemaVersion": "1.0",
  "kind": "SceneSpecification",
  "id": "string (required, non-empty)",
  "name": "string?",
  "description": "string?",
  "materials": [ /* WorldMaterial */ ],
  "entities": [ /* WorldEntity — min 1 */ ],
  "defaultObservation": { "modeId": "perspective_w|slice_hyperplane", "params": {} },
  "camera": { /* §3.3 */ },
  "lights": [ /* §3.4 */ ],
  "output": { /* §3.5 */ },
  "animation": { /* §3.6 — optional */ },
  "metadata": {}
}
```

`kind` is optional but recommended (`"SceneSpecification"`). Absent `kind`, a document that validates as WorldDocument **plus** optional camera/lights/output/animation is accepted as a SceneSpecification (**enforced**).

### 3.2 Entities & geometry (**enforced** for RT4D-supported kinds)

WorldDocument geometry kinds remain valid for PLP:

| `geometry.kind` | PLP | RT4D still path |
| --- | --- | --- |
| `surface` | **enforced** (registry sample) | **enforced** expand: known surfaceIds → hypersphere layouts |
| `meshRef` / `sdfRef` | **partial** (inline / world-local only) | **declared** — rejected by RT4D capability check |
| `empty` | locator | skipped |
| `hypersphere` | N/A (PLP treats as unresolved unless aliased) | **enforced** — `center`/`radius` or transform.translate + radius |
| `hyperplane` | N/A | **enforced** — `normal` + `offset` |

Supported RT4D `surfaceId` expansions (**enforced**): `tesseract`, `clifford-torus` / `clifford_torus`, `central-orb` (alias), `lattice-grid`, `torus-ring`, `orbital-cluster`. Unknown surfaceIds → capability error with field path.

Transform4D: `translate` / `rotate` (xy,xz,xw,yz,yw,zw) / `scale` — same as WorldDocument (**enforced** validation).

### 3.3 Camera (**enforced**)

```json
{
  "position4d": [x, y, z, w],
  "target4d": [x, y, z, w],
  "fovX": 52, "fovY": 52, "fovZ": 45, "fovW": 28
}
```

If omitted, convert uses deterministic defaults from `output.seed` (stable orbit) — same seed → same camera (**enforced**).

### 3.4 Lights (**enforced** when present)

RT4D supports emissive hypersphere lights today. Spec lights:

```json
{
  "id": "key",
  "center": [2.4, 3.3, -1.6, 0.7],
  "radius": 0.95,
  "emission": [17, 16, 14.5]
}
```

Area lights / IES / env maps: **declared** — not in capability set; rejected with path.

### 3.5 Output settings (**enforced**)

| Field | Default | Cap |
| --- | --- | --- |
| `width` / `height` | 448 | 1024 |
| `samples` | 24 | 512 |
| `maxDepth` | 5 | 12 |
| `seed` | hash(id) if omitted | uint32 |
| `exposure` | 1.35 | finite > 0 |

### 3.6 AnimationTimeline (**partial**)

```json
{
  "duration": 2.0,
  "fps": 12,
  "keyframes": [
    {
      "time": 0,
      "camera": { "position4d": [4, 1.2, 0, 0] },
      "entities": {
        "tess": { "transform4d": { "rotate": { "xw": 0 } } }
      }
    },
    {
      "time": 2,
      "camera": { "position4d": [0, 1.2, 4, 0] },
      "entities": {
        "tess": { "transform4d": { "rotate": { "xw": 6.283185307179586 } } }
      }
    }
  ]
}
```

| Capability | Status |
| --- | --- |
| Linear keyframe interpolation of `transform4d.rotate` / `translate` / `scale` | **enforced** |
| Linear camera `position4d` / `target4d` | **enforced** |
| Sample at fps → N frame specs | **enforced** |
| Cubic / bezier / easing curves | **declared** |
| MP4 / video encode | **declared** — Genblaze delivers frame sequence / zip only; no in-image encoder |

## 4. Observation modes (**enforced** names; PLP vs RT4D)

| `modeId` | PLP `projectWorld` | RT4D still |
| --- | --- | --- |
| `perspective_w` | **enforced** | camera FOV path (default) |
| `slice_hyperplane` | **enforced** | **declared** for still CLI (spec accepted for PLP convert; RT4D uses camera) |

Do not invent modes the renderer cannot execute.

## 5. Pipeline stages

1. **parse** — JSON → object; WorldDocument-overlapping fields checked with structured `{ path, message }` errors (**enforced**).
2. **validate** — capability vs RT4D/PLP support (surface ids, resolution caps, light kinds) (**enforced**).
3. **convert** — → `{ worldDocument, rt4dDescriptor }` deterministic (**enforced**).
4. **timeline.sample** — optional frame specs (**enforced** linear).
5. **render** — `render-scene.mjs` → PNG + provenance (spec hash, seed, frame index) (**enforced**).
6. **upload** — Genblaze `POST /api/render-scene` → B2 `{prefix}/scene-spec/{run_id}/` (**enforced** when B2 configured; else local preview).

Import note: `@mrs/scene-schema` is TypeScript with `dist/` emit; `@mrs/renderer-core` is plain JS. The scene-spec module uses a **thin JS structural validator** aligned with WorldDocument field rules rather than a hard package dependency, so Node can load without a prior `tsc` of scene-schema. When `dist/` is present, callers may still use `@mrs/scene-schema` validators independently.

## 6. Provenance contract (**enforced**)

Still provenance includes at least:

- `kind: "deterministic-scene-spec-4d-render"`
- `specHash` (SHA-256 of canonical JSON)
- `seed`, `frameIndex` / `timeSeconds` when sampled
- `width`, `height`, `samples`, `maxDepth`, `sha256` (PNG)
- `determinism: "same specHash + seed + frame → byte-identical PNG"`

## 7. Status summary (Drive-G-1)

| Deliverable | Status |
| --- | --- |
| This RFC | **declared** (contract) + cross-links to **enforced** code |
| `renderer-core/src/scene-spec/*` | **enforced** (unit tests) |
| `scripts/render-scene.mjs` | **enforced** |
| Genblaze `POST /api/render-scene` | **enforced** (pytest mocked) |
| Genblaze `POST /api/render-clip` | **partial** / **declared** — frames zip if implemented; no MP4 |
| live-link `type: scene_spec` | **partial** — parse/validate/convert ack; no remote mesh push claimed |

## 8. Non-goals

- Text-to-image / diffusion / Seedance as the scene-spec backend.
- Claiming Unreal/Unity host mesh sync beyond live-link ack.
- Encoding MP4 inside the Genblaze container for this hackathon path.
