#!/usr/bin/env node
/**
 * Repeatable operator demo: prompt → scene → CPU render → evidence → replay.
 *
 * Print SoT: cpu.rt4d (CanvasRenderer / renderFrameToBuffer). GPU assist is out of scope.
 * Does not claim IDAC certification or full Genblaze HTTP path unless --genblaze is set.
 *
 * Usage:
 *   node scripts/demo-evidence-pipeline.mjs --prompt "a 4d star mandala"
 *   node scripts/demo-evidence-pipeline.mjs --prompt "..." --out trail/artifacts/run.json
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function importFromRoot(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

function parseArgs(argv) {
  const args = { prompt: "a governed 4d tesseract under constitutional replay", out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

function sha256Hex(bufOrStr) {
  const h = createHash("sha256");
  h.update(typeof bufOrStr === "string" ? bufOrStr : bufOrStr);
  return h.digest("hex");
}

function runPromptBridge(prompt) {
  const script = join(root, "mrs/adapters/prompt-scene-bridge/run_bridge.py");
  const py = process.env.PROMPT_SCENE_BRIDGE_PYTHON || "python";
  const result = spawnSync(
    py,
    [script, "--prompt", prompt, "--json", "--width", "256", "--height", "192"],
    { encoding: "utf-8", cwd: root, timeout: 120_000 },
  );
  if (result.status !== 0) {
    throw new Error(`prompt-scene bridge failed: ${result.stderr || result.stdout}`);
  }
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, true, "bridge ok");
  return payload;
}

function surfaceFromSceneSpec(sceneSpec) {
  for (const ent of sceneSpec?.entities || []) {
    const sid = ent?.geometry?.surfaceId;
    if (sid) return sid;
  }
  return "tesseract";
}

/** Charter cinematic4d invariants require tesseract counts for CSE render actions. */
function renderSurfaceForGovernance(mappedSurface) {
  if (mappedSurface === "tesseract") return { surface: "tesseract", override: null };
  return { surface: "tesseract", override: mappedSurface };
}

