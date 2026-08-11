import { createHash } from "node:crypto";
import { mulberry32 } from "./SkyField.js";
import { CANONICAL_WAVES } from "./OceanField.js";

export class EnvironmentEvidenceRecorder {
  constructor() {
    this.records = [];
    this.active = false;
    this.worldId = "world-cinematic-sunrise-001";
    this.timelineId = "timeline-sunrise-v1";
    this.intentId = "render-4d-cinematic-sunrise";
  }

  begin() {
    this.records = [];
    this.active = true;
  }

  record(record) {
    if (!this.active) throw new Error("Recorder not active: call begin() first");
    this._validateFrame(record);
    this.records.push(this._canonicalize(record));
  }

  finalize() {
    if (!this.active) throw new Error("Recorder not active");
    this.active = false;
    return this.records;
  }

  _validateFrame(r) {
    if (r.intentId !== this.intentId) throw new Error(`V5: intentId mismatch (${r.intentId})`);
    if (r.timelineId !== this.timelineId) throw new Error(`V2: timelineId mismatch`);
    if (r.worldId !== this.worldId) throw new Error(`V2: worldId mismatch`);
    if (r.timeSeconds !== r.frame / 30) throw new Error(`V2: timeSeconds mismatch`);
    if (!r.parameters) throw new Error(`V2: missing parameters`);

    // V4/V5 dual-evidence checks only when sun field is present
    if (r.sun) {
      if (r.sun.errorBound?.finite === false) throw new Error(`V4: sun errorBound finite=false`);
      if (!r.sun.sourceCertificationId) throw new Error(`V4: sun missing sourceCertificationId`);
    }
  }

_canonicalize(r) {
    const { sun, sky, ocean, camera, light, frame, timeSeconds, replayToken, ...rest } = r;
    // Generate replayToken if not provided (for minimal test records)
    const token = replayToken ?? createHash("sha256").update(JSON.stringify({ frame: r.frame, timeSeconds: r.timeSeconds })).digest("hex").slice(0, 32);
    const canonical = {
      frame: r.frame, timeSeconds: r.timeSeconds, replayToken: token,
      sun: sun ? { p3: sun.p3, sunDir: sun.sunDir, sunWorld: sun.sunWorld, dawnFactor: sun.dawnFactor, errorBound: sun.errorBound } : null,
      sky: sky ? { dawnFactor: sky.dawnFactor, zenithErrorBound: sky.zenithErrorBound } : null,
      ocean: ocean ? { tau: ocean.tau, anchorBounds: ocean.anchorBounds } : null,
      camera, light,
    };
    // Add bundle fields for V3
    return {
      id: createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16),
      worldId: r.worldId ?? this.worldId,
      timelineId: r.timelineId ?? this.timelineId,
      ...canonical,
    };
  }

  frameHash(N) {
    const rec = this.records[N];
    const canonical = this._canonicalize(rec);
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
  }

  runtimeFingerprint() {
    const fp = {
      contractVersion: "1.0.1",
      metricSignature: [-1, 1, 1, 1], c: 1, dtau: 0.03, d4: 4,
      projection: { mode: "perspective", parameters: { d: 4 } },
      seed: "0x5EED4D00", frames: 300, fps: 30, width: 1280, height: 720,
      sunInitialPosition: [0, -0.40, 0, 0],
      sunInitialVelocity: [1.71636, 1.35, 0.35, 0.03],
      waves: CANONICAL_WAVES, domeRadius: 90,
    };
    return createHash("sha256").update(JSON.stringify(fp)).digest("hex").slice(0, 32);
  }
}

export function canonicalFrameRecord(envRecord, replayToken) {
  return {
    frame: envRecord.frame, timeSeconds: envRecord.timeSeconds, t: envRecord.t, replayToken,
    sun: { p3: envRecord.sun.p3, sunDir: envRecord.sun.sunDir, sunWorld: envRecord.sun.sunWorld, dawnFactor: envRecord.sun.dawnFactor, errorBound: envRecord.sun.errorBound, sourceCertificationId: envRecord.sun.sourceCertificationId },
    sky: { dawnFactor: envRecord.sky.dawnFactor, zenithErrorBound: envRecord.sky.zenithErrorBound },
    ocean: { tau: envRecord.ocean.tau, anchorBounds: envRecord.ocean.anchorBounds },
    camera: envRecord.camera, light: envRecord.light,
  };
}

export function frameHash(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 32);
}