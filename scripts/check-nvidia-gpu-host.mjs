#!/usr/bin/env node
/**
 * Check-only NVIDIA GPU host probe (tao-setup-nvidia-gpu-host skill adapted).
 *
 * STATUS: **partial** / operator tooling — does NOT install drivers, does NOT
 * claim CUDA or NVENC print acceleration, does NOT make Digital Printer GPU
 * SoT. Exit 0 = useful report printed; exit 1 = nvidia-smi missing or failed.
 *
 * Usage:
 *   node scripts/check-nvidia-gpu-host.mjs
 *   node scripts/check-nvidia-gpu-host.mjs --json
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

const asJson = process.argv.includes("--json");

function run(cmd, args, timeoutMs = 8000) {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return { ok: true, stdout: String(out).trim() };
  } catch (err) {
    return {
      ok: false,
      error: err?.stderr ? String(err.stderr).trim() : String(err?.message || err),
    };
  }
}

function checkNvidiaSmi() {
  const q = run("nvidia-smi", [
    "--query-gpu=index,name,driver_version,memory.total",
    "--format=csv,noheader",
  ]);
    if (!q.ok) {
      const err = q.error || "";
      const perm =
        /permission|administrator|access is denied/i.test(err);
      return {
        statusTag: perm ? "partial" : "absent",
        ok: false,
        note: perm
          ? "nvidia-smi present but insufficient permissions — elevate or fix driver access; CUDA print SoT still absent"
          : "nvidia-smi failed — no NVIDIA driver tool on PATH (or GPU missing)",
        error: err,
      };
    }
  const gpus = q.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [index, name, driver, memory] = line.split(",").map((s) => s.trim());
      return { index, name, driver, memory };
    });
  return {
    statusTag: "partial",
    ok: true,
    note: "nvidia-smi reachable — host has an NVIDIA stack; printer CUDA SoT still absent",
    gpus,
  };
}

function checkNvenc() {
  const enc = run("ffmpeg", ["-hide_banner", "-encoders"]);
  if (!enc.ok) {
    return {
      statusTag: "absent",
      ok: false,
      note: "ffmpeg not on PATH — cannot probe NVENC encoders",
    };
  }
  const hasH264 = enc.stdout.includes("h264_nvenc");
  const hasHevc = enc.stdout.includes("hevc_nvenc");
  return {
    statusTag: hasH264 || hasHevc ? "partial" : "absent",
    ok: hasH264 || hasHevc,
    h264_nvenc: hasH264,
    hevc_nvenc: hasHevc,
    note:
      hasH264 || hasHevc
        ? "ffmpeg reports NVENC — video encode assist only; not printer beauty SoT"
        : "ffmpeg present but no nvenc encoders listed",
  };
}

function checkDockerNvidia() {
  const info = run("docker", ["info", "--format", "{{json .Runtimes}}"]);
  if (!info.ok) {
    return {
      statusTag: "skipped",
      ok: false,
      note: "docker not available — skip NVIDIA container runtime check",
    };
  }
  const hasNvidia =
    /nvidia/i.test(info.stdout) || info.stdout.toLowerCase().includes('"nvidia"');
  return {
    statusTag: hasNvidia ? "partial" : "absent",
    ok: hasNvidia,
    note: hasNvidia
      ? "docker reports an nvidia runtime — useful for NIM containers; not printer SoT"
      : "docker present but no nvidia runtime configured",
    runtimesSnippet: info.stdout.slice(0, 200),
  };
}

const report = {
  skill: "tao-setup-nvidia-gpu-host (check-only adapt)",
  mode: "check-only",
  statusTag: "partial",
  honesty:
    "This script never installs drivers/CUDA/toolkit. Linux install path lives in the " +
    "upstream skill (--install). Windows hosts use vendor GPU drivers manually. " +
    "CUDA print path remains absent in MRS.",
  nvidiaSmi: checkNvidiaSmi(),
  nvenc: checkNvenc(),
  dockerNvidia: checkDockerNvidia(),
  nextSteps: [
    "If nvidia-smi fails on Linux: follow tao-setup-nvidia-gpu-host --check-only, then ask before --install",
    "If NVENC missing: install NVIDIA driver + ffmpeg with nvenc, or use software encode fallback",
    "Do not cite this report as Digital Printer CUDA/HIP enforcement",
  ],
};

report.ok = Boolean(report.nvidiaSmi.ok);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("=== MRS NVIDIA GPU host check (check-only) ===");
  console.log(`nvidia-smi: ${report.nvidiaSmi.ok ? "OK" : "MISSING"} — ${report.nvidiaSmi.note}`);
  if (report.nvidiaSmi.gpus?.length) {
    for (const g of report.nvidiaSmi.gpus) {
      console.log(`  GPU ${g.index}: ${g.name} (driver ${g.driver}, ${g.memory})`);
    }
  }
  console.log(`NVENC: ${report.nvenc.ok ? "partial" : "absent"} — ${report.nvenc.note}`);
  console.log(`Docker NVIDIA runtime: ${report.dockerNvidia.statusTag} — ${report.dockerNvidia.note}`);
  console.log("");
  console.log(report.honesty);
  for (const step of report.nextSteps) console.log(`- ${step}`);
}

process.exit(report.ok ? 0 : 1);
