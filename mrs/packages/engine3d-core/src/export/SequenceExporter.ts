/**
 * FFmpeg PNG → MP4 exporter.
 * Status: **prepared** when `ffmpeg` is on PATH; otherwise fails clearly.
 */

import { spawn } from "node:child_process";
import path from "node:path";

export interface SequenceExportConfig {
  /** Directory containing frame_XXXX_final.png */
  framesDir: string;
  fps: number;
  outputVideoPath: string;
  /** Override binary; default "ffmpeg". */
  ffmpegBin?: string;
}

export class SequenceExporter {
  constructor(private cfg: SequenceExportConfig) {}

  async export(): Promise<void> {
    if (!(this.cfg.fps > 0)) throw new Error("fps must be > 0");
    const pattern = path.join(this.cfg.framesDir, "frame_%04d_final.png");
    const bin = this.cfg.ffmpegBin ?? "ffmpeg";
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-framerate",
        String(this.cfg.fps),
        "-i",
        pattern,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        this.cfg.outputVideoPath,
      ];
      const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      proc.stderr?.on("data", (d) => {
        err += String(d);
      });
      proc.on("error", (e) => {
        reject(
          new Error(
            `ffmpeg spawn failed (${bin}): ${e.message}. Install ffmpeg or skip export.`,
          ),
        );
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`));
        } else resolve();
      });
    });
  }
}
