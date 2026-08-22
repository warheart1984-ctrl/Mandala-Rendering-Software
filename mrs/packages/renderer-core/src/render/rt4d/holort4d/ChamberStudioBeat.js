/**
 * ChamberStudioBeat — Story Forge beat → 72 canonical scene envelopes (2 actors).
 *
 * Envelope model (honest):
 *   72 timesteps @ dt=1/24 → ONE scene envelope per frame (combined CPF-4D field).
 *   Per-actor landmark-z buffers + rig hashes live in frame.actors[] (not separate tape rows).
 *
 * Replay truth: tape.json + frame-*.cpf4d.bin + frame-*.actor-*.landmark-z.bin — NO PNG.
 *
 * Status:
 *   record / replay / CIEMS trail — enforced (CPU tests)
 *   Story Forge beat JSON — partial (minimal stub beat)
 *   PNG debug viz — declared (viz only)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ARKIT_BLENDSHAPE_NAMES } from "./face-rig-control-shared.js";
import { buildFaceRigState, LANDMARK_TO_CONTROL } from "./face-rig-state.js";
import { buildFaceRigSnapshot, createDefaultFaceRig, deformLandmarksFromRig } from "./face-rig-control.js";
import {
  buildCanonicalEnvelope,
  buildCPF4DEnvelope,
  hashFloat32Array,
  hashJson,
  PIPELINE_STAGES,
  STATUS_TAGS,
} from "./canonical.js";
import { createHoloCamera, createComplexField } from "./types.js";
import { tiledAccumulate, binPathsU32 } from "./tiled.js";
import { attachCiemsTrail } from "./ciems.js";
import { getSnapshot } from "./snapshot.js";
import {
  SIMULATION_CHAMBER_STATUS,
  integrateBones,
  tracePathsFromRigState,
  rigFromState,
} from "./SimulationChamber.js";

export const CHAMBER_STUDIO_BEAT_STATUS = Object.freeze({
  record: "enforced",
  replay: "enforced",
  beatJson: "partial",
  envelopeModel: "72 scene envelopes; 2 actors per frame in metadata + actor buffers",
  pngViz: "declared",
  note: "Replay SoT = tape.json + .bin bufferRefs. PNG is debug viz only.",
});

function blendIndex(name) {
  return ARKIT_BLENDSHAPE_NAMES.indexOf(name);
}

function cloneLandmarks(landmarks) {
  return landmarks.map((lm) => ({
    ...lm,
    velocity: lm.velocity ? { ...lm.velocity } : undefined,
    controls: lm.controls ? [...lm.controls] : [],
  }));
}

function refreshLandmarksFromRig(state, dt) {
  const rig = rigFromState(state);
  const prev = state.landmarks;
  const pts = deformLandmarksFromRig(rig);
  state.landmarks = pts.map((p, id) => {
    const lm = {
      id,
      x: p.x,
      y: p.y,
      z: p.z,
      bone: state.landmarks[id]?.bone ?? "jaw",
      controls: LANDMARK_TO_CONTROL[id] ?? [],
    };
    if (prev?.[id]) {
      lm.velocity = {
        x: (p.x - prev[id].x) / dt,
        y: (p.y - prev[id].y) / dt,
        z: (p.z - (prev[id].z ?? 0)) / dt,
      };
    }
    return lm;
  });
  return state;
}

/** Linear keyframe interpolation for a single track. */
export function interpolateTrack(keyframes, frameIndex, defaultValue = 0) {
  if (!keyframes?.length) return defaultValue;
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (frameIndex <= sorted[0].frame) return sorted[0].value;
  if (frameIndex >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (frameIndex >= a.frame && frameIndex <= b.frame) {
      const t = (frameIndex - a.frame) / Math.max(1, b.frame - a.frame);
      return a.value + (b.value - a.value) * t;
    }
  }
  return defaultValue;
}

/** Apply beat tracks to actor rig blendshapes at frame index. */
export function applyBeatTracks(actorBeat, rig, frameIndex) {
  for (const track of actorBeat.tracks ?? []) {
    const idx = blendIndex(track.blendshape);
    if (idx < 0) continue;
    rig.blendshapes[idx] = interpolateTrack(track.keyframes, frameIndex, rig.blendshapes[idx] ?? 0);
  }
  return rig;
}

/** Load Story Forge beat JSON from disk. */
export function loadStoryForgeBeat(beatPath) {
  const raw = JSON.parse(readFileSync(beatPath, "utf8"));
  if (!raw.beatId) throw new Error("loadStoryForgeBeat: beatId required");
  if (!raw.actors?.length) throw new Error("loadStoryForgeBeat: actors[] required");
  return raw;
}

