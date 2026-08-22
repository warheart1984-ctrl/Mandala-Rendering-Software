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
      const { execFileSync } = await import("node:child_process");
      const out = execFileSync("ffmpeg", ["-encoders"], { encoding: "utf-8", timeout: 5000 });
      return out.includes("nvenc");
    } catch {
      return false;
    }
  }

  /**
   * Run ffmpeg safely via spawn (no shell interpolation).
   */
  static _runFfmpeg(encoderPath, args) {
    return new Promise((resolve, reject) => {
      import("node:child_process").then(({ spawn }) => {
        const child = spawn(encoderPath, args, { stdio: "pipe", timeout: 3600000 });
        let stderr = "";
        child.stderr.on("data", (d) => (stderr += d));
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 500)}`));
        });
        child.on("error", reject);
      });
    });
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

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nvenc-"));
    const framePrefix = "nvenc-frame";

    for (let i = 0; i < this._frames.length; i++) {
      const framePath = path.join(tmpDir, `${framePrefix}-${String(i).padStart(6, "0")}.raw`);
      fs.writeFileSync(framePath, Buffer.from(this._frames[i].data));
      if (onProgress && i % 30 === 0) onProgress(i + 1, this._frames.length);
    }

    const encoder = this.codec === "h264" ? "h264_nvenc" : "hevc_nvenc";
    const inputPattern = path.join(tmpDir, `${framePrefix}-%06d.raw`);
    const args = [
      "-y",
      "-f", "rawvideo",
      "-pix_fmt", "bgra",
      "-s", `${this.width ?? 1920}x${this.height ?? 1080}`,
      "-r", String(this.fps),
      "-i", inputPattern,
      "-c:v", encoder,
      "-b:v", String(this.bitrate),
      "-preset", String(this.preset),
      "-gpu", String(this.gpuIndex),
      path.resolve(outputPath),
    ];

    try {
      await NVENCEncoder._runFfmpeg(this._encoderPath, args);
    } catch (e) {
      throw new Error(`NVENC encoding failed: ${e.message}`, { cause: e });
    }

    await this._cleanupTmp(tmpDir);
    return { outputPath: path.resolve(outputPath), frameCount: this._frames.length };
  }
}