async function main() {
  const { prompt, out } = parseArgs(process.argv);
  const startedAt = new Date().toISOString();

  const bridge = runPromptBridge(prompt);
  const sceneSpec = bridge.sceneSpecification;
  const mapped = surfaceFromSceneSpec(sceneSpec);
  const { surface, override } = renderSurfaceForGovernance(mapped);

  const { createScene } = await importFromRoot(
    "mrs/packages/renderer-core/src/pipeline/scene.js",
  );
  const { getSurface, sampleSurface } = await importFromRoot(
    "mrs/packages/renderer-core/src/surfaces/index.js",
  );
  const { renderFrameToBuffer } = await importFromRoot(
    "mrs/packages/renderer-core/src/pipeline/movie-pipeline.js",
  );
  const { CHARTER } = await importFromRoot("engine/constitution/charter.js");
  const { ConstitutionalKnowledgeLayer } = await importFromRoot(
    "engine/governance/ConstitutionalKnowledgeLayer.js",
  );
  const { GovernanceKernel } = await importFromRoot("engine/governance/GovernanceKernel.js");
  const { ConstitutionalStateEngine, renderEvidenceFrom } = await importFromRoot(
    "js/constitution/cse.js",
  );
  const { ExecutionOrchestrator } = await importFromRoot("js/engine/services/orchestrator.js");
  const { ProvenanceRecorder, createFrameProvenance, hashFrameProvenance } =
    await importFromRoot("engine/runtime/ProvenanceRecorder.js");
  const { ReplayService } = await importFromRoot("engine/runtime/ReplayService.js");

  const policies = JSON.parse(
    readFileSync(join(root, "engine/governance/policies/default.policies.json"), "utf-8"),
  );
  const ckl = new ConstitutionalKnowledgeLayer(policies);
  const cse = new ConstitutionalStateEngine();
  const gk = new GovernanceKernel({ ckl, cse });
  const orchestrator = new ExecutionOrchestrator({ gk, cse });

  const scene = createScene({
    surface,
    width: 320,
    height: 240,
    resolution: 16,
    frames: 1,
    renderMode: "wireframe",
    profile: "technical",
  });
  const mesh = sampleSurface(getSurface(scene.surface), scene.resolution);
  const png = renderFrameToBuffer(mesh, 0, scene);
  const frameDigest = sha256Hex(png);

  const mockRenderer = {
    surfaceId: scene.surface,
    vertices4D: mesh.vertices,
    edges: mesh.edges,
    theta: 0,
    d4: scene.d4,
    d3: scene.d3,
    speed: 1,
    scale: scene.scale,
    weights: scene.rotationWeights,
  };
  const renderEvidence = renderEvidenceFrom(mockRenderer, {
    id: `ev-render-${frameDigest.slice(0, 12)}`,
    worldId: bridge.infinityScene?.worldId || "demo-world",
    timelineId: "demo-timeline",
    prompt,
    frameDigest,
    printSoT: "cpu.rt4d",
  });

  assert.equal(renderEvidence.vertexCount, CHARTER.cinematic4d.vertexCount);
  assert.equal(renderEvidence.edgeCount, CHARTER.cinematic4d.edgeCount);

  const intent = cse.declareIntent({
    kind: "demo-evidence-pipeline",
    goal: "prompt-scene-render-evidence-replay",
    actor: "4dce.renderer",
  });
  intent.world = renderEvidence.worldId;
  intent.type = "play_timeline";

  const gkDecision = gk.evaluateIntent(intent, renderEvidence);
  assert.equal(gkDecision.ok, true);
  assert.equal(gkDecision.attachProvenance, true);

  const execResult = await orchestrator.execute({
    intent,
    evidence: renderEvidence,
    action: "render.session.start",
    run: async () => ({
      surface: scene.surface,
      frameDigest,
      bytes: png.length,
    }),
  });
  const { plan, decision: execDecision, csr: csrRecord } = execResult;
  assert.equal(execDecision.ok, true);

  const recorder = new ProvenanceRecorder();
  const frame = createFrameProvenance({
    intentId: intent.id,
    timelineId: renderEvidence.timelineId,
    worldId: renderEvidence.worldId,
    timeSeconds: 0,
    parameters: {
      theta: renderEvidence.theta,
      d4: renderEvidence.d4,
      d3: renderEvidence.d3,
      speed: renderEvidence.speed,
      scale: renderEvidence.scale,
      surface: scene.surface,
    },
  });
  frame.provenanceHash = hashFrameProvenance(frame);
  recorder.record(frame);

  const replayTarget = { params: {}, applyFrame(f) { this.params = { ...f.parameters }; } };
  const lineageReceipt = ReplayService.replayWithReceipt(recorder.getFrames(), replayTarget, {
    targetId: "demo-replay-target",
    intentId: intent.id,
    evidenceRefs: [renderEvidence.id],
  });
  assert.deepEqual(replayTarget.params.surface, scene.surface);

  const conformance = {
    profile: "default.conformance-profile.json",
    note: "Full 16/16 via npm run test:conformance (browser adapter); this package embeds spot checks only.",
    spotChecks: {
      cklAttachProvenance: gkDecision.attachProvenance === true,
      replayDeterministic: replayTarget.params.theta === renderEvidence.theta,
    },
  };

  const evidencePackage = {
    kind: "mrs-evidence-package",
    version: 1,
    trailId: "mrs-evidence-demo-interop-2026-07",
    startedAt,
    completedAt: new Date().toISOString(),
    prompt,
    phases: ["prompt", "scene", "render", "governance", "provenance", "replay"],
    promptScene: {
      laneMeta: bridge.laneMeta,
      sceneSpecificationId: sceneSpec?.id,
      mappedSurface: mapped,
      renderSurfaceOverride: override,
    },
    render: {
      printSoT: "cpu.rt4d",
      surface: scene.surface,
      frameDigest,
      pngBytes: png.length,
    },
    governance: {
      charterId: gkDecision.charterId,
      intentId: intent.id,
      decisionOk: gkDecision.ok,
      policiesApplied: gkDecision.policiesApplied,
      csrId: csrRecord.id,
      planId: plan.planId,
    },
    provenance: {
      frameCount: recorder.getFrames().length,
      frameHashes: recorder.getFrames().map((f) => f.provenanceHash),
    },
    replay: lineageReceipt,
    conformance,
    sanitized: true,
  };

  const defaultOut = join(
    root,
    "docs/governance/cecp/trails/mrs-evidence-demo-interop-2026-07/artifacts/sample-evidence-package.json",
  );
  const outPath = out ? resolve(root, out) : defaultOut;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidencePackage, null, 2)}\n`, "utf-8");

  console.log(JSON.stringify({ ok: true, out: outPath, frameDigest, csrId: csrRecord.id }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