function hashLandmarkZ(landmarks) {
  const zBuf = new Float32Array(landmarks.length);
  for (let i = 0; i < landmarks.length; i++) zBuf[i] = landmarks[i]?.z ?? 0;
  return hashFloat32Array(zBuf);
}

function actorSlug(fieldId) {
  return fieldId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32);
}

/**
 * Story Forge beat recorder: 2 actors → 72 scene envelopes.
 */
export class ChamberStudioBeat {
  /**
   * @param {object} opts
   * @param {object} [opts.beat] — parsed beat JSON
   * @param {string} [opts.beatPath]
   * @param {number} [opts.width=512]
   * @param {number} [opts.height=512]
   * @param {number} [opts.dt=1/24]
   * @param {string} [opts.outDir]
   */
  constructor(opts = {}) {
    this.beat = opts.beat ?? (opts.beatPath ? loadStoryForgeBeat(opts.beatPath) : null);
    if (!this.beat) throw new Error("ChamberStudioBeat: beat or beatPath required");

    this.width = opts.width ?? 512;
    this.height = opts.height ?? 512;
    this.dt = opts.dt ?? 1 / 24;
    this.outDir = opts.outDir ?? null;
    this.briefId = opts.briefId ?? this.beat.beatId;

    /** @type {{ beat: object, rig: object, state: object }[]} */
    this.actors = this.beat.actors.map((a) => {
      const rig = createDefaultFaceRig(a.fieldId);
      rig.headPos = { ...a.headPos };
      rig.headRot = { ...a.headRot };
      const state = buildFaceRigState(rig, {
        width: this.width,
        height: this.height,
        dt: this.dt,
      });
      state.fieldId = a.fieldId;
      return { beat: a, rig, state };
    });

    this.time = 0;
    this._frameIndex = 0;
    this.isRecording = false;
    /** @type {object[]} */
    this.tape = [];
  }

  record(on = true) {
    this.isRecording = on;
    return this;
  }

  stop() {
    this.isRecording = false;
    return this.tape;
  }

  /** Advance one beat timestep (both actors → combined scene envelope). */
  update(dt = this.dt) {
    const frameIndex = this._frameIndex;
    /** @type {object[]} */
    const actorSteps = [];
    /** @type {object[]} */
    const allPaths = [];

    for (const actor of this.actors) {
      applyBeatTracks(actor.beat, actor.rig, frameIndex);
      actor.state.blendshapes = actor.rig.blendshapes;

      integrateBones(actor.state, dt);
      const prevLandmarks = cloneLandmarks(actor.state.landmarks);
      actor.state.temporal.prevLandmarks = prevLandmarks;
      actor.state.temporal.dt = dt;
      refreshLandmarksFromRig(actor.state, dt);

      const paths = tracePathsFromRigState(actor.state, {
        width: this.width,
        height: this.height,
      });
      allPaths.push(...paths);

      const rawSnapshot = buildFaceRigSnapshot(
        actor.rig,
        this.width,
        this.height,
        actor.state,
      );

      actorSteps.push({
        fieldId: actor.beat.fieldId,
        displayName: actor.beat.displayName,
        paths,
        rawSnapshot,
        landmarkZHash: hashLandmarkZ(actor.state.landmarks),
        landmarks: actor.state.landmarks,
      });
    }

    const holoResX = this.width;
    const holoResY = this.height;
    const cam = createHoloCamera({
      resX: holoResX,
      resY: holoResY,
      width: this.width,
      height: this.height,
      lambda: 550e-9,
    });
    const accumulateOpts = {
      frameWidth: this.width,
      frameHeight: this.height,
      holoResX,
      holoResY,
    };

    const bins = binPathsU32(allPaths, accumulateOpts);
    const field = createComplexField(holoResX, holoResY);
    tiledAccumulate(field, allPaths, cam, { ...accumulateOpts, bins });

    attachCiemsTrail(
      { name: "chamber-studio-beat", paths: allPaths, headers: bins.headers, field },
      { paths: allPaths, headers: bins.headers, field, frameNum: frameIndex },
    );

    const cpfField = getSnapshot("CPF-4D", {
      field,
      width: holoResX,
      height: holoResY,
    });

    const sceneFieldId = `${this.beat.beatId}-scene`;
    const envelope = buildCanonicalEnvelope(
      {
        kind: "CPF-4D",
        fieldId: sceneFieldId,
        pixelGrid: { width: cpfField.width, height: cpfField.height },
        data: cpfField,
      },
      {
        briefId: this.briefId,
        waveFieldId: sceneFieldId,
        pipelineStage: PIPELINE_STAGES.VISION_BRIDGE,
        statusTag: STATUS_TAGS.PUBLISHED,
        notes: `studio beat t=${this.time.toFixed(4)} actors=${this.actors.length}`,
        sceneId: this.beat.beatId,
        channels: cpfField.channels ?? 1,
      },
    );

    const cpf4dEnvelope = buildCPF4DEnvelope(cpfField, {
      briefId: this.briefId,
      waveFieldId: sceneFieldId,
      source: "chamber-studio-beat",
    });

    let tapeEntry = null;
    if (this.isRecording) {
      tapeEntry = this._recordFrame({
        dt,
        frameIndex,
        envelope,
        cpf4dEnvelope,
        cpfField,
        actorSteps,
        pathSampleCount: allPaths.length,
      });
      this.tape.push(tapeEntry);
    }

    this.time += dt;
    this._frameIndex += 1;

    return {
      time: this.time,
      dt,
      frameIndex,
      paths: allPaths,
      field,
      cpfField,
      envelope,
      cpf4dEnvelope,
      actorSteps,
      tapeEntry,
    };
  }

