#!/usr/bin/env node

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256Canonical } from "./canonical.js";
import { createConstitutionalCharacterRecord } from "./constitutional.js";
import { InMemoryCharacterRigRegistry, type CharacterPoseFrame } from "./adapter.js";
import { exportSculptGlbBundle, inspectGlb, validateGlb, type CharacterGlbProfile } from "./glb.js";
import { createAnthroRig, createFoxQuadrupedRig, createHumanRig } from "./rigs.js";
import { assertValidSculptDocument, lockSculptTopology } from "./sculpt.js";
import { runBlenderAnthroDemo } from "./blender.js";
import type { CharacterRigSchema, SculptDocument, SkinLayer, Species } from "./types.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SPECIES: readonly Species[] = ["human", "fox", "anthro"];

function usage(): never {
  console.error(`Sovereign Sculptor 0.1.0

Usage:
  sovereign-sculptor fixture <human|fox|anthro|all> --out <directory>
  sovereign-sculptor inspect <character.glb>
  sovereign-sculptor verify <character.glb> [--profile human|fox|anthro]
  sovereign-sculptor lock <authoring.json> --out <locked.json>
  sovereign-sculptor studio [--port 1990]
  sovereign-sculptor demo [--port 1990]
  sovereign-sculptor blender-demo [--out <directory>] [--size 768] [--seed 1990]

Fixtures prove the deterministic pipeline; they are not production sculpts.`);
  process.exit(2);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function morphology(species: Species): SculptDocument["morphologyProfile"] {
  const animal = species !== "human";
  return {
    stature: 0.5,
    bodyMass: 0.5,
    limbLength: 0.5,
    torsoLength: 0.5,
    headScale: 0.5,
    muzzleLength: animal ? 0.7 : 0,
    earScale: animal ? 0.8 : 0.2,
    tailLength: animal ? 0.8 : 0,
    digitigradeBias: animal ? 0.8 : 0,
  };
}

function fixtureDocument(species: Species): SculptDocument {
  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id: `${species}-fixture-v1`,
    species,
    topologyState: "locked",
    topologyRevision: 0,
    identity: {
      id: `${species}-fixture-character`,
      displayName: `${species} non-production fixture`,
      gender: { identity: "creator-specified", attribution: "creator-authored" },
    },
    morphologyProfile: morphology(species),
    vertices: [
      { id: "vertex:0", position: [-0.5, 0, -0.5] },
      { id: "vertex:1", position: [0.5, 0, -0.5] },
      { id: "vertex:2", position: [0, 1, 0] },
      { id: "vertex:3", position: [0, 0, 0.5] },
    ],
    triangles: [
      { id: "triangle:0", vertexIndices: [0, 1, 2], regionId: "body" },
      { id: "triangle:1", vertexIndices: [0, 3, 1], regionId: "body" },
      { id: "triangle:2", vertexIndices: [1, 3, 2], regionId: "body" },
      { id: "triangle:3", vertexIndices: [2, 3, 0], regionId: "body" },
    ],
    regions: [{ id: "body", vertexIndices: [0, 1, 2, 3] }],
    masks: [],
    operationLog: [],
  };
}

