/**
 * RenderView — projection layer over Simulation Chamber truth.
 *
 * Chamber tape stays physical { z, bones, velocity, opticalLength }.
 * RenderView swaps skin: physical phase, anime toon LUT / SD, or photoreal turbo.
 *
 * Status:
 *   physical PhaseEncode — enforced (CPU)
 *   applyToonLUT — partial (CPU bands, no GPU shader)
 *   anime SD img2img — partial (requires sd-server :13306 or Lemonade :13305)
 *   photoreal turbo maps — partial (face-rig-control pattern)
 *   chamber immutability — enforced (read-only inputs)
 */

import { readFileSync } from "node:fs";

import { encodePhaseOnly } from "./accumulate.js";
import { hashFloat32Array } from "./canonical.js";
import { encodePngRgba8 } from "./debug.js";
import { phaseToRgba } from "./depth-reconstruct.js";
import {
  buildFaceRigState,
  createDefaultFaceRig,
  renderAllTurboControls,
} from "./face-rig-control.js";
import { LANDMARK_COUNT } from "./face-rig-control-shared.js";

export const RENDER_VIEW_STATUS = Object.freeze({
  physical: "enforced",
  animeLut: "partial",
  animeSd: "partial",
  photoreal: "partial",
  chamberImmutable: "enforced",
  note: "Tape = physical truth. PNG/MP4 = projection only.",
});

export const DEFAULT_ANIME_PROMPT =
  "anime, cel shading, toon ramp, large eyes, clean lineart";

export const DEFAULT_ANIME_NEGATIVE =
  "photoreal, grayscale, text, watermark, deformed, blurry, extra limbs";

export const ANIME_VIEW_CONFIG = Object.freeze({
  prompt: DEFAULT_ANIME_PROMPT,
  negative: DEFAULT_ANIME_NEGATIVE,
  sdSteps: 4,
  sdCfg: 1.0,
  sdStrength: 0.85,
  initMap: "depth",
  sdModel: process.env.SD_MODEL ?? process.env.ANIME_GGUF ?? "SD-Turbo",
});

/**
 * Cel-shading bands on normalized phase [0,1].
 * @param {number[]} phaseField
 * @param {{ bands?: number, ramp?: "cel"|"linear" }} [opts]
 * @returns {number[]}
 */
export function applyToonLUT(phaseField, opts = {}) {
  const bands = Math.max(2, Math.trunc(opts.bands ?? 4));
  const ramp = opts.ramp === "linear" ? "linear" : "cel";
  return phaseField.map((p) => {
    const t = Math.max(0, Math.min(1, Number(p) || 0));
    const idx = Math.min(bands - 1, Math.floor(t * bands));
    const lo = idx / bands;
    const hi = (idx + 1) / bands;
    if (ramp === "linear") return (lo + hi) * 0.5;
    return hi;
  });
}

/**
 * Reconstruct display complex field from stored CPF-4D amplitude (|E| only).
 * Honest partial — phase hint derived from amplitude structure, not replayed paths.
 * @param {Float32Array|number[]} amplitude
 */
export function amplitudeToComplexField(amplitude) {
  const field = [];
  for (let i = 0; i < amplitude.length; i++) {
    const amp = Number(amplitude[i] ?? 0);
    const hint = amp * Math.PI * 2;
    field.push({ real: amp * Math.cos(hint), imag: amp * Math.sin(hint) });
  }
  return field;
}

/**
 * Read-only chamber frame loader. Never mutates tape or rig state on disk.
 * @param {object} frame — tape.frames[i]
 * @param {{ tapeRoot?: string }} [opts]
 */
