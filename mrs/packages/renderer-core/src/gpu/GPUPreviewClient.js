import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import {
  SharedConfigBlock,
  makeConfigHandleName,
  makeImageHandleName,
  makeSemaphoreHandleName,
  SharedImageFormat,
  ProducerStatus,
  ConsumerStatus,
  FLAG,
  SHARED_GPU_IMAGE_MAGIC,
  SHARED_GPU_IMAGE_VERSION,
  gpuErrorToString,
} from "./SharedGPUImage.js";

export const PreviewState = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  PRESENTING: "presenting",
  DEVICE_LOST: "device-lost",
  ERROR: "error",
  RESTARTING: "restarting",
});

export class GPUPreviewClient extends EventEmitter {
  constructor(options = {}) {
    super();

    this.instanceName = options.instanceName ?? "4d-renderer";
    this.previewExePath = options.previewExePath ?? this.findPreviewExe();
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.format = options.format ?? SharedImageFormat.R8G8B8A8_UNORM;
    this.doubleBufferSlots = options.doubleBufferSlots ?? 2;
    this.enableVsync = options.enableVsync ?? true;
    this.autoRestart = options.autoRestart ?? true;
    this.maxRestarts = options.maxRestarts ?? 5;
    this.timeoutMs = options.timeoutMs ?? 5000;

    this.state = PreviewState.DISCONNECTED;
    this.process = null;
    this.configView = null;
    this.restartCount = 0;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this._watchInterval = null;
    this._loadAttempted = false;
    this._nativeApi = null;
  }

