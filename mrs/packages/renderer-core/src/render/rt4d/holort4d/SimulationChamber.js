/**
 * SimulationChamber — recordable state + dt + canonical tape + deterministic replay.
 *
 * NOT a flipbook (PNG sequence). Source of truth is CanonicalSnapshotEnvelope[] with
 * hashed Float32Array buffer refs on disk.
 *
 * Status:
 *   record / stop / replay / tape hash — enforced (CPU tests)
 *   integrateBones — partial (jaw/head stub from blendshapes)
 *   tracePathsFromRigState — enforced (landmark → PathSample bridge)
 *   tiledAccumulate + CPF-4D envelope — enforced (CPU holort4d path)
 *   visionBridge.publishSnapshot — partial (requires bridge)
 *   SD-Turbo depth+flow+topology loop — declared (see face-rig-control)
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ARKIT_BLENDSHAPE_NAMES } from "./face-rig-control-shared.js";
import {
  buildFaceRigState,
  deformLandmarksFromRig,
  projectLandmarksFromRig,
  LANDMARK_TO_CONTROL,
} from "./face-rig-state.js";
import { buildFaceRigSnapshot, createDefaultFaceRig } from "./face-rig-control.js";
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
import { getSnapshot, publishSnapshot } from "./snapshot.js";

export const SIMULATION_CHAMBER_STATUS = Object.freeze({
  record: "enforced",
  replay: "enforced",
  integrateBones: "partial",
  tracePaths: "enforced",
  canonicalTape: "enforced",
  visionBridge: "partial",
  sdTurboLoop: "declared",
  note: "Tape = CanonicalSnapshotEnvelope[] + buffer refs. PNG is debug viz only.",
});

const DEPTH_Z_MIN = -0.2;
const DEPTH_Z_MAX = 0.35;

function blendIndex(name) {
  return ARKIT_BLENDSHAPE_NAMES.indexOf(name);
}

function getBlend(state, name, fallback = 0) {
  const i = blendIndex(name);
  if (i < 0 || !state.blendshapes) return fallback;
  return state.blendshapes[i] ?? fallback;
}

function cloneLandmarks(landmarks) {
  return landmarks.map((lm) => ({
    ...lm,
    velocity: lm.velocity ? { ...lm.velocity } : undefined,
    controls: lm.controls ? [...lm.controls] : [],
  }));
}

/** Extract FaceRig inputs from FaceRigState bones + blendshapes. */
export function rigFromState(state) {
  const head = state.bones?.find((b) => b.name === "head") ?? {
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0 },
  };
  return {
    blendshapes: state.blendshapes,
    headPos: { ...head.pos },
    headRot: { ...head.rot },
    fieldId: state.fieldId ?? "face-rig",
  };
}

/**
 * Stub bone integration from blendshapes (partial — no mesh IK).
 * jawOpen drives jaw bone; browInnerUp nudges head pitch.
 *
 * @param {import("./face-rig-state.js").FaceRigState} state
 * @param {number} dt
 */
export function integrateBones(state, dt) {
  if (!state?.bones?.length) return state;

  const jawOpen = getBlend(state, "jawOpen");
  const browUp = getBlend(state, "browInnerUp");
  const jawLeft = getBlend(state, "jawLeft");
  const jawRight = getBlend(state, "jawRight");
  const dtScale = dt * 24;

  for (const bone of state.bones) {
    if (bone.name === "jaw") {
      bone.rot.x = (bone.rot.x ?? 0) + jawOpen * 0.25 * dtScale;
      bone.pos.y = (bone.pos.y ?? 0) - jawOpen * 0.08 * dtScale;
    }
    if (bone.name === "head") {
      bone.rot.x = (bone.rot.x ?? 0) + browUp * 0.05 * dtScale;
      bone.rot.y = (bone.rot.y ?? 0) + (jawRight - jawLeft) * 0.03 * dtScale;
    }
    if (bone.name === "mouth") {
      bone.pos.y = (bone.pos.y ?? 0) - jawOpen * 0.04 * dtScale;
    }
  }

  // LANDMARK_TO_CONTROL weighted nudge on jaw landmarks (partial coupling)
  if (state.landmarks?.length) {
    for (let i = 0; i <= 16 && i < state.landmarks.length; i++) {
      const lm = state.landmarks[i];
      if (!LANDMARK_TO_CONTROL[i]?.includes("jawOpen")) continue;
      lm.y -= jawOpen * 0.02 * dtScale;
      lm.z = (lm.z ?? 0) + jawOpen * 0.01 * dtScale;
    }
  }

  return state;
}

