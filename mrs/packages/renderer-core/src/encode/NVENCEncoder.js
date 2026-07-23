import { GPUVideoEncoder } from "./GPUVideoEncoder.js";

export class NVENCEncoder extends GPUVideoEncoder {
  constructor(options = {}) {
    super({ ...options, codec: options.codec ?? "h264" });
    this.nvencAvailable = false;
    this.gpuIndex = options.gpuIndex ?? 0;
    this._encoderPath = options.encoderPath ?? "ffmpeg";
  }

  static async isSupported() {
    try {
      const { execSync } = require("node:child_process");
      const out = execSync("ffmpeg -encoders 2>&1 | findstr nvenc", { encoding: "utf-8", timeout: 5000 });
      return out.length > 0;
    } catch {
      return false;
    }
  }

  async _encodeInternal(outputPath, onProgress) {
    const supported = await NVENCEncoder.isSupported();
    if (!supported) {
      console.warn("NVENC not available, falling back to software encoding");
      return super._encodeInternal(outputPath, onProgress);
    }

    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { execSync } = await import("node:child_process");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nvenc-"));
    const framePrefix = "nvenc-frame";

    for (let i = 0; i < this._frames.length; i++) {
      const framePath = path.join(tmpDir, `${framePrefix}-${String(i).padStart(6, "0")}.raw`);
      fs.writeFileSync(framePath, Buffer.from(this._frames[i].data));
      if (onProgress && i % 30 === 0) onProgress(i + 1, this._frames.length);
    }

    const encoder = this.codec === "h264" ? "h264_nvenc" : "hevc_nvenc";
    const ffmpegCmd = `${this._encoderPath} -y -f rawvideo -pix_fmt bgra -s ${this.width ?? 1920}x${this.height ?? 1080} -r ${this.fps} -i "${path.join(tmpDir, `${framePrefix}-%06d.raw`)}" -c:v ${encoder} -b:v ${this.bitrate} -preset ${this.preset} -gpu ${this.gpuIndex} "${path.resolve(outputPath)}"`;

    try {
      execSync(ffmpegCmd, { stdio: "pipe", timeout: 3600000 });
    } catch (e) {
      throw new Error(`NVENC encoding failed: ${e.message}`);
    }

    this._cleanupTmp(tmpDir);
    return { outputPath: path.resolve(outputPath), frameCount: this._frames.length };
  }
}