  findPreviewExe() {
    const candidates = [
      path.join(process.cwd(), "native-preview", "build", "bin", "4d-preview.exe"),
      path.join(process.cwd(), "build", "4d-preview.exe"),
      path.join(__dirname, "..", "..", "native-preview", "build", "bin", "4d-preview.exe"),
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c; } catch {}
    }
    return candidates[0];
  }

  async start() {
    if (this.state === PreviewState.CONNECTED || this.state === PreviewState.PRESENTING) {
      return true;
    }

    this.setState(PreviewState.CONNECTING);

    try {
      await this.launchPreviewProcess();
      await this.waitForConnection();
      this.startWatchdog();
      this.setState(PreviewState.CONNECTED);
      this.restartCount = 0;
      this.emit("connected", { width: this.width, height: this.height });
      return true;
    } catch (err) {
      this.setState(PreviewState.ERROR);
      this.emit("error", err);
      return false;
    }
  }

  async launchPreviewProcess() {
    if (!this.previewExePath) {
      throw new Error("Preview executable path not configured");
    }

    const args = [
      "--instance", this.instanceName,
      "--width", String(this.width),
      "--height", String(this.height),
      this.enableVsync ? "--vsync" : "--no-vsync",
    ];

    this.process = spawn(this.previewExePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    this.process.on("exit", (code, signal) => {
      this.emit("process-exit", { code, signal });
      if (this.state === PreviewState.CONNECTED || this.state === PreviewState.PRESENTING) {
        this.handleProcessExit(code, signal);
      }
    });

    this.process.stdout.on("data", (data) => {
      this.emit("preview-stdout", data.toString());
    });

    this.process.stderr.on("data", (data) => {
      this.emit("preview-stderr", data.toString());
    });

    this.emit("process-launched", { pid: this.process.pid, exe: this.previewExePath });
  }

  handleProcessExit(code, signal) {
    this.process = null;
    this.emit("disconnected", { code, signal });

    if (this.autoRestart && this.restartCount < this.maxRestarts) {
      this.restartCount++;
      this.setState(PreviewState.RESTARTING);
      setTimeout(() => this.start(), Math.min(1000 * this.restartCount, 10000));
    } else {
      this.setState(PreviewState.DISCONNECTED);
    }
  }

  async waitForConnection() {
    const configName = makeConfigHandleName(this.instanceName);
    const startTime = Date.now();
    let lastError = null;

    while (Date.now() - startTime < this.timeoutMs) {
      try {
        // Read the shared config block via the native addon or fallback
        const config = await this.readConfigBlock();

        if (config && config.magic === SHARED_GPU_IMAGE_MAGIC) {
          if (config.consumerStatus >= ConsumerStatus.CONNECTED) {
            this.width = config.width;
            this.height = config.height;
            this.emit("producer-detected", config);
            return;
          }
        }
      } catch (err) {
        lastError = err;
      }
      await sleep(100);
    }

    throw new Error(`Preview connection timeout (${this.timeoutMs}ms): ${lastError?.message ?? "consumer not ready"}`);
  }

  async readConfigBlock() {
    // Read from native API if loaded, otherwise use SXFR fallback
    if (this._nativeApi) {
      return this._nativeApi.readConfig();
    }
    // SXFR fallback using file-based shared memory
    return this.readConfigViaSXFR();
  }

  async readConfigViaSXFR() {
    const configPath = this.getConfigFilePath();
    try {
      const data = fs.readFileSync(configPath);
      return SharedConfigBlock.read(data);
    } catch {
      return null;
    }
  }

  getConfigFilePath() {
    return path.join(
      process.env.TEMP || "/tmp",
      `4d-gpu-preview-${this.instanceName}.bin`
    );
  }

  startWatchdog() {
    if (this._watchInterval) return;
    this._watchInterval = setInterval(() => {
      this.pollState();
    }, 250);
  }

  stopWatchdog() {
    if (this._watchInterval) {
      clearInterval(this._watchInterval);
      this._watchInterval = null;
    }
  }

  async pollState() {
    if (!this.process || this.state === PreviewState.DISCONNECTED) return;

    try {
      const config = await this.readConfigBlock();
      if (!config) return;

      if (config.flags & FLAG.DEVICE_LOST) {
        this.setState(PreviewState.DEVICE_LOST);
        this.emit("device-lost", config);
        return;
      }

      if (config.flags & FLAG.RESIZE_PENDING) {
        this.emit("resize-pending", { width: config.width, height: config.height });
      }

      if (config.frameCount > this.frameCount) {
        this.frameCount = config.frameCount;
        this.emit("frame", {
          frameIndex: config.frameCount,
          activeSlot: config.activeSlot,
          width: config.width,
          height: config.height,
        });
      }

      this.lastFrameTime = config.lastFrameTimeNs;

      if (config.producerStatus === ProducerStatus.FRAME_READY &&
          config.consumerStatus === ConsumerStatus.PRESENTING) {
        this.setState(PreviewState.PRESENTING);
      }
    } catch (err) {
      this.emit("poll-error", err);
    }
  }

  async presentFrame(frameIndex, activeSlot) {
    // Frame is already being presented by the native preview process.
    // This is a no-op on the JS side — the GPU blit happens entirely
    // in the native Vulkan consumer.
    this.emit("frame-presented", { frameIndex, activeSlot });
    return true;
  }

  async resize(width, height) {
    this.width = width;
    this.height = height;

    // Signal resize via config block flags
    try {
      const configPath = this.getConfigFilePath();
      const data = fs.readFileSync(configPath);
      const block = SharedConfigBlock.read(data);
      if (block) {
        block.flags |= FLAG.RESIZE_PENDING;
        block.width = width;
        block.height = height;
        const buf = SharedConfigBlock.write(block, width, height,
          block.format, block.doubleBufferSlots, block.activeSlot,
          block.frameCount, block.flags);
        fs.writeFileSync(configPath, buf);
      }
    } catch {}

    this.emit("resize", { width, height });
  }

  async stop() {
    this.stopWatchdog();
    if (this.process) {
      this.process.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
    }
    this.setState(PreviewState.DISCONNECTED);
    this.process = null;
    this.emit("stopped");
  }

  setState(newState) {
    const prev = this.state;
    this.state = newState;
    if (prev !== newState) {
      this.emit("state-change", { from: prev, to: newState });
    }
  }

  getStats() {
    return {
      state: this.state,
      instanceName: this.instanceName,
      width: this.width,
      height: this.height,
      format: this.format,
      doubleBufferSlots: this.doubleBufferSlots,
      enableVsync: this.enableVsync,
      frameCount: this.frameCount,
      lastFrameTime: this.lastFrameTime,
      restartCount: this.restartCount,
      pid: this.process?.pid ?? null,
      previewExe: this.previewExePath,
    };
  }

  toJSON() {
    return this.getStats();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createGPUPreviewClient(options = {}) {
  return new GPUPreviewClient(options);
}
