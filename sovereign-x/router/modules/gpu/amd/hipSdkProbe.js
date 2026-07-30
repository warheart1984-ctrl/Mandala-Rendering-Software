/**
 * HIP / ROCm SDK host probe for Sovereign-X AMD paths.
 *
 * Detects a Windows HIP SDK install (e.g. C:\\Program Files\\AMD\\ROCm\\7.1)
 * without claiming Tonga/R9 380 is a supported ROCm device family.
 *
 * STATUS: **partial** when hipcc/hipconfig found on disk; runtime device
 * support for legacy GCN remains host-dependent (often still blocked).
 *
 * Drive-G-1: do not tag enforced. beauty.hip may be **partial** when
 * hipcc hello compile is proven; device runtime on Tonga may remain blocked.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ADAPTER_ID = "sx.adapter.hip.sdk.probe";
export const CAPABILITY_HINT = "gpu.compute.amd.hip";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Common Windows install roots (user may finish installer mid-session). */
export const DEFAULT_ROCM_ROOT_CANDIDATES = [
  "C:\\Program Files\\AMD\\ROCm\\7.1",
  "C:\\Program Files\\AMD\\ROCm\\7.0",
  "C:\\Program Files\\AMD\\ROCm\\6.4",
  "C:\\Program Files\\AMD\\HIP",
  "C:\\Program Files\\HIP SDK",
];

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function resolveHipRootCandidates(env = process.env) {
  const out = [];
  const explicit = String(env.HIP_PATH || env.ROCM_PATH || "").trim();
  if (explicit) out.push(explicit.replace(/[\\/]+$/, ""));
  for (const c of DEFAULT_ROCM_ROOT_CANDIDATES) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * @param {string} root
 */
function probeRoot(root) {
  const bin = join(root, "bin");
  const hipccExe = join(bin, "hipcc.exe");
  const hipccBat = join(bin, "hipcc.bat");
  const hipconfigExe = join(bin, "hipconfig.exe");
  const hipRuntime = join(root, "include", "hip", "hip_runtime.h");
  const hipVersionFile = join(root, ".hipVersion");
  return {
    root,
    binDir: bin,
    hipcc: existsSync(hipccExe)
      ? hipccExe
      : existsSync(hipccBat)
        ? hipccBat
        : null,
    hipconfig: existsSync(hipconfigExe) ? hipconfigExe : null,
    hip_runtime_h: existsSync(hipRuntime) ? hipRuntime : null,
    hipVersionFile: existsSync(hipVersionFile) ? hipVersionFile : null,
    amdhipDll: existsSync(join(bin, "amdhip64_7.dll"))
      ? join(bin, "amdhip64_7.dll")
      : existsSync(join(bin, "amdhip64.dll"))
        ? join(bin, "amdhip64.dll")
        : null,
  };
}

/**
 * Run a tool with short timeout; never throws.
 * @param {string} exe
 * @param {string[]} args
 * @param {object} [opts]
 */
function runTool(exe, args, opts = {}) {
  try {
    const r = spawnSync(exe, args, {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 15_000,
      env: opts.env || process.env,
      windowsHide: true,
    });
    return {
      ok: r.status === 0,
      status: r.status,
      stdout: String(r.stdout || "").trim(),
      stderr: String(r.stderr || "").trim(),
      error: r.error ? String(r.error.message || r.error) : null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Probe host for HIP SDK / hipcc.
 *
 * @param {object} [opts]
 * @returns {object}
 */
export function probeHipSdk(opts = {}) {
  const env = opts.env || process.env;
  const candidates = opts.roots || resolveHipRootCandidates(env);
  /** @type {any} */
  const report = {
    adapterId: ADAPTER_ID,
    capabilityHint: CAPABILITY_HINT,
    capturedAt: new Date().toISOString(),
    statusTag: "absent",
    surface: "ROCm/HIP SDK",
    hostHint: "Windows AMD — re-run after HIP SDK installer finishes",
    env: {
      HIP_PATH: env.HIP_PATH || null,
      ROCM_PATH: env.ROCM_PATH || null,
      HIP_PLATFORM: env.HIP_PLATFORM || null,
      HIP_COMPILER: env.HIP_COMPILER || null,
      pathHasHipBin: String(env.PATH || "")
        .toLowerCase()
        .includes("\\amd\\rocm\\"),
    },
    candidates,
    selectedRoot: null,
    tools: {
      hipcc: null,
      hipconfig: null,
      hipccVersion: null,
      hipconfigSummary: null,
    },
    headers: {
      hip_runtime_h: null,
    },
    deviceEnum: {
      amdgpuArch: null,
      note: "amdgpu-arch may fail on unsupported discrete GPUs (e.g. GCN Tonga / R9 380)",
    },
    blockers: [],
    notes: {
      upgradeFromAbsent:
        "When hipcc.exe exists under Program Files\\AMD\\ROCm\\<ver>, tag SDK install **partial** — not enforced runtime beauty.",
      pathQuoting:
        "hipconfig on Windows may break on spaces in 'C:\\Program Files\\...' unless HIP_PATH is set and tools invoked via absolute quoted paths.",
      reProbeCommand:
        "node sovereign-x/cli/sx-hip-sdk-probe.mjs",
      beautyWiring:
        "legacyEfficientBeauty attaches beauty.hip = probe + resolveHipBeautyKernelStatus; advances to partial when hip-hello-compile-run-proof.json shows compile.ok (device runtime may remain blocked).",
    },
    vendorHeadersPin:
      "vendor/HIP (gitignored clone) remains a source/headers pin — distinct from Program Files SDK.",
  };

  let selected = null;
  for (const root of candidates) {
    if (!existsSync(root)) continue;
    const p = probeRoot(root);
    if (p.hipcc || p.hipconfig || p.hip_runtime_h) {
      selected = p;
      break;
    }
  }

  if (!selected) {
    report.statusTag = "absent";
    report.blockers.push({
      code: "HIP_SDK_NOT_FOUND",
      message:
        "No HIP/ROCm SDK root with hipcc/hipconfig/hip_runtime.h — finish AMD HIP SDK install, then re-run sx-hip-sdk-probe.mjs",
    });
    return report;
  }

  report.selectedRoot = selected.root;
  report.headers.hip_runtime_h = selected.hip_runtime_h;
  report.tools.hipcc = selected.hipcc;
  report.tools.hipconfig = selected.hipconfig;

  const toolEnv = {
    ...env,
    HIP_PATH: selected.root,
    ROCM_PATH: selected.root,
    PATH: `${selected.binDir};${env.PATH || ""}`,
  };

  if (selected.hipcc) {
    const ver = runTool(selected.hipcc, ["--version"], {
      env: toolEnv,
      timeoutMs: opts.timeoutMs ?? 20_000,
    });
    report.tools.hipccVersion = {
      ok: ver.ok,
      stdout: ver.stdout.slice(0, 800),
      stderr: ver.stderr.slice(0, 400),
      error: ver.error,
    };
  }

  if (selected.hipconfig) {
    const cfg = runTool(selected.hipconfig, [], {
      env: toolEnv,
      timeoutMs: opts.timeoutMs ?? 20_000,
    });
    report.tools.hipconfigSummary = {
      ok: cfg.ok || !!cfg.stdout,
      stdout: cfg.stdout.slice(0, 1200),
      stderr: cfg.stderr.slice(0, 400),
      error: cfg.error,
    };
  }

  const archExe = join(selected.binDir, "amdgpu-arch.exe");
  if (existsSync(archExe)) {
    const arch = runTool(archExe, [], {
      env: toolEnv,
      timeoutMs: opts.timeoutMs ?? 15_000,
    });
    report.deviceEnum.amdgpuArch = {
      ok: arch.ok,
      stdout: arch.stdout.slice(0, 400),
      stderr: arch.stderr.slice(0, 400),
      error: arch.error,
    };
    if (!arch.ok) {
      report.blockers.push({
        code: "HIP_DEVICE_ENUM_FAILED",
        message:
          arch.stderr ||
          arch.error ||
          "amdgpu-arch failed — SDK present but device not enumerable (legacy GCN may be unsupported)",
      });
    }
  }

  const hipccWorks = !!report.tools.hipccVersion?.ok;
  if (hipccWorks) {
    // SDK + compiler visible → partial (not enforced; device may still fail)
    report.statusTag = "partial";
  } else if (selected.hipcc || selected.hip_runtime_h) {
    report.statusTag = "partial";
    report.blockers.push({
      code: "HIPCC_VERSION_PROBE_WEAK",
      message: "hipcc found on disk but --version did not succeed cleanly",
    });
  }

  if (!env.HIP_PATH && !env.ROCM_PATH) {
    report.blockers.push({
      code: "HIP_ENV_UNSET",
      message: `Set HIP_PATH (and optionally ROCM_PATH) to ${selected.root} and add ${selected.binDir} to PATH for shells/IDEs`,
    });
  }

  return report;
}

/**
 * Write probe JSON under proofs/legacy-efficient/.
 * @param {string} [outPath]
 * @param {object} [opts]
 */
export function writeHipSdkProbeReport(outPath, opts = {}) {
  const report = probeHipSdk(opts);
  const defaultPath = resolve(
    __dirname,
    "../../../../../docs/4d-engine/proofs/legacy-efficient/hip-sdk-detection-report.json",
  );
  const path = resolve(outPath || defaultPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");

  // Keep a sibling pointer so older "absence" consumers can see the upgrade.
  const absenceAlias = join(dirname(path), "hip-rocm-absence-report.json");
  const alias = {
    ...report,
    supersededNote:
      report.statusTag === "absent"
        ? "HIP SDK still absent on this probe"
        : "Superseded naming: SDK detected — see hip-sdk-detection-report.json; statusTag is no longer absent",
    previousFilename: "hip-rocm-absence-report.json",
  };
  writeFileSync(absenceAlias, JSON.stringify(alias, null, 2), "utf8");

  return { path, report, exists: existsSync(path) };
}

/**
 * Default path for hipcc hello compile+run proof (evidence for beauty.hip partial).
 */
export function defaultHipHelloProofPath() {
  return resolve(
    __dirname,
    "../../../../../docs/4d-engine/proofs/legacy-efficient/hip-hello-compile-run-proof.json",
  );
}

/**
 * Read hello-HIP compile proof if present. Compile ok → beauty.hip may be **partial**;
 * device runtime on Tonga may still be **blocked** inside the proof.
 * @param {string} [proofPath]
 */
export function readHipHelloCompileProof(proofPath) {
  const path = resolve(proofPath || defaultHipHelloProofPath());
  if (!existsSync(path)) {
    return {
      exists: false,
      compileOk: false,
      deviceRuntime: null,
      statusTag: null,
      proof: null,
      path,
    };
  }
  try {
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const proof = JSON.parse(text);
    const compileOk = !!proof?.compile?.ok;
    return {
      exists: true,
      compileOk,
      deviceRuntime: proof?.run?.deviceRuntime || null,
      statusTag: proof?.statusTag || (compileOk ? "partial" : "declared"),
      proof,
      path,
    };
  } catch {
    return {
      exists: true,
      compileOk: false,
      deviceRuntime: null,
      statusTag: null,
      proof: null,
      path,
    };
  }
}

/**
 * Resolve beauty.hip kernel status from SDK probe + optional hello compile proof.
 * - absent: no SDK
 * - declared: SDK partial, no compile proof yet
 * - partial: hipcc hello compile proven (device runtime may still be blocked)
 *
 * @param {object | null} [probe]
 * @param {object} [opts]
 */
export function resolveHipBeautyKernelStatus(probe = null, opts = {}) {
  const p = probe || probeHipSdk(opts);
  if (p.statusTag === "absent") {
    return {
      kernelStatus: "absent",
      sketchStatus: "absent",
      helloProof: null,
      note: "HIP SDK absent — re-run: node sovereign-x/cli/sx-hip-sdk-probe.mjs",
    };
  }
  const hello = readHipHelloCompileProof(opts.helloProofPath);
  if (hello.compileOk) {
    return {
      kernelStatus: "partial",
      sketchStatus: "partial",
      helloProof: {
        path: hello.path,
        compileOk: true,
        deviceRuntime: hello.deviceRuntime,
        statusTag: hello.statusTag,
      },
      note:
        hello.deviceRuntime === "blocked"
          ? "HIP hello compile proven (partial); device runtime blocked on this GPU — fall through to OpenCL/Lemonade for stills"
          : "HIP hello compile proven (partial) — device runtime evidence present",
    };
  }
  return {
    kernelStatus: "declared",
    sketchStatus: "declared",
    helloProof: hello.exists
      ? {
          path: hello.path,
          compileOk: false,
          deviceRuntime: hello.deviceRuntime,
        }
      : null,
    note:
      "HIP SDK detected (partial) — beauty kernel compile not yet proven; fall through to OpenCL/Lemonade",
  };
}

/**
 * How legacy_efficient / beauty should call HIP once SDK is present.
 * Status advances declared → partial when hip-hello-compile-run-proof.json shows compile.ok.
 */
export function hipBeautyAssistSketch(probe = null, opts = {}) {
  const p = probe || probeHipSdk(opts);
  const resolved = resolveHipBeautyKernelStatus(p, opts);
  return {
    status: resolved.sketchStatus,
    kernelStatus: resolved.kernelStatus,
    helloProof: resolved.helloProof,
    when: "beautyProvider === 'hip' || (beautyProvider === 'auto' && hipSdk.partial)",
    steps: [
      "Attach beauty.hip = probeHipSdk() + resolveHipBeautyKernelStatus on legacyEfficientBeautyAsync",
      "Prove compile: hipcc scripts/legacy-efficient/hip_hello.hip --offload-arch=gfx803",
      "Optional richer stub: hipcc scripts/legacy-efficient/hip_beauty_stub.hip --offload-arch=gfx803",
      "Fall through to OpenCL / Lemonade if HIP device enum or kernel fails",
      "Never claim print SoT from HIP assist",
    ],
    envRequired: {
      HIP_PATH: p.selectedRoot,
      ROCM_PATH: p.selectedRoot,
      PATH_prefix: p.selectedRoot ? join(p.selectedRoot, "bin") : null,
    },
    honesty:
      "SDK + hipcc compile **partial** ≠ ROCm-supported GPU runtime. R9 380 / Tonga may still fail device enum.",
    note: resolved.note,
  };
}

export default {
  ADAPTER_ID,
  CAPABILITY_HINT,
  DEFAULT_ROCM_ROOT_CANDIDATES,
  resolveHipRootCandidates,
  probeHipSdk,
  writeHipSdkProbeReport,
  defaultHipHelloProofPath,
  readHipHelloCompileProof,
  resolveHipBeautyKernelStatus,
  hipBeautyAssistSketch,
};