export function loadChamberFrame(frame, opts = {}) {
  const envelopeHash = frame.envelope?.hashes?.envelopeHash ?? null;
  const dataHash = frame.envelope?.hashes?.dataHash ?? frame.bufferRefs?.cpf4dHash ?? null;
  const grid = frame.envelope?.grid ?? frame.cpf4dEnvelope?.payload ?? {};
  const width = grid.width ?? grid.nx ?? 512;
  const height = grid.height ?? grid.ny ?? 512;

  let amplitude = null;
  let cpf4dHash = frame.bufferRefs?.cpf4dHash ?? null;
  const cpf4dPath = frame.bufferRefs?.cpf4d;
  if (cpf4dPath) {
    const buf = readFileSync(cpf4dPath);
    amplitude = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    cpf4dHash = cpf4dHash ?? hashFloat32Array(amplitude);
  }

  const actors = (frame.actors ?? []).map((actor) => {
    const zPath = actor.bufferRefs?.landmarkZ;
    let landmarkZ = null;
    if (zPath) {
      const zBuf = readFileSync(zPath);
      landmarkZ = new Float32Array(zBuf.buffer, zBuf.byteOffset, zBuf.byteLength / 4);
    }
    return {
      fieldId: actor.fieldId,
      landmarkZ,
      landmarkZHash: actor.bufferRefs?.landmarkZHash ?? null,
      rigSnapshotHash: actor.rigSnapshotHash ?? null,
    };
  });

  return {
    frameIndex: frame.frameIndex,
    envelopeHash,
    dataHash,
    cpf4dHash,
    width,
    height,
    amplitude,
    actors,
    beat: frame.beat ?? null,
    readOnly: true,
  };
}

/**
 * Build a read-only rig state from chamber actor landmark-z (no chamber mutation).
 * Uses first actor with landmark data for turbo maps.
 */
export function rigStateFromChamberActors(loaded, opts = {}) {
  const width = opts.width ?? loaded.width ?? 512;
  const height = opts.height ?? loaded.height ?? 512;
  const actor = loaded.actors?.find((a) => a.landmarkZ?.length >= LANDMARK_COUNT)
    ?? loaded.actors?.[0];
  if (!actor?.landmarkZ) return null;

  const rig = createDefaultFaceRig(actor.fieldId ?? "chamber-replay");
  const state = buildFaceRigState(rig, { width, height, dt: opts.dt ?? 1 / 24 });
  for (let i = 0; i < Math.min(LANDMARK_COUNT, actor.landmarkZ.length); i++) {
    if (state.landmarks[i]) state.landmarks[i].z = actor.landmarkZ[i];
  }
  return { rig, state, fieldId: actor.fieldId };
}

function phaseFieldToPng(phaseField, width, height) {
  const rgba = phaseToRgba(phaseField, width, height);
  return encodePngRgba8(width, height, rgba);
}

function projectPhysical(input, opts) {
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  let field = input.field;
  if (!field && input.amplitude) {
    field = amplitudeToComplexField(input.amplitude);
  }
  if (!field) throw new Error("RenderView physical: field or amplitude required");

  const phases = encodePhaseOnly(field, { mode: opts.phaseMode ?? "tiled" });
  const png = phaseFieldToPng(phases, width, height);
  return {
    mode: "physical",
    phases,
    png,
    status: RENDER_VIEW_STATUS.physical,
    envelopeHash: input.envelopeHash ?? null,
  };
}

function projectAnimeLut(input, opts) {
  const physical = projectPhysical(input, opts);
  const toon = applyToonLUT(physical.phases, {
    bands: opts.bands ?? 4,
    ramp: opts.ramp ?? "cel",
  });
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  const png = phaseFieldToPng(toon, width, height);
  return {
    mode: "anime",
    subMode: "toon-lut",
    phases: toon,
    png,
    status: RENDER_VIEW_STATUS.animeLut,
    envelopeHash: input.envelopeHash ?? null,
    sourcePhases: physical.phases,
  };
}

function projectPhotoreal(input, opts) {
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  const rigPack = input.rigState
    ? { rig: input.rig, state: input.rigState }
    : rigStateFromChamberActors(input, opts);
  if (!rigPack?.rig) {
    throw new Error("RenderView photoreal: rigState or chamber landmark-z required");
  }
  const maps = renderAllTurboControls(rigPack.rig, width, height, rigPack.state);
  return {
    mode: "photoreal",
    png: maps.topology.png,
    maps,
    status: RENDER_VIEW_STATUS.photoreal,
    envelopeHash: input.envelopeHash ?? null,
  };
}

/**
 * Optional SD img2img for anime view (sd-server A1111 API @ :13306).
 * Lemonade OpenAI path documented in CHAMBER_VS_FLIPBOOK.md — use face-rig-turbo --view anime.
 */
