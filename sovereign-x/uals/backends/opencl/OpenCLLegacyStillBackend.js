/**
 * UALS v1.0 — OpenCL Backend Adapter (Node.js native, no canvas dependency)
 * Wraps the legacy_still OpenCL kernel as a UALS-compliant backend
 */

import { AssistBackendInterface } from "../../abi/AssistBackendInterface.js";
import { UALSError, ERROR_CODES } from "../../types.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../../");
const OPENCL_SCRIPT = join(repoRoot, "scripts", "legacy_efficient", "opencl_tonga_still.py");

function parsePNG(buffer) {
  if (buffer.length < 8) throw new Error("Invalid PNG: too small");
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47 ||
      buffer[4] !== 0x0D || buffer[5] !== 0x0A || buffer[6] !== 0x1A || buffer[7] !== 0x0A) {
    throw new Error("Invalid PNG signature");
  }

  let offset = 8;
  let width = 0, height = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    if (offset + 4 > buffer.length) break;
    const type = buffer.toString("ascii", offset, offset + 4);
    offset += 4;

    if (type === "IHDR") {
      if (offset + 13 > buffer.length) throw new Error("Invalid IHDR");
      width = buffer.readUInt32BE(offset);
      height = buffer.readUInt32BE(offset + 4);
      offset += 13;
    } else if (type === "IDAT") {
      const data = buffer.slice(offset, offset + length);
      idatChunks.push(data);
      offset += length;
    } else {
      offset += length;
    }

    offset += 4;

    if (type === "IEND") break;
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = inflateSync(compressed);

  const stride = width * 4 + 1;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride + 1;
    const rowData = decompressed.slice(rowStart, rowStart + width * 4);
    rgba.set(rowData, y * width * 4);
  }

  return { data: rgba, width, height, channels: 4, bytesPerChannel: 1 };
}

export class OpenCLLegacyStillBackend extends AssistBackendInterface {
  constructor(config = {}) {
    super({
      backendId: config.backendId || "opencl-legacy-still",
      backendType: "opencl",
      determinismLevel: "bit-exact",
      maxTileSize: config.maxTileSize || { width: 512, height: 512 },
      supportedKernels: new Set(["legacy_still_256", "legacy_still_512"]),
    });

    this.python = config.python || process.env.PYTHON || "python";
    this.timeoutMs = config.timeoutMs || 120000;
    this.scriptPath = config.scriptPath || OPENCL_SCRIPT;
    this.workDir = config.workDir || tmpdir();
    this.deviceName = config.deviceName || null;
  }

  async _doInit(context) {
    if (!existsSync(this.scriptPath)) {
      throw new UALSError(
        ERROR_CODES.BACKEND_INIT_FAILED,
        `OpenCL script not found: ${this.scriptPath}`
      );
    }

    mkdirSync(this.workDir, { recursive: true });

    const probeResult = await this._probeDevice();
    this.deviceName = probeResult.deviceName;

    return {
      success: true,
      deviceName: this.deviceName,
      platforms: probeResult.platforms,
      devices: probeResult.devices,
    };
  }

  async _probeDevice() {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [this.scriptPath, "--width", "1", "--height", "1", "--out", "/dev/null", "--report", "/dev/null"], {
        cwd: repoRoot,
        windowsHide: true,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("OpenCL probe timed out"));
      }, 10000);

      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
          const report = JSON.parse(line || "{}");
          resolve({
            deviceName: report.deviceName || "unknown",
            platforms: report.platforms || [],
            devices: report.devices || [],
          });
        } catch {
          resolve({ deviceName: "unknown", platforms: [], devices: [] });
        }
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async _doExecute(kernelId, params, tile) {
    const width = tile.width;
    const height = tile.height;
    const seed = params.seed || 1.0;

    const tileId = tile.tileId || `tile-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const outPath = join(this.workDir, `uals-${tileId}.png`);
    const reportPath = join(this.workDir, `uals-${tileId}-report.json`);

    const args = [
      this.scriptPath,
      "--out", outPath,
      "--report", reportPath,
      "--width", String(width),
      "--height", String(height),
      "--seed", String(seed),
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(this.python, args, {
        cwd: repoRoot,
        windowsHide: true,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new UALSError(ERROR_CODES.BACKEND_EXECUTE_FAILED, `OpenCL execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new UALSError(ERROR_CODES.BACKEND_EXECUTE_FAILED, `OpenCL spawn error: ${err.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          let report = null;
          if (existsSync(reportPath)) {
            try {
              report = JSON.parse(readFileSync(reportPath, "utf8"));
            } catch {}
          }
          if (!report) {
            try {
              const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
              report = JSON.parse(line || "{}");
            } catch {}
          }

          const pngOk = existsSync(outPath);
          const ok = (code === 0 || code === null) && pngOk && (report?.ok === true || report === null);

          if (!ok) {
            const errorMsg = report?.error || stderr.slice(0, 400) || `exit ${code}`;
            reject(new UALSError(ERROR_CODES.BACKEND_EXECUTE_FAILED, `OpenCL execution failed: ${errorMsg}`));
            return;
          }

          const pngBuffer = readFileSync(outPath);
          const parsed = parsePNG(pngBuffer);

          const hash = createHash("sha256").update(Buffer.from(parsed.data.buffer)).digest("hex");

          resolve({
            output: parsed,
            metadata: {
              deviceName: this.deviceName,
              elapsedMs: report?.elapsedMs,
              byteLength: report?.byteLength,
              tileId,
              sha256: hash,
            },
            executionTimeMs: report?.elapsedMs || 0,
          });
        } catch (err) {
          reject(new UALSError(ERROR_CODES.BACKEND_EXECUTE_FAILED, `Readback/parse failed: ${err.message}`));
        }
      });
    });
  }

  async _doReadback(tile) {
    return { success: true, message: "Readback handled in _doExecute" };
  }

  async _doTeardown() {
    return { message: "OpenCL backend teardown complete" };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      deviceName: this.deviceName,
      scriptPath: this.scriptPath,
      python: this.python,
    };
  }
}

export function createOpenCLLegacyStillBackend(config) {
  return new OpenCLLegacyStillBackend(config);
}