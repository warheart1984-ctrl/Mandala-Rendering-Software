import { createHash } from "crypto";

/**
 * Photoreal Evidence Recorder
 * Records per-frame evidence with full provenance chain
 */
export class PhotorealEvidenceRecorder {
  constructor(config = {}) {
    this.records = [];
    this.active = false;
    this.worldId = config.worldId || "world-photoreal-001";
    this.timelineId = config.timelineId || "timeline-photoreal-v1";
    this.intentId = config.intentId || "render-4d-photoreal";
    this.frameCount = 0;
  }

  begin() {
    this.records = [];
    this.active = true;
    this.frameCount = 0;
  }

  record(frameRecord) {
    if (!this.active) throw new Error("Recorder not active: call begin() first");
    
    // Validate required fields
    this._validateFrame(frameRecord);
    
    // Canonicalize for deterministic hashing
    const canonical = this._canonicalize(frameRecord);
    const record = {
      ...canonical,
      frameHash: this._computeFrameHash(canonical),
      timestamp: Date.now() // audit field - excluded from canonical
    };
    
    this.records.push(record);
    this.frameCount++;
    return record;
  }

  finalize() {
    if (!this.active) throw new Error("Recorder not active");
    this.active = false;
    return this.records;
  }

  _validateFrame(r) {
    if (!r.frame || r.frame < 0) throw new Error("V2: missing frame");
    if (r.timeSeconds === undefined) throw new Error("V2: missing timeSeconds");
    if (r.intentId !== this.intentId) throw new Error(`V5: intentId mismatch (${r.intentId})`);
    if (r.timelineId !== this.timelineId) throw new Error("V2: timelineId mismatch");
    if (r.worldId !== this.worldId) throw new Error("V2: worldId mismatch");
    if (r.timeSeconds !== r.frame / 30) throw new Error("V2: timeSeconds mismatch");
    if (!r.parameters) throw new Error("V2: missing parameters");
    
    // Photoreal-specific checks
    if (!r.radiance) throw new Error("V2: missing radiance");
    if (!r.aovs) throw new Error("V2: missing aovs");
    if (!r.camera) throw new Error("V2: missing camera");
    
    // V4 dual evidence
    if (!r.radianceHash) throw new Error("V4: missing radianceHash");
    if (!r.aovsHash) throw new Error("V4: missing aovsHash");
  }

  _canonicalize(r) {
    // Create canonical record for hashing (excludes non-deterministic fields)
    return {
      frame: r.frame,
      timeSeconds: r.timeSeconds,
      t: r.t,
      replayToken: r.replayToken,
      radianceHash: r.radianceHash,
      aovsHash: r.aovsHash,
      camera: {
        eye: r.camera.eye,
        target: r.camera.target,
        focal: r.camera.focal,
        aperture: r.camera.aperture,
        focusDistance: r.camera.focusDistance
      },
      integrator: {
        spp: r.integrator?.spp,
        maxDepth: r.integrator?.maxDepth,
        strategy: r.integrator?.strategy
      },
      denoiser: {
        enabled: r.denoiser?.enabled,
        method: r.denoiser?.method,
        historyLength: r.denoiser?.historyLength
      },
      renderer: {
        contract: "photoreal.v1",
        backend: r.renderer?.backend,
        seed: r.renderer?.seed
      },
      parameters: r.parameters,
      intentId: r.intentId,
      timelineId: r.timelineId,
      worldId: r.worldId
    };
  }

  _computeFrameHash(canonical) {
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
  }

  frameHash(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.records.length) {
      throw new Error(`Frame index out of bounds: ${frameIndex}`);
    }
    return this.records[frameIndex].frameHash;
  }

  runtimeFingerprint() {
    // Return the runtime fingerprint from the first record's renderer
    if (this.records.length > 0) {
      return this.records[0].renderer?.fingerprint || "unknown";
    }
    return createHash("sha256").update(JSON.stringify({
      contractVersion: "1.0.0",
      metricSignature: [-1, 1, 1, 1],
      c: 1,
      dtau: 0.03,
      d4: 4,
      seed: "0x5EED4D00",
      frames: 300,
      fps: 30,
      width: 1920,
      height: 1080,
      integrator: { strategy: "path", maxDepth: 16, rrDepth: 4, spp: 64 },
      camera: { aperture: 2.8, focal: 35, sensor: [36, 24] },
      denoiser: { history: 8, method: "temporal" }
    })).digest("hex").slice(0, 32);
  }

  getRecords() {
    return this.records;
  }
}

export function canonicalFrameRecord(frameRecord, replayToken) {
  return {
    frame: frameRecord.frame,
    timeSeconds: frameRecord.timeSeconds,
    t: frameRecord.t,
    replayToken,
    radianceHash: frameRecord.radianceHash,
    aovsHash: frameRecord.aovsHash,
    camera: frameRecord.camera,
    integrator: frameRecord.integrator,
    denoiser: frameRecord.denoiser,
    renderer: frameRecord.renderer,
    parameters: frameRecord.parameters,
    intentId: frameRecord.intentId,
    timelineId: frameRecord.timelineId,
    worldId: frameRecord.worldId
  };
}

export function frameHash(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 32);
}

export function runtimeFingerprint(config) {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 32);
}

export { createHash } from "crypto";