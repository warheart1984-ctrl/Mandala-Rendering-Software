import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGlb } from "./glb.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface BlenderRuntime {
  readonly command: string;
  readonly prefixArgs: readonly string[];
  readonly source: "environment" | "native" | "flatpak-user" | "windows-default";
}

export interface BlenderAnthroDemoOptions {
  readonly outputDir?: string;
  readonly rigPath?: string;
  readonly skinPath?: string;
  readonly blueprintPath?: string;
  readonly size?: number;
  readonly seed?: number;
  readonly runtime?: BlenderRuntime;
  readonly inheritOutput?: boolean;
}

export interface BlenderAnthroInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly outputDir: string;
  readonly rigPath: string;
  readonly skinPath: string;
  readonly blueprintPath: string;
  readonly runtimeSource: BlenderRuntime["source"];
}

export interface BlenderAnthroDemoResult {
  readonly reportPath: string;
  readonly previewPath: string;
  readonly glbPath: string;
  readonly blendPath: string;
  readonly report: Readonly<Record<string, unknown>>;
  readonly runtime: BlenderRuntime;
}

function executableWorks(command: string, args: readonly string[]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/** Locate Blender without preserving the old Windows-only hard-coded dependency. */
export function detectBlenderRuntime(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): BlenderRuntime {
  if (environment.BLENDER_PATH) {
    return { command: environment.BLENDER_PATH, prefixArgs: [], source: "environment" };
  }
  if (executableWorks("blender", ["--version"])) {
    return { command: "blender", prefixArgs: [], source: "native" };
  }
  if (platform === "linux" && executableWorks("flatpak", ["info", "--user", "org.blender.Blender"])) {
    return {
      command: "flatpak",
      prefixArgs: ["run", "--command=blender", "org.blender.Blender"],
      source: "flatpak-user",
    };
  }
  if (platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe",
      "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
    ];
    const candidate = candidates.find((path) => existsSync(path));
    if (candidate) return { command: candidate, prefixArgs: [], source: "windows-default" };
  }
  throw new Error("Blender was not found. Install Blender, its Flatpak, or set BLENDER_PATH.");
}

/** Pure invocation builder shared by the CLI and tests. */
export function buildBlenderAnthroInvocation(
  runtime: BlenderRuntime,
  options: Omit<BlenderAnthroDemoOptions, "runtime" | "inheritOutput"> = {},
): BlenderAnthroInvocation {
  const outputDir = resolve(options.outputDir ?? join(PACKAGE_ROOT, "fixtures", "blender-anthro-v1"));
  const rigPath = resolve(options.rigPath ?? join(PACKAGE_ROOT, "fixtures", "anthro", "anthro-character-fixture.rig.json"));
  const skinPath = resolve(options.skinPath ?? join(PACKAGE_ROOT, "fixtures", "anthro", "anthro-character-fixture.skin.json"));
  const blueprintPath = resolve(options.blueprintPath ?? join(PACKAGE_ROOT, "fixtures", "blueprints", "heroic-fox-v1.blueprint.json"));
  const scriptPath = join(PACKAGE_ROOT, "blender", "sovereign_anthro_demo.py");
  const size = options.size ?? 768;
  const seed = options.seed ?? 1990;
  if (!Number.isInteger(size) || size < 256 || size > 4096) throw new Error("Blender demo size must be an integer from 256 to 4096");
  if (!Number.isSafeInteger(seed)) throw new Error("Blender demo seed must be a safe integer");
  return {
    command: runtime.command,
    args: [
      ...runtime.prefixArgs,
      "--background", "--factory-startup", "--python", scriptPath, "--",
      "--output-dir", outputDir,
      "--rig", rigPath,
      "--skin", skinPath,
      "--blueprint", blueprintPath,
      "--size", String(size),
      "--seed", String(seed),
    ],
    outputDir,
    rigPath,
    skinPath,
    blueprintPath,
    runtimeSource: runtime.source,
  };
}

/** Run Blender, then require the result to pass the same strict GLB validator as Mandala. */
export function runBlenderAnthroDemo(options: BlenderAnthroDemoOptions = {}): BlenderAnthroDemoResult {
  const runtime = options.runtime ?? detectBlenderRuntime();
  const invocation = buildBlenderAnthroInvocation(runtime, options);
  if (!existsSync(invocation.rigPath)) throw new Error(`rig record not found: ${invocation.rigPath}`);
  if (!existsSync(invocation.skinPath)) throw new Error(`skin record not found: ${invocation.skinPath}`);
  if (!existsSync(invocation.blueprintPath)) throw new Error(`blueprint record not found: ${invocation.blueprintPath}`);
  mkdirSync(invocation.outputDir, { recursive: true });
  const run = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (options.inheritOutput) {
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
  }
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error(`Blender adapter failed (${run.status ?? "signal"})\n${run.stderr || run.stdout || ""}`);
  }
  // Blender can exit zero after a Python exception. The script emits this
  // marker only after export, render, hashes, and report writing all succeed.
  if (!`${run.stdout ?? ""}\n${run.stderr ?? ""}`.includes("MANDALA_BLENDER_ADAPTER_OK")) {
    throw new Error(`Blender adapter exited without its success seal\n${run.stderr || run.stdout || ""}`);
  }
  const reportPath = join(invocation.outputDir, "anthro-blender-adapter-report.json");
  const previewPath = join(invocation.outputDir, "anthro-blender-preview.png");
  const glbPath = join(invocation.outputDir, "anthro-blender-character.glb");
  const blendPath = join(invocation.outputDir, "anthro-blender-character.blend");
  for (const path of [reportPath, previewPath, glbPath, blendPath]) {
    if (!existsSync(path)) throw new Error(`Blender adapter did not create ${path}`);
  }
  const validation = validateGlb(readFileSync(glbPath), { profile: "anthro" });
  if (!validation.ok || !validation.inspection) {
    throw new Error(`Blender GLB failed Sovereign validation: ${validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
  const inspection = validation.inspection;
  const sealedReport = {
    ...report,
    constitutionalValidation: {
      status: "passed",
      validator: "@mrs/sovereign-sculptor",
      profile: "anthro",
      primitives: inspection.primitives.length,
      vertices: inspection.primitives.reduce((sum, primitive) => sum + primitive.vertexCount, 0),
      triangles: inspection.primitives.reduce((sum, primitive) => sum + primitive.indexCount / 3, 0),
      bones: inspection.boneIds.length,
      morphs: [...new Set(inspection.primitives.flatMap((primitive) => primitive.morphIds))],
      materials: inspection.materialIds,
      digests: inspection.digests,
    },
    runtime: { source: runtime.source, command: runtime.command, prefixArgs: runtime.prefixArgs },
  };
  writeFileSync(reportPath, `${JSON.stringify(sealedReport, null, 2)}\n`);
  return { reportPath, previewPath, glbPath, blendPath, report: sealedReport, runtime };
}
