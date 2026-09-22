/**
 * Vulkan orthographic slice of a frozen certified φ.
 * Pixels come from the compute kernel. CPU projectFrozen is the numeric check.
 * Status: **partial** (one slice shader; not a path tracer).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const VULKAN_PROJECT_STATUS = "partial";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 20000,
  });
}

export function assembleProjectSpirv(outSpv) {
  const asm = join(__dirname, "spirv/project.spvasm");
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

export function compileProjectHost(binPath) {
  const src = join(__dirname, "vulkan_project.c");
  const cc = run("gcc", ["-O2", "-o", binPath, src, "-lvulkan"]);
  if (cc.status !== 0) {
    return { ok: false, step: "gcc", stderr: cc.stderr || cc.error?.message };
  }
  return { ok: true, bin: binPath };
}

function ensureTools(buildDir) {
  mkdirSync(buildDir, { recursive: true });
  const spv = join(buildDir, "project.spv");
  const bin = join(buildDir, "vulkan_project");
  const asm = assembleProjectSpirv(spv);
  if (!asm.ok) return { ok: false, reason: asm };
  const compiled = compileProjectHost(bin);
  if (!compiled.ok) return { ok: false, reason: compiled };
  return { ok: true, spv, bin };
}

/**
 * Draw one frozen slice. `snapshot` must be frozen (AAIS-certified copy).
 * Returns RGB bytes whose formula matches projectFrozen.
 */
export function projectSliceVulkan(snapshot, { width, height, buildDir, scratchDir } = {}) {
  if (!snapshot?.frozen) {
    throw new Error("Vulkan projection requires a frozen certified snapshot");
  }
  const w = width | 0;
  const h = height | 0;
  if (w < 2 || h < 2 || w % 2 || h % 2) {
    throw new Error("width and height must be even and at least 2");
  }
  const dir = buildDir || join(__dirname, "build");
  const scratch = scratchDir || dir;
  mkdirSync(scratch, { recursive: true });
  const tools = ensureTools(dir);
  if (!tools.ok) {
    return { ok: false, status: "declared", blockedWithEvidence: true, reason: tools.reason };
  }

  const phiPath = join(scratch, "phi.bin");
  const rgbPath = join(scratch, "rgb.bin");
  const scalar = snapshot.scalar;
  writeFileSync(phiPath, Buffer.from(scalar.buffer, scalar.byteOffset, scalar.byteLength));
  const albedo = snapshot.material?.albedo || [1, 1, 1];
  const proc = run(tools.bin, [
    "--shader", tools.spv,
    "--in", phiPath,
    "--out", rgbPath,
    "--nx", String(snapshot.shape.nx),
    "--ny", String(snapshot.shape.ny),
    "--nz", String(snapshot.shape.nz),
    "--width", String(w),
    "--height", String(h),
    "--z", String(snapshot.observer.z | 0),
    "--defx", String(snapshot.defect.x | 0),
    "--defy", String(snapshot.defect.y | 0),
    "--ar", String(albedo[0]),
    "--ag", String(albedo[1]),
    "--ab", String(albedo[2]),
  ], { timeout: 20000 });

  if (proc.status !== 0) {
    return {
      ok: false,
      status: "declared",
      blockedWithEvidence: true,
      reason: { step: "dispatch", status: proc.status, stderr: proc.stderr, stdout: proc.stdout },
    };
  }

  let device = null;
  let deviceType = null;
  try {
    const parsed = JSON.parse(String(proc.stdout).trim());
    device = parsed.device;
    deviceType = parsed.deviceType;
  } catch {
    device = (proc.stderr || "").split("\n").find((l) => l.includes("device=")) || "unknown";
  }

  const raw = readFileSync(rgbPath);
  const u32 = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = u32[i] & 255;
  return {
    ok: true,
    status: VULKAN_PROJECT_STATUS,
    device,
    deviceType,
    rgb,
    width: w,
    height: h,
  };
}