function rigFor(species: Species): CharacterRigSchema {
  if (species === "human") return createHumanRig();
  if (species === "fox") return createFoxQuadrupedRig();
  return createAnthroRig();
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function skinFor(
  species: Species,
  document: SculptDocument,
  rig: CharacterRigSchema,
  topologyDigest: string,
  uvDigest: string,
  sourceDigest: string,
): SkinLayer {
  const texture = (channel: string, colorSpace: "srgb" | "linear") => ({
    assetRef: `asset://non-production/${species}/${channel}.png`,
    digest: sha256Canonical({ fixture: true, species, channel }),
    mimeType: "image/png" as const,
    colorSpace,
  });
  return {
    schemaVersion: "sovereign-skin-layer/1.0",
    id: `${species}-anime-whole-body-skin-v1`,
    version: "1.0.0",
    bodyCoverage: "whole-body",
    rigId: rig.id,
    sculptDocumentId: document.id,
    topologyDigest,
    uvDigest,
    materialRegions: [{ id: "whole-body", sculptRegionId: "body", materialId: "anime-cel-body" }],
    textureChannels: {
      baseColor: texture("base-color", "srgb"),
      celShade: texture("cel-shade", "srgb"),
      normalDetail: texture("normal-detail", "linear"),
      roughness: texture("roughness", "linear"),
      ...(species === "human" ? {} : { fur: texture("fur", "srgb"), marking: texture("marking", "srgb") }),
    },
    generationProvenance: {
      method: "governed-model",
      generatorId: "mandala-anime-surface-painter-fixture",
      generatorVersion: "1.0.0",
      authorityRef: "authority://fixture-operator",
      rightsRef: "rights://non-production-original-fixture",
      inputDigests: [sourceDigest],
    },
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
}

function poseFor(rig: CharacterRigSchema): CharacterPoseFrame {
  return {
    schemaVersion: "sovereign-pose-frame/1.0",
    frameId: `${rig.species}-dialogue-pose-frame-0001`,
    rigId: rig.id,
    rigVersion: rig.schemaVersion,
    frameIndex: 1,
    timeSeconds: 1 / 24,
    boneTransforms: [{
      boneId: "root",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    }],
    blendshapeWeights: [{ blendshapeId: "jawOpen", weight: 0.35 }],
    provenance: {
      intentId: "intent://end-to-end-workflow-demo",
      operatorId: "operator://fixture",
      sourcePoseId: "dialogue-viseme://demo-ah",
    },
  };
}

function writeFixture(species: Species, outputRoot: string): void {
  const document = fixtureDocument(species);
  const rig = rigFor(species);
  const bundle = exportSculptGlbBundle(document, rig);
  const skin = skinFor(
    species,
    document,
    rig,
    bundle.inspection.digests.topologySha256,
    bundle.inspection.digests.uvSha256,
    bundle.fixture.sourceSha256,
  );
  const record = createConstitutionalCharacterRecord({ document, rig, bundle, skinLayers: [skin] });
  const registry = new InMemoryCharacterRigRegistry();
  const binding = registry.addCharacterRig({ document, rig, bundle, constitutionalRecord: record, skinLayers: [skin] });
  const pose = poseFor(rig);
  const appliedPose = registry.applyCharacterPose(document.identity.id, pose);
  const outputDir = resolve(outputRoot, species);
  mkdirSync(outputDir, { recursive: true });
  const stem = `${species}-character-fixture`;
  writeFileSync(join(outputDir, `${stem}.glb`), bundle.glb);
  writeFileSync(join(outputDir, `${stem}.sculpt.json`), pretty(document));
  writeFileSync(join(outputDir, `${stem}.rig.json`), pretty(rig));
  writeFileSync(join(outputDir, `${stem}.skin.json`), pretty(skin));
  writeFileSync(join(outputDir, `${stem}.constitutional.json`), pretty(record));
  writeFileSync(join(outputDir, `${stem}.inspection.json`), pretty(bundle.inspection));
  writeFileSync(join(outputDir, `${stem}.binding.json`), pretty(binding));
  writeFileSync(join(outputDir, `${stem}.pose.json`), pretty(pose));
  writeFileSync(join(outputDir, `${stem}.pose-application.json`), pretty(appliedPose));
  writeFileSync(join(outputDir, `${stem}.workflow.json`), pretty({
    schemaVersion: "sovereign-sculptor-workflow-demo/1.0",
    status: "deterministic-fixture-not-production-character",
    species,
    stages: [
      { stage: "sculpt-locked", artifact: `${stem}.sculpt.json`, digest: bundle.fixture.documentSha256 },
      { stage: "rig-validated", artifact: `${stem}.rig.json`, digest: bundle.fixture.rigSha256 },
      { stage: "glb-exported-and-validated", artifact: `${stem}.glb`, digest: bundle.inspection.digests.glbSha256 },
      { stage: "whole-body-skin-bound", artifact: `${stem}.skin.json`, digest: record.skinLayerDigests[0] },
      { stage: "constitutional-record-sealed", artifact: `${stem}.constitutional.json`, digest: record.recordDigest },
      { stage: "engine3d-mandala-bound", artifact: `${stem}.binding.json`, digest: binding.bindingId.slice("binding:".length) },
      { stage: "pose-replayed", artifact: `${stem}.pose-application.json`, digest: appliedPose.replayDigest },
    ],
  }));
  writeFileSync(join(outputDir, `${stem}.digest`), `${record.recordDigest}\n`);
  console.log(`${species}: ${outputDir}`);
  console.log(`  GLB sha256 ${bundle.inspection.digests.glbSha256}`);
  console.log(`  record sha256 ${record.recordDigest}`);
}

function fixtureCommand(args: readonly string[]): void {
  const requested = args[0];
  const out = option(args, "--out");
  if (!requested || !out || (requested !== "all" && !SPECIES.includes(requested as Species))) usage();
  const selected = requested === "all" ? SPECIES : [requested as Species];
  for (const species of selected) writeFixture(species, out);
}

function inspectCommand(args: readonly string[]): void {
  if (!args[0]) usage();
  const result = inspectGlb(readFileSync(resolve(args[0])));
  console.log(pretty(result));
  if (!result.ok) process.exitCode = 1;
}

function verifyCommand(args: readonly string[]): void {
  if (!args[0]) usage();
  const profileValue = option(args, "--profile");
  if (profileValue && !SPECIES.includes(profileValue as Species)) usage();
  const result = validateGlb(readFileSync(resolve(args[0])), {
    ...(profileValue ? { profile: profileValue as CharacterGlbProfile } : {}),
  });
  console.log(pretty(result));
  if (!result.ok) process.exitCode = 1;
}

function lockCommand(args: readonly string[]): void {
  const input = args[0];
  const out = option(args, "--out");
  if (!input || !out) usage();
  const document = JSON.parse(readFileSync(resolve(input), "utf8")) as SculptDocument;
  assertValidSculptDocument(document);
  const locked = lockSculptTopology(document);
  writeFileSync(resolve(out), `${canonicalJson(locked)}\n`);
  console.log(`locked topology revision ${locked.topologyRevision}: ${resolve(out)}`);
}

function studioCommand(args: readonly string[], openDemo = false): void {
  const portText = option(args, "--port") ?? "1990";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) usage();
  const studioRoot = resolve(PACKAGE_ROOT, "studio");
  const mime: Readonly<Record<string, string>> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".glb": "model/gltf-binary",
  };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const fixtureRequest = pathname.startsWith("/fixtures/");
    const root = fixtureRequest ? resolve(PACKAGE_ROOT, "fixtures") : studioRoot;
    const relative = fixtureRequest
      ? decodeURIComponent(pathname.slice("/fixtures/".length))
      : pathname === "/" ? (openDemo ? "workflow.html" : "index.html") : decodeURIComponent(pathname.slice(1));
    const target = resolve(root, relative);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const data = readFileSync(target);
      response.writeHead(200, { "content-type": mime[extname(target)] ?? "application/octet-stream" });
      response.end(data);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Sovereign Sculptor studio: http://127.0.0.1:${port}`);
    console.log(`End-to-end workflow: http://127.0.0.1:${port}/workflow.html`);
  });
}

function blenderDemoCommand(args: readonly string[]): void {
  const size = Number(option(args, "--size") ?? "768");
  const seed = Number(option(args, "--seed") ?? "1990");
  const result = runBlenderAnthroDemo({
    ...(option(args, "--out") ? { outputDir: option(args, "--out") } : {}),
    size,
    seed,
    inheritOutput: true,
  });
  const validation = (result.report.constitutionalValidation ?? {}) as Record<string, unknown>;
  console.log(`Actual Blender preview: ${result.previewPath}`);
  console.log(`Governed GLB: ${result.glbPath}`);
  console.log(`Sovereign validation: ${validation.status ?? "unknown"}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "fixture") fixtureCommand(args);
else if (command === "inspect") inspectCommand(args);
else if (command === "verify") verifyCommand(args);
else if (command === "lock") lockCommand(args);
else if (command === "studio") studioCommand(args);
else if (command === "demo") studioCommand(args, true);
else if (command === "blender-demo") blenderDemoCommand(args);
else usage();
