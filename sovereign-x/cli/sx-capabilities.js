#!/usr/bin/env node
/**
 * Sovereign X Router capability inspector CLI (skeleton).
 * STATUS: **declared** / **skeleton** — lists registry; no live GPU probe.
 *
 * Usage:
 *   node sovereign-x/cli/sx-capabilities.js list
 *   node sovereign-x/cli/sx-capabilities.js inspect gpu.gen.nvidia.nim_flux
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireJson = createRequire(import.meta.url);
const registryPath = join(
  __dirname,
  "..",
  "router",
  "registry",
  "gpuSkillsRegistry.json",
);
const registry = requireJson(registryPath);

function printHelp() {
  console.log(
    "Usage: sx-capabilities <list|inspect|inspect-flux-image|inspect-nim|help> [capability]",
  );
  console.log("  list                      List registry capabilities (skeleton)");
  console.log("  inspect <capability>      Show skill path + meta");
  console.log("  inspect-flux-image        Show FLUX lookdev-from-image wiring");
  console.log("  inspect-nim               NIM capability charter summary");
  console.log("  inspect-nim.flux.stills   Per-capability NIM stills detail");
  console.log("  help                      Show this help");
  console.log("STATUS: declared/skeleton — no live GPU probe.");
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "list";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "list") {
    console.log("Sovereign X Router capabilities:");
    console.log("- cpu.rt4d.print (authoritative)");
    for (const cap of Object.keys(registry.skills ?? {})) {
      console.log(`- ${cap} (assist, skill: ${registry.skills[cap]})`);
    }
    return;
  }

  if (command === "inspect") {
    const cap = args[1];
    if (!cap) {
      console.error("Usage: sx-capabilities inspect <capability>");
      process.exit(1);
    }
    if (cap === "cpu.rt4d.print") {
      const meta = registry.capabilityMeta?.["cpu.rt4d.print"] ?? {};
      console.log("Capability: cpu.rt4d.print");
      console.log("Skill path: (none — PathTracer4D / Digital Printer SoT)");
      console.log(`Authority: ${meta.authority ?? "authoritative"}`);
      console.log(`capabilityClass: ${meta.capabilityClass ?? "print"}`);
      console.log(`vendor: ${meta.vendor ?? "cpu"}`);
      return;
    }
    const skill = registry.skills?.[cap];
    if (!skill) {
      console.error(`Capability not found: ${cap}`);
      process.exit(1);
    }
    const meta = registry.capabilityMeta?.[cap] ?? {};
    console.log(`Capability: ${cap}`);
    console.log(`Skill path: ${skill}`);
    console.log(`Authority: ${meta.authority ?? "assist"}`);
    console.log(`capabilityClass: ${meta.capabilityClass ?? "(n/a)"}`);
    console.log(`vendor: ${meta.vendor ?? "(n/a)"}`);
    if (meta.status) console.log(`status: ${meta.status}`);
    if (Array.isArray(meta.bans) && meta.bans.length) {
      console.log(`bans: ${meta.bans.join(", ")}`);
    }
    return;
  }

  if (command === "inspect-flux-image") {
    const cap = "gpu.gen.nvidia.nim_flux";
    const skill = registry.skills?.[cap];
    const meta = registry.capabilityMeta?.[cap] ?? {};
    console.log("Mode: lookdev-from-image");
    console.log(`Capability: ${cap}`);
    console.log(`Skill path: ${skill ?? "(missing)"}`);
    console.log(`Authority: ${meta.authority ?? "assist"}`);
    console.log("CLI: npm run sx:flux-image -- --image <path> [--dry-run]");
    console.log("Batch: npm run sx:flux-image-batch -- --dir <folder> [--dry-run]");
    console.log("Module: sovereign-x/skills/nvidia-gpu-assist/flux_generate.js");
    console.log("Handler: GpuAssistModule.handleFluxImageIngest");
    console.log("Engine: LookDevEngine.runFromImage");
    console.log("Ban: never print SoT (cpu.rt4d.print remains authoritative)");
    if (!skill) process.exit(1);
    return;
  }

  if (command === "inspect-nim") {
    console.log("NIM Capability Charter");
    console.log("----------------------");
    console.log("Domain: GPU Assist / NIM");
    console.log("Authority: assist-only (non-deterministic)");
    console.log("Docs: docs/genblaze/capabilities/nim-capability-charter.md");
    console.log("");
    console.log("Registered NIM / FLUX assist capabilities:");
    console.log(" - gpu.gen.nvidia.nim_flux     (stills, lookdev)");
    console.log(" - nim.flux.stills             (alias label — maps to nim_flux)");
    console.log(" - nim.flux.face_assist        (face creation assist)");
    console.log(" - nim.vision.scene_assist     (SceneSpec assist)");
    console.log("");
    console.log("Routing rules:");
    console.log(" - Never used as Digital Printer beauty SoT.");
    console.log(" - Never used with determinismRequired=true as GPU SoT.");
    console.log(" - Never routed into print evidence as authoritative.");
    console.log("");
    console.log("BYOK rules:");
    console.log(" - Keys are local-only (sessionStorage) by default.");
    console.log(" - Hosted BYOK requires GENBLAZE_ALLOW_BYOK=1.");
    console.log(" - No server-side key persistence or logging.");
    return;
  }

  if (command === "inspect-nim.flux.stills") {
    console.log("Capability: nim.flux.stills (→ gpu.gen.nvidia.nim_flux)");
    console.log("Vendor: multi (e.g., BFL FLUX via NVIDIA NIM)");
    console.log("Mode: assist-only, stills generation, lookdev.");
    console.log("Input: prompt, optional image, model override.");
    console.log("Output: assist-only images + SceneSpec hints.");
    console.log("Print: barred from print SoT and evidence chain as beauty.");
    console.log("BYOK: sessionStorage; see docs/genblaze/security/byok-security-charter.md");
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main();