export async function callAnimeSdImg2img(maps, opts = {}) {
  const sdUrl = opts.sdUrl ?? process.env.SD_SERVER_URL ?? "http://127.0.0.1:13306";
  const initMap = opts.initMap ?? ANIME_VIEW_CONFIG.initMap;
  const initPng = initMap === "topology" ? maps.topology.png : maps.depth.png;
  const body = {
    init_images: [initPng.toString("base64")],
    prompt: opts.prompt ?? ANIME_VIEW_CONFIG.prompt,
    negative_prompt: opts.negative ?? ANIME_VIEW_CONFIG.negative,
    width: opts.width ?? 512,
    height: opts.height ?? 512,
    steps: opts.sdSteps ?? ANIME_VIEW_CONFIG.sdSteps,
    cfg_scale: opts.sdCfg ?? ANIME_VIEW_CONFIG.sdCfg,
    denoising_strength: opts.sdStrength ?? ANIME_VIEW_CONFIG.sdStrength,
    seed: opts.seed ?? 42,
    batch_size: 1,
  };
  const r = await fetch(`${sdUrl}/sdapi/v1/img2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`anime sd img2img ${r.status}: ${text.slice(0, 400)}`);
  }
  const payload = await r.json();
  const encoded = payload.images?.[0];
  if (!encoded) throw new Error("anime sd: no images in response");
  return Buffer.from(encoded, "base64");
}

async function projectAnimeSd(input, opts) {
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  const rigPack = input.rigState
    ? { rig: input.rig, state: input.rigState }
    : rigStateFromChamberActors(input, opts);
  if (!rigPack?.rig) {
    return { ...projectAnimeLut(input, opts), subMode: "toon-lut-fallback", sdSkipped: "no-rig" };
  }
  const maps = renderAllTurboControls(rigPack.rig, width, height, rigPack.state);
  try {
    const png = await callAnimeSdImg2img(maps, opts);
    return {
      mode: "anime",
      subMode: "sd-img2img",
      png,
      maps,
      status: RENDER_VIEW_STATUS.animeSd,
      envelopeHash: input.envelopeHash ?? null,
      prompt: opts.prompt ?? ANIME_VIEW_CONFIG.prompt,
    };
  } catch (err) {
    const lut = projectAnimeLut(input, opts);
    return {
      ...lut,
      subMode: "toon-lut-fallback",
      sdError: String(err.message ?? err),
    };
  }
}

/**
 * @param {object} [opts]
 * @param {"physical"|"anime"|"photoreal"} [opts.mode]
 */
export function createRenderView(opts = {}) {
  const defaultMode = opts.mode ?? "physical";

  return {
    mode: defaultMode,
    status: RENDER_VIEW_STATUS,

    /**
     * Project chamber replay input to PNG. Read-only — never mutates chamber state.
     * @param {object} input — loadChamberFrame() result or live step payload
     * @param {object} [projectOpts]
     */
    project(input, projectOpts = {}) {
      const mode = projectOpts.mode ?? this.mode;
      const frozen = structuredClone
        ? structuredClone(input)
        : JSON.parse(JSON.stringify(input, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

      if (mode === "photoreal") return projectPhotoreal(frozen, { ...opts, ...projectOpts });
      if (mode === "anime" && projectOpts.animePath === "sd") {
        throw new Error("anime SD path is async — use projectAsync()");
      }
      if (mode === "anime") return projectAnimeLut(frozen, { ...opts, ...projectOpts });
      return projectPhysical(frozen, { ...opts, ...projectOpts });
    },

    /** Async projection (anime SD img2img). */
    async projectAsync(input, projectOpts = {}) {
      const mode = projectOpts.mode ?? this.mode;
      const frozen = structuredClone
        ? structuredClone(input)
        : JSON.parse(JSON.stringify(input, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

      if (mode === "anime" && (projectOpts.animePath === "sd" || projectOpts.useSd)) {
        return projectAnimeSd(frozen, { ...opts, ...projectOpts });
      }
      return this.project(frozen, projectOpts);
    },
  };
}

/** Convenience: turbo control maps from rig (depth + topology) for external SD hosts. */
export function renderTurboMapsFromInput(input, opts = {}) {
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  const rigPack = input.rigState
    ? { rig: input.rig, state: input.rigState }
    : rigStateFromChamberActors(input, opts);
  if (!rigPack?.rig) return null;
  const maps = renderAllTurboControls(rigPack.rig, width, height, rigPack.state);
  return {
    depth: maps.depth,
    topology: maps.topology,
    flow: maps.flow,
    rig: rigPack.rig,
    state: rigPack.state,
  };
}