/**
 * Map rig-space z to opticalLength for PathSample finalize.
 * Depth preserved in landmark.z; projection happens at render time only.
 */
export function zToOpticalLength(z, flowMag = 0, dt = 1 / 24) {
  const span = DEPTH_Z_MAX - DEPTH_Z_MIN;
  const t = (Number(z ?? 0) - DEPTH_Z_MIN) / span;
  return Math.max(0.01, t * 1.5 + 0.1 + flowMag * dt * 4);
}

/**
 * Bridge FaceRigState → PathSample[] (64-byte contract via plain objects).
 * opticalLength encodes landmark z + temporal velocity magnitude.
 *
 * @param {import("./face-rig-state.js").FaceRigState} state
 * @param {object} [opts]
 * @param {number} [opts.width=512]
 * @param {number} [opts.height=512]
 * @param {boolean} [opts.denseSplat=true] — splat disk around each landmark
 */
export function tracePathsFromRigState(state, opts = {}) {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const denseSplat = opts.denseSplat !== false;
  const projected = projectLandmarksFromRig(state, width, height);
  /** @type {Array<object>} */
  const paths = [];
  const dt = state.temporal?.dt ?? 1 / 24;
  const splatR = denseSplat ? 4 : 0;

  for (const px of projected) {
    const lm = state.landmarks[px.index];
    if (!lm) continue;
    const vel = lm.velocity ?? { x: 0, y: 0, z: 0 };
    const flowMag = Math.hypot(vel.x, vel.y, vel.z);
    const opticalLength = zToOpticalLength(lm.z, flowMag, dt);
    const baseWeight = Math.max(0.05, 0.15 + flowMag * 1.5);

    const splatPoints = splatR > 0
      ? splatDisk(Math.round(px.x), Math.round(px.y), splatR, width, height)
      : [{ x: Math.round(px.x), y: Math.round(px.y) }];

    for (const sp of splatPoints) {
      paths.push({
        pixelId: sp.y * width + sp.x,
        opticalLength,
        radiance: { x: 0.72, y: 0.58, z: 0.48 },
        weight: baseWeight * sp.falloff,
        bounceId: 0,
        wl: 550e-9,
        landmarkId: lm.id,
      });
    }
  }

  return paths;
}

function splatDisk(cx, cy, r, width, height) {
  const out = [];
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      const d2 = ox * ox + oy * oy;
      if (d2 > r * r) continue;
      const x = cx + ox;
      const y = cy + oy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      out.push({ x, y, falloff: 1 - Math.sqrt(d2) / (r + 1e-6) });
    }
  }
  return out.length ? out : [{ x: cx, y: cy, falloff: 1 }];
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

function hashLandmarkZ(landmarks) {
  const zBuf = new Float32Array(landmarks.length);
  for (let i = 0; i < landmarks.length; i++) zBuf[i] = landmarks[i]?.z ?? 0;
  return hashFloat32Array(zBuf);
}

/**
 * Recordable simulation chamber: state + dt + canonical tape.
 */
export class SimulationChamber {
  /**
   * @param {object} [opts]
   * @param {import("./face-rig-state.js").FaceRigState} [opts.initialState]
   * @param {object} [opts.rig]
   * @param {number} [opts.width=512]
   * @param {number} [opts.height=512]
   * @param {number} [opts.dt=1/24]
   * @param {string} [opts.outDir]
   * @param {string} [opts.briefId]
   */
  constructor(opts = {}) {
    this.width = opts.width ?? 512;
    this.height = opts.height ?? 512;
    this.dt = opts.dt ?? 1 / 24;
    this.outDir = opts.outDir ?? null;
    this.briefId = opts.briefId ?? "simulation-chamber";
    this.rig = opts.rig ?? createDefaultFaceRig(opts.fieldId ?? "simulation-chamber");
    this.state =
      opts.initialState ??
      buildFaceRigState(this.rig, { width: this.width, height: this.height, dt: this.dt });
    this.time = 0;
    this.isRecording = false;
    /** @type {object[]} */
    this.tape = [];
    this._frameIndex = 0;
  }

