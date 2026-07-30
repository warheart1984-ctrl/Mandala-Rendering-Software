#!/usr/bin/env node
/**
 * CCC-ImageGen probe — demonstrate non-blocking GPU fallback.
 *
 * Usage:
 *   node sovereign-x/cli/sx-image-gen-provider-probe.mjs
 *   node sovereign-x/cli/sx-image-gen-provider-probe.mjs --force-gpu-down
 *   node sovereign-x/cli/sx-image-gen-provider-probe.mjs --try-generate
 *
 * Writes JSON under docs/4d-engine/proofs/ccc-image-gen/ when --write.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectImageGenProvider,
  attemptImageGenWithFallback,
} from "../router/modules/gpu/amd/ImageGenProvider.js";
import {
  generateStillViaImageGenProviders,
  reportLemonadeSdCapability,
} from "../router/modules/gpu/amd/lemonadeSdAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const forceGpuDown = args.has("--force-gpu-down");
const tryGenerate = args.has("--try-generate");
const write = args.has("--write");

const env = {
  ...process.env,
  ...(forceGpuDown
    ? { IMAGE_GEN_FORCE_GPU_DOWN: "1", IMAGE_GEN_DISABLE_LOCAL_GPU: "1" }
    : {}),
};

const selection = selectImageGenProvider(env, {
  localGpuAvailable: forceGpuDown ? false : undefined,
});

/** @type {any} */
let cascade = null;
/** @type {any} */
let report = null;

if (tryGenerate) {
  cascade = await generateStillViaImageGenProviders({
    env,
    localGpuAvailable: forceGpuDown ? false : undefined,
    assumeGpuDown: forceGpuDown,
    prompt: "probe still — CCC-ImageGen fallback check",
    retries: 1,
    maxModels: 1,
    timeoutMs: 8_000,
    requireLawfulWeights: false,
  });
} else {
  cascade = await attemptImageGenWithFallback({
    env,
    localGpuAvailable: forceGpuDown ? false : undefined,
    localGpuGenerateFn: async () => ({
      ok: false,
      code: "PROBE_SIMULATED_GPU_FAIL",
      message: "simulated sd-server / GPU failure for probe",
    }),
  });
}

report = await reportLemonadeSdCapability({
  env,
  verifyWeights: false,
  assumeGpuDown: forceGpuDown,
  localGpuAvailable: forceGpuDown ? false : undefined,
  tryGenerate: false,
});

const out = {
  contractId: "CCC-ImageGen",
  capability: "image.gen.provider",
  forceGpuDown,
  tryGenerate,
  selection: {
    selected: selection.selected,
    available: selection.available,
    invariantOk: selection.invariantOk,
    status: selection.status,
  },
  constitutionalLog: cascade.constitutionalLog || selection.log,
  fallbackUsed: !!(cascade.constitutionalLog || selection.log).fallbackUsed,
  blockedOnGpu: cascade.blockedOnGpu === true,
  imagesStatus: cascade.imagesStatus || report.imagesStatus,
  cascadeStatus: cascade.status,
  pixelsProduced: !!cascade.pixelsProduced,
  lemonadeProbeStatus: report.status,
  honesty:
    "fallbackUsed true when GPU down does not mean architecture blocked; pixels only if a provider produced them",
};

const text = JSON.stringify(out, null, 2);
console.log(text);

if (write) {
  const path = resolve(
    __dirname,
    "../../docs/4d-engine/proofs/ccc-image-gen/provider-probe.json",
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
  console.error(`wrote ${path}`);
}

if (forceGpuDown && !out.fallbackUsed) {
  console.error("PROBE FAIL: expected fallbackUsed true when --force-gpu-down");
  process.exitCode = 1;
}
if (out.blockedOnGpu) {
  console.error("PROBE FAIL: blockedOnGpu must be false under CCC-ImageGen");
  process.exitCode = 1;
}
