export class GPUVideoEncoder {
  constructor(options = {}) {
    this.fps = options.fps ?? 30;
    this.bitrate = options.bitrate ?? "20M";
    this.codec = options.codec ?? "h264";
    this.preset = options.preset ?? "p4";
    this._frames = [];
    this._encoding = false;
  }

  addFrame(pixelData, pts) {
    this._frames.push({ data: pixelData, pts: pts ?? this._frames.length / this.fps });
    return this;
  }

  get frameCount() {
    return this._frames.length;
  }

  get duration() {
    return this._frames.length / this.fps;
  }

  async encode(outputPath, onProgress = null) {
    this._encoding = true;
    try {
      return await this._encodeInternal(outputPath, onProgress);
    } finally {
      this._encoding = false;
    }
  }

  async _encodeInternal(outputPath, onProgress) {
    const { encodeVideo } = await import("../pipeline/movie-pipeline.js");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpu-video-"));
    const framePrefix = "gpu-frame";

    for (let i = 0; i < this._frames.length; i++) {
      const framePath = path.join(tmpDir, `${framePrefix}-${String(i).padStart(6, "0")}.raw`);
      fs.writeFileSync(framePath, Buffer.from(this._frames[i].data));
      if (onProgress && i % 30 === 0) onProgress(i + 1, this._frames.length);
    }

    const result = encodeVideo(
      tmpDir,
      path.resolve(outputPath),
      this.fps,
      framePrefix,
      this.codec === "h264" ? "libx264" : this.codec,
      this.bitrate
    );

    this._cleanupTmp(tmpDir);
    return result;
  }

  _cleanupTmp(dir) {
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const entries = fs.readdirSync(dir);
      for (const e of entries) fs.unlinkSync(path.join(dir, e));
      fs.rmdirSync(dir);
    } catch {}
  }

  clear() {
    this._frames = [];
    return this;
  }

  release() {
    this.clear();
  }
}