  /** @param {boolean} [on=true] */
  record(on = true) {
    this.isRecording = on;
    return this;
  }

  stop() {
    this.isRecording = false;
    return this.tape;
  }

  /**
   * Advance one simulation step.
   * @param {number} [dt]
   * @param {object} [opts]
   */
  update(dt = this.dt, opts = {}) {
    integrateBones(this.state, dt);

    const prevLandmarks = cloneLandmarks(this.state.landmarks);
    this.state.temporal.prevLandmarks = prevLandmarks;
    this.state.temporal.dt = dt;

    refreshLandmarksFromRig(this.state, dt);

    const paths = tracePathsFromRigState(this.state, {
      width: this.width,
      height: this.height,
    });

    const holoResX = opts.holoResX ?? this.width;
    const holoResY = opts.holoResY ?? this.height;
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

    const bins = binPathsU32(paths, accumulateOpts);
    const field = createComplexField(holoResX, holoResY);
    tiledAccumulate(field, paths, cam, { ...accumulateOpts, bins });

    attachCiemsTrail(
      { name: "simulation-chamber", paths, headers: bins.headers, field },
      { paths, headers: bins.headers, field },
    );

    const rawSnapshot = buildFaceRigSnapshot(this.rig, this.width, this.height, this.state);
    const cpfField = getSnapshot("CPF-4D", {
      field,
      width: holoResX,
      height: holoResY,
    });

    const envelope = buildCanonicalEnvelope(
      {
        kind: "CPF-4D",
        fieldId: this.state.fieldId ?? this.rig.fieldId,
        pixelGrid: { width: cpfField.width, height: cpfField.height },
        data: cpfField,
      },
      {
        briefId: this.briefId,
        waveFieldId: this.state.fieldId ?? "simulation-chamber",
        pipelineStage: PIPELINE_STAGES.VISION_BRIDGE,
        statusTag: STATUS_TAGS.PUBLISHED,
        notes: `chamber t=${this.time.toFixed(4)} dt=${dt}`,
        channels: cpfField.channels ?? 1,
      },
    );

    const cpf4dEnvelope = buildCPF4DEnvelope(cpfField, {
      briefId: this.briefId,
      waveFieldId: this.state.fieldId,
      source: "simulation-chamber",
    });

    let tapeEntry = null;
    if (this.isRecording) {
      tapeEntry = this._recordFrame({
        dt,
        envelope,
        cpf4dEnvelope,
        cpfField,
        rawSnapshot,
        paths,
        landmarkZHash: hashLandmarkZ(this.state.landmarks),
      });
      this.tape.push(tapeEntry);
    }

    this.time += dt;
    this._frameIndex += 1;

    let publishResult = null;
    if (opts.visionBridge) {
      publishResult = publishSnapshot(opts.visionBridge, cpfField, {
        provenance: { chamberTime: this.time, frameIndex: this._frameIndex - 1 },
      });
    }

    return {
      time: this.time,
      dt,
      paths,
      field,
      raw: rawSnapshot,
      cpfField,
      envelope,
      cpf4dEnvelope,
      tapeEntry,
      publishResult,
      landmarkZ: this.state.landmarks.map((lm) => lm.z),
    };
  }

  _recordFrame(payload) {
    const idx = this._frameIndex;
    const pad = String(idx).padStart(6, "0");
    const bufferRefs = {};

    if (this.outDir) {
      mkdirSync(this.outDir, { recursive: true });
      const cpfPath = join(this.outDir, `frame-${pad}.cpf4d.bin`);
      writeFileSync(cpfPath, Buffer.from(payload.cpfField.buffer, payload.cpfField.byteOffset, payload.cpfField.byteLength));
      bufferRefs.cpf4d = cpfPath;

      const zPath = join(this.outDir, `frame-${pad}.landmark-z.bin`);
      const zBuf = new Float32Array(payload.landmarkZHash ? this.state.landmarks.length : 0);
      for (let i = 0; i < this.state.landmarks.length; i++) zBuf[i] = this.state.landmarks[i].z ?? 0;
      writeFileSync(zPath, Buffer.from(zBuf.buffer));
      bufferRefs.landmarkZ = zPath;
    }

    bufferRefs.cpf4dHash = hashFloat32Array(payload.cpfField);
    bufferRefs.landmarkZHash = payload.landmarkZHash;

    return {
      frameIndex: idx,
      time: this.time,
      dt: payload.dt,
      envelope: payload.envelope,
      cpf4dEnvelope: payload.cpf4dEnvelope,
      bufferRefs,
      pathSampleCount: payload.paths.length,
      rigSnapshotHash: hashFloat32Array(payload.rawSnapshot.data),
      status: SIMULATION_CHAMBER_STATUS,
    };
  }

