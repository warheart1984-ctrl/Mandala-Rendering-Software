# Image → SceneSpecification RFC — scene interpretation + path-traced full frame

| Field | Value |
| --- | --- |
| Status | **Phase 1 enforced** (Genblaze bridge + MRS still); **Phase 3 declared** (reconstruction roadmap) |
| Audience | Hackathon Genblaze operators; NIM vision authors |
| Drive-G-1 | Status tags below are binding. Do **not** claim photogrammetry, depth maps, mesh recovery, pose estimation, or “4D reconstruction.” |
| Depends on | [SCENE_SPEC_RFC.md](./SCENE_SPEC_RFC.md), `@mrs/renderer-core/scene-spec`, Genblaze `render-scene.mjs` path |

## 1. Purpose

Define the **Image → SceneSpecification → MRS full-frame** path:

`image bytes → multimodal LLM emits SceneSpecification → validate → MRS path-traces FULL frame → B2/local manifest`.

Honest product language: **scene interpretation + path-traced full frame**. Never “4D reconstruction.”

## 2. Pipeline stages

| Stage | What happens | Status |
| --- | --- | --- |
| 1. Ingest / resolve | Accept base64, ingest id, or generate `run_id` preview bytes | **enforced** |
| 2. Weak priors | Heuristic palette/aspect (`analyze_image_bytes`) injected into the prompt only | **enforced** |
| 3. NIM vision | Multimodal chat returns **only** SceneSpecification JSON | **enforced** when NVIDIA key + model available; else skip to heuristic |
| 4. Validate (Node SoT) | `validateSceneCapabilities(..., { target: "rt4d" })` via renderer-core | **enforced** |
| 5. Repair | One repair pass with structured error list | **enforced** |
| 6. Heuristic fallback | Fixed surface map from palette/aspect; `output.seed` = image SHA-256 | **enforced** |
| 7. Render | `render-scene.mjs` full-frame RT4D still → PNG + provenance | **enforced** when Node/script present |
| 8. Persist | B2 `{prefix}/image-to-scene/{run_id}/` or local preview | **enforced** when B2 configured |

## 3. Allowed LLM output

The model may emit **only** an existing **SceneSpecification** object (see SCENE_SPEC_RFC §3). Prefer:

- `geometry.kind: "surface"` with `surfaceId` ∈ RT4D allow-list (`tesseract`, `clifford-torus`, `lattice-grid`, `torus-ring`, `orbital-cluster`, `central-orb`, `hopf-surface`, `trefoil-4d`, `torus-3d`, …)
- `camera.position4d` / `target4d`
- `materials[].color` from the image palette (weak prior)
- Deterministic `output.seed` from image SHA-256 when the model omits seed

**Rejected on the RT4D path:** bare `meshRef` / `sdfRef` without a supported surface expansion.

## 4. Explicit non-claims (Phase 1)

Phase 1 does **not**:

- Recover a depth map, point cloud, or mesh from the photo
- Estimate camera pose or object pose from the image
- Perform photogrammetry or multi-view reconstruction
- Claim the path-traced frame is a geometric reconstruction of the input photo

`analysis_mode` / response notes must state that this is **scene interpretation**, not geometric reconstruction.

## 5. Phase 3 — reconstruction (declared roadmap only)

Future work **may** add depth/mesh/pose recovery and feed richer SceneSpecification geometry. That work is **declared** only — not implemented, not exposed as available capability in `/health`, and must not be implied by operator copy in Phase 1.

## 6. Genblaze surface

| Route / flag | Role | Status |
| --- | --- | --- |
| `POST /api/image-to-scene` | Interpret → optional full-frame MRS render | **enforced** |
| `GENBLAZE_FLUX_THEN_SCENE=1` or `then_scene: true` | After FLUX still, also run image-to-scene + MRS; return **both** assets | **enforced** (opt-in) |
| `/health.image_to_scene` | `{ available, model, fallback: "heuristic" }` — never “reconstruction” | **enforced** |

## 7. Status summary (Drive-G-1)

| Deliverable | Status |
| --- | --- |
| This RFC | **declared** (contract) + Phase 1 stages **enforced** in Genblaze |
| Prompt `image_to_scene_spec.md` | **enforced** as operator prompt source |
| `app/image_to_scene.py` | **enforced** (unit + mocked API tests) |
| Heuristic SceneSpec builder | **enforced** — always RT4D-capable |
| Phase 3 reconstruction | **declared** roadmap only |
