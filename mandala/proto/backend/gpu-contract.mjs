/**
 * GPU mathematical contract — sits ABOVE backends.
 * CPU JS `computeGradientInto` is source of truth.
 * Vulkan is the preferred high-performance path, not the definition of truth.
 *
 * Status: **partial** if a live dispatch agrees; else **declared** stub + blocked-with-evidence.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeGradientInto } from "../cpu-reference.mjs";
import { PROTO_SHAPE } from "../constitution.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const GPU_NUMERIC_CONTRACT = Object.freeze({
  id: "mandala.proto.cpu-gpu-grad.v0",
  metric: "maxAbsError",
  maxAbsError: 1e-4,
  kernel: "finite-difference ∇φ (Neumann, dx=2 interior)",
  truth: "cpu-reference.mjs computeGradientInto",
  backends: {
    vulkan: "preferred",
    opencl: "declared",
    cuda: "declared",
    hip: "declared",
    webgpu: "declared",
  },
});

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 20000,
    cwd: opts.cwd,
  });
}

export function assembleSpirv(outSpv) {
  const asm = join(__dirname, "spirv/grad.spvasm");
  const as = run("spirv-as", [asm, "-o", outSpv, "--target-env", "vulkan1.0"]);
  if (as.status !== 0) {
    return { ok: false, step: "spirv-as", stderr: as.stderr || as.error?.message };
  }
  const val = run("spirv-val", [outSpv, "--target-env", "vulkan1.0"]);
  if (val.status !== 0) {
    return { ok: false, step: "spirv-val", stderr: val.stderr || val.error?.message };
  }
  return { ok: true, spv: outSpv };
}

export function compileVulkanHost(binPath) {
  const src = join(__dirname, "vulkan_grad.c");
  const cc = run("gcc", ["-O2", "-o", binPath, src, "-lvulkan"]);
  if (cc.status !== 0) {
    return { ok: false, step: "gcc", stderr: cc.stderr || cc.error?.message };
  }
  return { ok: true, bin: binPath };
}

export function maxAbsError(a, b) {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const e = Math.abs(a[i] - b[i]);
    if (e > m) m = e;
  }
  return m;
}

/**
 * Probe Vulkan and compare GPU ∇φ to CPU reference.
 * Never OOMs: 32³ × 4+12 bytes.
 */
export function probeAndCompareGradient({
  scalar,
  shape = PROTO_SHAPE,
  repoRoot,
  outDir,
} = {}) {
  const evidence = {
    contract: GPU_NUMERIC_CONTRACT,
    status: "declared",
    gpuLive: false,
    blockedWithEvidence: false,
    device: null,
    maxAbsError: null,
    passed: false,
  };

  try {
    const buildDir = join(__dirname, "build");
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    const spv = join(buildDir, "grad.spv");
    const asm = assembleSpirv(spv);
    if (!asm.ok) {
      evidence.status = "declared";
      evidence.blockedWithEvidence = true;
      evidence.reason = asm;
      writeFileSync(join(outDir, "gpu-evidence.json"), JSON.stringify(evidence, null, 2));
      return evidence;
    }

    const bin = join(buildDir, "vulkan_grad");
    const compiled = compileVulkanHost(bin);
    if (!compiled.ok) {
      evidence.status = "declared";
      evidence.blockedWithEvidence = true;
      evidence.reason = compiled;
      writeFileSync(join(outDir, "gpu-evidence.json"), JSON.stringify(evidence, null, 2));
      return evidence;
    }

    const phiPath = join(outDir, "phi.bin");
    const gradPath = join(outDir, "grad-gpu.bin");
    writeFileSync(phiPath, Buffer.from(scalar.buffer, scalar.byteOffset, scalar.byteLength));

    const cpuGrad = new Float32Array(shape.cellCount * 3);
    computeGradientInto(scalar, cpuGrad, shape);

    const proc = run(compiled.bin, [
      "--shader",
      spv,
      "--in",
      phiPath,
      "--out",
      gradPath,
      "--nx",
      String(shape.nx),
      "--ny",
      String(shape.ny),
      "--nz",
      String(shape.nz),
    ], { timeout: 15000 });

    if (proc.status !== 0) {
      evidence.status = "declared";
      evidence.blockedWithEvidence = true;
      evidence.reason = {
        step: "dispatch",
        status: proc.status,
        stderr: proc.stderr,
        stdout: proc.stdout,
        error: proc.error?.message,
      };
      writeFileSync(join(outDir, "gpu-evidence.json"), JSON.stringify(evidence, null, 2));
      return evidence;
    }

    const gpuBuf = readFileSync(gradPath);
    const gpuGrad = new Float32Array(gpuBuf.buffer, gpuBuf.byteOffset, gpuBuf.byteLength / 4);
    const err = maxAbsError(cpuGrad, gpuGrad);
    let device = null;
    try {
      device = JSON.parse(proc.stdout.trim()).device;
    } catch {
      device = (proc.stderr || "").split("\n").find((l) => l.includes("device=")) || "unknown";
    }

    evidence.gpuLive = true;
    evidence.device = device;
    evidence.maxAbsError = err;
    evidence.passed = err <= GPU_NUMERIC_CONTRACT.maxAbsError;
    evidence.status = evidence.passed ? "partial" : "blocked-with-evidence";
    evidence.blockedWithEvidence = !evidence.passed;
    evidence.stdout = proc.stdout;
    writeFileSync(join(outDir, "gpu-evidence.json"), JSON.stringify(evidence, null, 2));
    void repoRoot;
    return evidence;
  } catch (e) {
    evidence.status = "declared";
    evidence.blockedWithEvidence = true;
    evidence.reason = { step: "exception", message: e.message };
    try {
      writeFileSync(join(outDir, "gpu-evidence.json"), JSON.stringify(evidence, null, 2));
    } catch {
      /* ignore */
    }
    return evidence;
  }
}
