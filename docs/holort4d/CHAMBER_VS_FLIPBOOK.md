# Chamber vs Flipbook

Honest comparison of two recording strategies in the Mandala / HoloRT4D stack.

## Summary

| Aspect | Flipbook (PNG sequence) | SimulationChamber (canonical tape) |
|--------|-------------------------|-------------------------------------|
| **Source of truth** | Raster frames (PNG/mp4) | `CanonicalSnapshotEnvelope[]` + hashed `Float32Array` buffers |
| **Time model** | Frame index → image file | `state` + `dt` + integrated `time` |
| **Depth** | Baked into pixels (lossy) | `landmark.z` in rig space; project only at render |
| **Temporal** | Implicit (frame order) | Explicit: velocity, optical flow → `PathSample.opticalLength` |
| **Replay** | Re-display images | Re-hash buffers; verify `envelopeHash` deterministic |
| **Vision Bridge** | Inspect PNG | `publishSnapshot` with CPO/SPO/CPF-4D envelope |
| **SD-Turbo loop** | img2img on PNG controls | **declared** — depth+flow+topology from state each dt |
| **Status** | Legacy debug / comparison | **partial** — CPU record/replay enforced |

## Flipbook path

A flipbook records **projected appearance** only:

```
simulate → render PNG → frame-000.png, frame-001.png, … → ffmpeg mp4
```

**Pros:** Easy to inspect; works with any video player.

**Cons:**

- Depth and rig state are lost after rasterization.
- Non-deterministic if render settings drift.
- Cannot replay physics — only replay pixels.
- Not a constitutional envelope; no `envelopeHash`.

Used today for regression viz (`holo-loop.mjs --record-png`) and SD-Turbo img2img (`face-rig-turbo.mjs`).

## SimulationChamber path

The chamber records **state evolution + canonical snapshots**:

```
FaceRigState (68 xyz + bones + blendshapes + velocity)
  → integrateBones(state, dt)          [partial stub]
  → tracePathsFromRigState(state)      [enforced]
  → tiledAccumulate → CPF-4D field
  → buildCanonicalEnvelope(raw, …)
  → tape.push(envelope) + buffer refs on disk
```

### Tape format

`output/chamber-tape/tape.json`:

```json
{
  "version": "1.0.0",
  "organ": "SimulationChamber",
  "tapeHash": "<sha256 of frame envelope hashes>",
  "frames": [
    {
      "frameIndex": 0,
      "time": 0,
      "dt": 0.041666,
      "envelope": { "protocol": "CPF-4D", "hashes": { "envelopeHash": "…", "dataHash": "…" } },
      "bufferRefs": {
        "cpf4d": "output/chamber-tape/frame-000000.cpf4d.bin",
        "landmarkZ": "output/chamber-tape/frame-000000.landmark-z.bin",
        "cpf4dHash": "…",
        "landmarkZHash": "…"
      }
    }
  ]
}
```

### Key invariants

1. **Depth kept:** `landmark.z` stored in `landmark-z.bin`; projection only at render (`projectLandmarksFromRig`).
2. **Temporal:** `velocity` + `opticalFlow` feed `PathSample.opticalLength`.
3. **Bone weights:** `LANDMARK_TO_CONTROL` — e.g. `jawOpen` moves jaw landmarks together (`integrateBones` partial).
4. **Deterministic replay:** `chamber.replay(tape)` re-reads buffers and verifies hashes.

## Status tags

| Component | Status |
|-----------|--------|
| `record()` / `stop()` / `saveTape()` | **enforced** |
| `replay()` hash verification | **enforced** |
| `tracePathsFromRigState` | **enforced** |
| `integrateBones` | **partial** — jaw/head stub, no mesh IK |
| `tiledAccumulate` + CPF-4D envelope | **enforced** (CPU) |
| `visionBridge.publishSnapshot` | **partial** |
| SD-Turbo depth+flow+topology each dt | **declared** |
| GPU HoloRT4D path | **partial** (Polar gfx803) |

## How to run

```bash
# Record 12 frames @ 24 fps → tape.json + .bin buffers
node scripts/chamber-record-demo.mjs --frames 12

# Optional PNG debug viz (NOT source of truth)
node scripts/chamber-record-demo.mjs --frames 12 --png

# Tests
cd mrs/packages/renderer-core && npm run test:holort4d
```

## Module location

Per `AGENTS.md` rendering SoT:

`mrs/packages/renderer-core/src/render/rt4d/holort4d/SimulationChamber.js`

Chamber orchestration in `mandala/engine/chamber/` consumes envelopes via Vision Bridge; it does not duplicate the tape format.

## Related docs

- `docs/holort4d/FACE_RIG_TURBO_CONTROL.md` — 3-map Turbo control (depth/topology/flow)
- `mandala/engine/chamber/TEMPORAL_4D.md` — temporal 4D loop context
- `docs/mandala/phases/04-constitutional-runtime-loop-plan.md` — organ-level SimulationChamber plan

## Studio proof — Story Forge 2-actor beat (72 envelopes)

**Milestone:** one Story Forge beat with 2 actors for 3 seconds = 72 envelopes. Replay from hash/bufferRef alone = studio.

### Envelope model (honest)

| Count | What |
|-------|------|
| **72** | Scene envelopes in `tape.json` (`frames[]`) — one per timestep @ 24fps × 3s |
| **2** | Actors per frame in `frame.beat.actorCount` + `frame.actors[]` metadata |
| **144** | Per-actor landmark-z buffer files on disk (72 frames × 2 actors) — auxiliary evidence, not separate tape rows |

Combined CPF-4D field accumulates both actors' path samples into one scene envelope per frame. Per-actor rig state is preserved in `frame-NNNNNN.<actor-slug>.landmark-z.bin` + `rigSnapshotHash`.

**PNG is debug viz only** — replay truth is `tape.json` + `.bin` bufferRefs.

### Beat stub

`mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json`:

- `actor-a-mythar` and `actor-b-warden` face each other (head yaw ±0.45)
- Actor-b blinks at frame 36 (`eyeBlinkLeft` / `eyeBlinkRight` keyframes)

### Run studio demo

```bash
# Record 72 envelopes → output/simulation/chamber-studio-beat/
node scripts/chamber-studio-beat.mjs

# Optional PNG debug (NOT replay SoT)
node scripts/chamber-studio-beat.mjs --png

# Tests (includes studio beat suite)
cd mrs/packages/renderer-core && npm run test:holort4d
```

Output:

```
output/simulation/chamber-studio-beat/tape.json
output/simulation/chamber-studio-beat/frame-000000.cpf4d.bin
output/simulation/chamber-studio-beat/frame-000000.actor-a-mythar.landmark-z.bin
output/simulation/chamber-studio-beat/frame-000000.actor-b-warden.landmark-z.bin
… (72 frames)
output/simulation/chamber-studio-beat/provenance.json
```

Replay: `replayTapeFromDisk(tapePath)` re-hashes buffers only — no PNG, no re-simulation.

### Module

`mrs/packages/renderer-core/src/render/rt4d/holort4d/ChamberStudioBeat.js`

| Component | Status |
|-----------|--------|
| `recordBeat()` / `saveTape()` | **enforced** |
| `replay()` / `replayTapeFromDisk()` | **enforced** |
| Story Forge beat JSON | **partial** (minimal stub) |
| CIEMS trail per frame | **enforced** (via `attachCiemsTrail`) |
| PNG debug viz | **declared** |
