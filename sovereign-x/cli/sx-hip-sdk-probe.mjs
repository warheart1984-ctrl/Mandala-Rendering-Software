#!/usr/bin/env node
/**
 * Re-run after AMD HIP SDK installer finishes (or mid-session).
 * Writes docs/4d-engine/proofs/legacy-efficient/hip-sdk-detection-report.json
 *
 * Usage: node sovereign-x/cli/sx-hip-sdk-probe.mjs
 */
import { writeHipSdkProbeReport, hipBeautyAssistSketch, resolveHipBeautyKernelStatus } from "../router/modules/gpu/amd/hipSdkProbe.js";

const { path, report } = writeHipSdkProbeReport();
const sketch = hipBeautyAssistSketch(report);
const resolved = resolveHipBeautyKernelStatus(report);
console.log(
  JSON.stringify(
    {
      ok: report.statusTag !== "absent",
      statusTag: report.statusTag,
      selectedRoot: report.selectedRoot,
      hipcc: report.tools?.hipcc || null,
      hipccVersionOk: !!report.tools?.hipccVersion?.ok,
      envHIP_PATH: report.env?.HIP_PATH,
      blockers: report.blockers,
      beautySketchStatus: sketch.status,
      beautyKernelStatus: resolved.kernelStatus,
      helloCompileOk: !!resolved.helloProof?.compileOk,
      deviceRuntime: resolved.helloProof?.deviceRuntime || null,
      reportPath: path,
      reProbe: "node sovereign-x/cli/sx-hip-sdk-probe.mjs",
    },
    null,
    2,
  ),
);
process.exit(report.statusTag === "absent" ? 1 : 0);