  _recordFrame(payload) {
    const idx = payload.frameIndex;
    const pad = String(idx).padStart(6, "0");
    const bufferRefs = {};

    if (this.outDir) {
      mkdirSync(this.outDir, { recursive: true });
      const cpfPath = join(this.outDir, `frame-${pad}.cpf4d.bin`);
      writeFileSync(
        cpfPath,
        Buffer.from(payload.cpfField.buffer, payload.cpfField.byteOffset, payload.cpfField.byteLength),
      );
      bufferRefs.cpf4d = cpfPath;
    }

    bufferRefs.cpf4dHash = hashFloat32Array(payload.cpfField);

    /** @type {object[]} */
    const actorsMeta = payload.actorSteps.map((step) => {
      const slug = actorSlug(step.fieldId);
      const actorRefs = { landmarkZHash: step.landmarkZHash };
      if (this.outDir) {
        const zPath = join(this.outDir, `frame-${pad}.${slug}.landmark-z.bin`);
        const zBuf = new Float32Array(step.landmarks.length);
        for (let i = 0; i < step.landmarks.length; i++) zBuf[i] = step.landmarks[i].z ?? 0;
        writeFileSync(zPath, Buffer.from(zBuf.buffer));
        actorRefs.landmarkZ = zPath;
      }
      return {
        fieldId: step.fieldId,
        displayName: step.displayName,
        bufferRefs: actorRefs,
        rigSnapshotHash: hashFloat32Array(step.rawSnapshot.data),
        pathSampleCount: step.paths.length,
      };
    });

    return {
      frameIndex: idx,
      time: this.time,
      dt: payload.dt,
      envelope: payload.envelope,
      cpf4dEnvelope: payload.cpf4dEnvelope,
      bufferRefs,
      pathSampleCount: payload.pathSampleCount,
      beat: {
        beatId: this.beat.beatId,
        actorCount: this.actors.length,
        actorFieldIds: this.actors.map((a) => a.beat.fieldId),
        frameIndex: idx,
      },
      actors: actorsMeta,
      status: CHAMBER_STUDIO_BEAT_STATUS,
    };
  }

  /** Record full beat (default 72 frames). */
  recordBeat(frameCount = this.beat.frameCount ?? 72) {
    this.tape = [];
    this.time = 0;
    this._frameIndex = 0;
    this.record(true);
    for (let i = 0; i < frameCount; i++) {
      this.update(this.dt);
    }
    this.stop();
    return this.tape;
  }

  saveTape(outDir = this.outDir) {
    if (!outDir) throw new Error("ChamberStudioBeat.saveTape: outDir required");
    mkdirSync(outDir, { recursive: true });
    const manifest = {
      version: "1.0.0",
      organ: "ChamberStudioBeat",
      storyForge: {
        beatId: this.beat.beatId,
        schemaVersion: this.beat.schemaVersion,
        actorCount: this.beat.actors.length,
        actorFieldIds: this.beat.actors.map((a) => a.fieldId),
        durationSeconds: this.beat.durationSeconds,
        fps: this.beat.fps,
        envelopeModel: CHAMBER_STUDIO_BEAT_STATUS.envelopeModel,
      },
      status: CHAMBER_STUDIO_BEAT_STATUS,
      width: this.width,
      height: this.height,
      dt: this.dt,
      frameCount: this.tape.length,
      tapeHash: hashJson(
        this.tape.map((f) => ({
          frameIndex: f.frameIndex,
          time: f.time,
          envelopeHash: f.envelope?.hashes?.envelopeHash,
          dataHash: f.envelope?.hashes?.dataHash,
          actorFieldIds: f.beat?.actorFieldIds,
        })),
      ),
      frames: this.tape,
    };
    const tapePath = join(outDir, "tape.json");
    writeFileSync(tapePath, JSON.stringify(manifest, null, 2));
    return { tapePath, manifest };
  }