  /** Serialize tape + buffer refs to outDir. */
  saveTape(outDir = this.outDir) {
    if (!outDir) throw new Error("SimulationChamber.saveTape: outDir required");
    mkdirSync(outDir, { recursive: true });
    const manifest = {
      version: "1.0.0",
      organ: "SimulationChamber",
      status: SIMULATION_CHAMBER_STATUS,
      width: this.width,
      height: this.height,
      dt: this.dt,
      frameCount: this.tape.length,
      tapeHash: hashJson(this.tape.map((f) => ({
        frameIndex: f.frameIndex,
        time: f.time,
        dt: f.dt,
        envelopeHash: f.envelope?.hashes?.envelopeHash,
        dataHash: f.envelope?.hashes?.dataHash,
        landmarkZHash: f.bufferRefs?.landmarkZHash,
      }))),
      frames: this.tape,
    };
    const tapePath = join(outDir, "tape.json");
    writeFileSync(tapePath, JSON.stringify(manifest, null, 2));
    return { tapePath, manifest };
  }

  /**
   * Deterministic replay verification — re-hash buffers and compare envelope hashes.
   * @param {object[]} [tape]
   */
  replay(tape = this.tape) {
    const results = [];
    for (const frame of tape) {
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

      if (frame.bufferRefs?.cpf4d && frame.bufferRefs?.cpf4dHash) {
        try {
          const buf = readFileSync(frame.bufferRefs.cpf4d);
          const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
          const h = hashFloat32Array(arr);
          const match = h === frame.bufferRefs.cpf4dHash;
          entry.checks.push({ check: "cpf4dBuffer", ok: match, expected: frame.bufferRefs.cpf4dHash, actual: h });
          if (!match) entry.ok = false;
        } catch (err) {
          entry.ok = false;
          entry.checks.push({ check: "cpf4dBuffer", ok: false, reason: String(err.message ?? err) });
        }
      }

      if (frame.bufferRefs?.landmarkZ && frame.bufferRefs?.landmarkZHash) {
        try {
          const buf = readFileSync(frame.bufferRefs.landmarkZ);
          const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
          const h = hashFloat32Array(arr);
          const match = h === frame.bufferRefs.landmarkZHash;
          entry.checks.push({ check: "landmarkZ", ok: match, expected: frame.bufferRefs.landmarkZHash, actual: h });
          if (!match) entry.ok = false;
        } catch (err) {
          entry.ok = false;
          entry.checks.push({ check: "landmarkZ", ok: false, reason: String(err.message ?? err) });
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
      status: SIMULATION_CHAMBER_STATUS.replay,
    };
  }
}

/** Load tape manifest from disk. */
export function loadTape(tapePath) {
  const raw = JSON.parse(readFileSync(tapePath, "utf8"));
  return raw;
}

/** Run N frames and return deterministic tape hash (for tests). */
export function recordDeterministicTape(opts = {}) {
  const outDir = opts.outDir ?? null;
  const chamber = new SimulationChamber({
    width: opts.width ?? 64,
    height: opts.height ?? 64,
    dt: opts.dt ?? 1 / 24,
    outDir,
    rig: opts.rig ?? createDefaultFaceRig("deterministic-chamber"),
  });
  chamber.record(true);
  const frames = opts.frames ?? 8;
  for (let i = 0; i < frames; i++) {
    const jawIdx = blendIndex("jawOpen");
    if (jawIdx >= 0) {
      chamber.rig.blendshapes[jawIdx] = 0.1 + 0.05 * Math.sin(i * 0.4);
    }
    chamber.update(chamber.dt);
  }
  chamber.stop();
  const saved = outDir ? chamber.saveTape(outDir) : null;
  const replay = chamber.replay();
  return {
    chamber,
    tape: chamber.tape,
    saved,
    replay,
    tapeHash: saved?.manifest?.tapeHash ?? hashJson(chamber.tape.map((f) => f.envelope?.hashes?.envelopeHash)),
  };
}
