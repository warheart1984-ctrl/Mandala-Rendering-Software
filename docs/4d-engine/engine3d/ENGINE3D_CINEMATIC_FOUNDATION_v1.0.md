# ENGINE3D_CINEMATIC_FOUNDATION_v1.0

Unified cinematic foundation: timeline / animation law, sequence records,
runtime, and **declared** high-resolution / farm / editor clauses.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared** (normative intent). Implementation status per chapter below |
| Domain | CIEMS → Engine3D Cinematic Layer |
| Related | [ENGINE3D_CONSTITUTIONAL_SUITE_v1.0](./ENGINE3D_CONSTITUTIONAL_SUITE_v1.0.md), [ENGINE3D_SEQUENCE_RECORD_SCHEMA_v1.0.json](./ENGINE3D_SEQUENCE_RECORD_SCHEMA_v1.0.json) |

> **Drive-G-1:** Do not claim 4K/8K film pipelines, distributed render farms, or
> animation editors as **enforced** until tests and Genblaze paths prove them.
> Today: soft-raster **short sequences** + timeline evaluator are **prepared**;
> farm / FFmpeg / tile-8K are **skeleton / declared**.

## Chapter status board

| Chapter | Artifact | Status |
|---------|----------|--------|
| 1 | Timeline + keyframe interpolation law | **enforced** (unit tests: step/linear/cubic/slerp) |
| 2 | Animation runtime / frame loop | **prepared** — `Engine3DCinematicRuntime` uses `HeadlessStillRenderer` |
| 3 | Movie / AOV sequence naming | **prepared** for short clips; 4K/8K **declared** targets only |
| 4 | Cinematic pipeline (structure→polish→RT4D→composite) | **prepared** (still API); per-frame polish in Genblaze sequence **opt-in** (billing) |
| 5 | Sequence record schema | **declared** (JSON Schema); write path **prepared** |
| 6 | Animation editor UI | **declared** only |
| 7 | Render farm + network protocol | **skeleton** (in-process job list; no network) |
| 8 | 8K memory / tile renderer | **skeleton** / **declared** |
| 9 | FFmpeg sequence exporter | **prepared** when `ffmpeg` on PATH; else clear error |

---

## CHAPTER 1 — Timeline & keyframe law

A timeline SHALL declare: `id`, `duration` (seconds), `fps`, `tracks[]`.

A keyframe SHALL declare: `time`, `value`, `interp` ∈ `{ step, linear, cubic, spherical }`.

**Animation law**

- Every animated property MUST have a declared track with ≥ 1 keyframe.
- Interpolation MUST be deterministic and replayable.
- Camera animation MUST preserve aspect / near / far (depth law).
- Mesh motion MUST preserve triangle topology (indices unchanged).

Implementation: `@mrs/engine3d-core` `src/timeline/`.

---

## CHAPTER 2 — Animation runtime

Frame loop (conceptual):

```
t = f / fps
evaluate tracks at t → camera / mesh transforms
soft-raster beauty (+ depth/normal)
optional: polish / RT4D background / composite (Genblaze)
emit frame record
```

Runtime MUST emit identical outputs for identical timeline + world + camera + seed.

---

## CHAPTER 3 — Movie / AOV sequences

Per-frame naming (prepared):

- `frame_XXXX_beauty.png`
- `frame_XXXX_depth.png` (optional)
- `frame_XXXX_normal.png` (optional)
- `frame_XXXX_final.png` (after composite or copy of beauty)

Resolution labels **declared** as targets: `1080p` (1920×1080), `4K` (3840×2160),
`8K` (7680×4320). Soft-raster MVP clamps to practical sizes (default ≤ 512 for
Genblaze sequences) unless `ENGINE3D_SEQUENCE_ALLOW_HEAVY=1`.

---

## CHAPTER 4 — Cinematic pipeline governance

1. **Structure** — Engine3D soft-raster AOVs  
2. **Realism** — Genblaze polish (diffusion; optional; billed)  
3. **Background** — RT4D mandala/lattice only  
4. **Composite** — subject over RT4D  
5. **Assembly** — PNG sequence; optional FFmpeg MP4  

Invariants: structure precedes realism; RT4D remains background-only; faces/skin
require polish, never SceneBridge sphere soup.

---

## CHAPTER 5 — Sequence record

See [ENGINE3D_SEQUENCE_RECORD_SCHEMA_v1.0.json](./ENGINE3D_SEQUENCE_RECORD_SCHEMA_v1.0.json).

---

## CHAPTERS 6–9 — Declared / skeleton

Animation editor UI, render-farm network protocol, 8K tile budgets, and multi-node
dispatch are **constitutional intent** only. In-tree stubs exist for API shape;
they do not claim Pixar/Weta parity.