  /**
   * Replay verification — hash/bufferRef only (no PNG, no re-simulation).
   * @param {object[]} [tape]
   */
  replay(tape = this.tape) {
    return replayTapeFrames(tape);
  }
}

/**
 * Verify tape frames from disk buffers + hashes only.
 * @param {object[]} frames
 */
export function replayTapeFrames(frames) {
  const results = [];
  for (const frame of frames) {
    const entry = { frameIndex: frame.frameIndex, ok: true, checks: [] };

    if (!frame.envelope?.hashes?.envelopeHash) {
      entry.ok = false;
      entry.checks.push({ check: "envelopeHash", ok: false, reason: "missing" });
    } else {
      entry.checks.push({
        check: "envelopeHash",
        ok: frame.envelope.hashes.envelopeHash.length === 64,
        value: frame.envelope.hashes.envelopeHash,
      });
    }

    if (frame.beat?.actorCount !== 2) {
      entry.ok = false;
      entry.checks.push({
        check: "actorCount",
        ok: false,
        expected: 2,
        actual: frame.beat?.actorCount,
      });
    } else {
      entry.checks.push({ check: "actorCount", ok: true, value: 2 });
    }

    if (frame.bufferRefs?.cpf4d && frame.bufferRefs?.cpf4dHash) {
      try {
        const buf = readFileSync(frame.bufferRefs.cpf4d);
        const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        const h = hashFloat32Array(arr);
        const match = h === frame.bufferRefs.cpf4dHash;
        entry.checks.push({
          check: "cpf4dBuffer",
          ok: match,
          expected: frame.bufferRefs.cpf4dHash,
          actual: h,
        });
        if (!match) entry.ok = false;
      } catch (err) {
        entry.ok = false;
        entry.checks.push({ check: "cpf4dBuffer", ok: false, reason: String(err.message ?? err) });
      }
    }

    for (const actor of frame.actors ?? []) {
      const refs = actor.bufferRefs ?? {};
      if (refs.landmarkZ && refs.landmarkZHash) {
        try {
          const buf = readFileSync(refs.landmarkZ);
          const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
          const h = hashFloat32Array(arr);
          const match = h === refs.landmarkZHash;
          entry.checks.push({
            check: `landmarkZ:${actor.fieldId}`,
            ok: match,
            expected: refs.landmarkZHash,
            actual: h,
          });
          if (!match) entry.ok = false;
        } catch (err) {
          entry.ok = false;
          entry.checks.push({
            check: `landmarkZ:${actor.fieldId}`,
            ok: false,
            reason: String(err.message ?? err),
          });
        }
      }
    }

    results.push(entry);
  }

  const allOk = results.every((r) => r.ok);
  return {
    ok: allOk,
    frameCount: results.length,
    results,
    replayHash: hashJson(results.map((r) => ({ frameIndex: r.frameIndex, ok: r.ok }))),
    status: CHAMBER_STUDIO_BEAT_STATUS.replay,
    simulationChamber: SIMULATION_CHAMBER_STATUS,
  };
}

/** Load tape manifest and replay from buffer refs only. */
export function replayTapeFromDisk(tapePath) {
  const manifest = JSON.parse(readFileSync(tapePath, "utf8"));
  return {
    manifest,
    replay: replayTapeFrames(manifest.frames ?? []),
  };
}

/** Record deterministic studio beat (for tests). */
export function recordStudioBeat(opts = {}) {
  const beatPath =
    opts.beatPath ??
    join(
      opts.repoRoot ?? process.cwd(),
      "mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json",
    );
  const beat = opts.beat ?? loadStoryForgeBeat(beatPath);
  const outDir = opts.outDir ?? null;
  const chamber = new ChamberStudioBeat({
    beat,
    width: opts.width ?? 64,
    height: opts.height ?? 64,
    dt: opts.dt ?? 1 / 24,
    outDir,
  });
  const frames = opts.frames ?? beat.frameCount ?? 72;
  const tape = chamber.recordBeat(frames);
  const saved = outDir ? chamber.saveTape(outDir) : null;
  const replay = chamber.replay();
  return {
    chamber,
    tape,
    saved,
    replay,
    tapeHash: saved?.manifest?.tapeHash ?? hashJson(tape.map((f) => f.envelope?.hashes?.envelopeHash)),
  };
}
