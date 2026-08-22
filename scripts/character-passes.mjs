#!/usr/bin/env node
/**
 * character-passes.mjs — CertifiedCharacterState → three visual projections.
 *
 * One certified state drives three deterministic render passes:
 *   energy (field lines from ∇φ + bone tangents) → clay_rig (neutral gray +
 *   wire + bones) → beauty (materials + key/fill/rim). Each stage writes a
 *   provenance record to the Jarvis Continuity Ledger (jarvis-memoryboard),
 *   chained energy→clay→beauty via a deterministic stageHash plus a ledger
 *   parentStageId lineage.
 *
 * The CPU (this script + character/certified/*) owns the certified state and
 * every hash. character/renders/certified-passes.mjs is a "dumb executor".
 *
 * HONEST CAVEAT: the energy pass is an energy/field VISUALIZATION (glowing rig
 * curves + mesh-flow from ∇φ / bone tangents). It is NOT "4D physics": there is
 * no temporal derivative or motion history yet. See docs/character-certified-state-plan.md.
 *
 * Determinism (P4): pure functions of asset + seed; no Math.random / Date.now
 * in any hashed field. `--check-determinism` proves same seed → same hashes and
 * byte-identical PNGs.
 *
 * Usage:
 *   node scripts/character-passes.mjs --id fox --species anthro --seed 1337 \
 *        --out output/character-passes/fox --width 384 --frames 24
 *   node scripts/character-passes.mjs --id fox --species anthro --seed 1337 --check-determinism
 *   node scripts/character-passes.mjs ... --no-memoryboard
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { buildCharacterAsset } from "../character/models/character.mjs";
import { runCharacterSim } from "../character/sim/run-sim.mjs";
import {
  buildFieldState,
  buildFieldLines,
  cameraForFrame,
  renderEnergyPass,
  renderClayPass,
  renderBeautyPass,
  encodeFrame,
  ENERGY_MATERIAL,
  CLAY_MATERIAL,
  beautyMaterialSpec,
} from "../character/renders/certified-passes.mjs";
import { buildCertifiedState, stageProvenance, GENESIS_HASH } from "../character/certified/state.mjs";
import {
  createMemory,
  getMemory,
  listMemories,
  isHealthy,
  MEMORYBOARD_BASE,
} from "../character/certified/memoryboard-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const FFMPEG = process.env.MRS_FFMPEG || "/usr/bin/ffmpeg";
const CINEMATIC_GRADE = resolve(REPO_ROOT, "scripts/cinematic-grade.mjs");

const STAGES = ["energy", "clay_rig", "beauty"];

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) a[key] = true;
    else { a[key] = next; i++; }
  }
  return a;
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Deterministic hash of the certified field volume (φ) → worldStateHash. */
function computeWorldStateHash(field, seed) {
  const h = createHash("sha256");
  h.update("world-state:v1");
  h.update(Buffer.from(field.phi.buffer, field.phi.byteOffset, field.phi.byteLength));
  h.update(`|seed:${seed}|shape:${field.shape.nx}x${field.shape.ny}x${field.shape.nz}`);
  return h.digest("hex");
}

/**
 * Build the certified state + deterministic stage provenance chain for a
 * character. Pure — no I/O — so it can run twice for the determinism check.
 */
function buildCertifiedChain({ id, species, seed }) {
  const asset = buildCharacterAsset({ id, species });
  const field = buildFieldState(asset, seed);
  const worldStateHash = computeWorldStateHash(field, seed);
  const materials = {
    energy: ENERGY_MATERIAL,
    clay_rig: CLAY_MATERIAL,
    beauty: beautyMaterialSpec(asset),
  };
  const state = buildCertifiedState(asset, {
    seed,
    world: { shape: field.shape, worldStateHash },
    materials,
  });

  const root = stageProvenance(state, "root", GENESIS_HASH);
  const energy = stageProvenance(state, "energy", root.stageHash);
  const clay = stageProvenance(state, "clay_rig", energy.stageHash);
  const beauty = stageProvenance(state, "beauty", clay.stageHash);
  const chain = { root, energy, clay_rig: clay, beauty };
  return { asset, field, state, chain };
}

function memoryRecordFor(prov, sessionId, parentStageId, extra = {}) {
  const content = JSON.stringify({
    certified_stage: prov.stage,
    characterId: prov.characterId,
    species: prov.species,
    t: prov.t,
    seed: prov.seed,
    sourceMeshHash: prov.sourceMeshHash,
    rigHash: prov.rigHash,
    worldStateHash: prov.worldStateHash,
    materialHash: prov.materialHash,
    parentStageHash: prov.parentStageHash,
    stageHash: prov.stageHash,
    ...extra,
  });
  const evidence = [];
  if (parentStageId) {
    evidence.push({ kind: "parent-stage", ref: parentStageId, note: `parentStageHash=${prov.parentStageHash}` });
  }
  if (extra.artifact) {
    evidence.push({ kind: "artifact", ref: extra.artifact, note: `sha256=${extra.artifactSha256 || ""}` });
  }
  return {
    content,
    source_agent: "character-passes",
    session_id: sessionId,
    type: "architecture",
    confidence: 1.0,
    evidence,
    status: "verified",
    subject: `character-certified:${prov.characterId}:${prov.stage}`,
    tags: ["certified-state", "three-pass", prov.stage, `char:${prov.characterId}`, `seed:${prov.seed}`],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = typeof args.id === "string" ? args.id : "char";
  const species = args.species === "anthro" ? "anthro" : "human";
  const seed = args.seed != null && Number.isFinite(Number(args.seed)) ? Number(args.seed) >>> 0 : 1337;
  const width = args.width ? parseInt(args.width, 10) : 384;
  const height = args.height ? parseInt(args.height, 10) : width;
  const useMemoryboard = !args["no-memoryboard"];
  const sessionId = typeof args.session === "string" ? args.session : `char-passes-${id}-seed${seed}`;
  const mp4Frames = args.frames ? parseInt(args.frames, 10) : 0;

  // ---- Determinism check: build the chain twice + re-render, compare -------
  if (args["check-determinism"]) {
    const a = buildCertifiedChain({ id, species, seed });
    const b = buildCertifiedChain({ id, species, seed });
    const cam = cameraForFrame(0.5);
    const linesA = buildFieldLines(a.asset, a.field);
    const linesB = buildFieldLines(b.asset, b.field);
    const pngA = sha256Hex(encodeFrame(renderEnergyPass(a.asset, a.field, linesA, cam, width, height)));
    const pngB = sha256Hex(encodeFrame(renderEnergyPass(b.asset, b.field, linesB, cam, width, height)));
    const rows = [
      ["meshHash", a.state.meshHash, b.state.meshHash],
      ["rigHash", a.state.rigHash, b.state.rigHash],
      ["worldStateHash", a.state.world.worldStateHash, b.state.world.worldStateHash],
      ["root.stageHash", a.chain.root.stageHash, b.chain.root.stageHash],
      ["energy.stageHash", a.chain.energy.stageHash, b.chain.energy.stageHash],
      ["clay_rig.stageHash", a.chain.clay_rig.stageHash, b.chain.clay_rig.stageHash],
      ["beauty.stageHash", a.chain.beauty.stageHash, b.chain.beauty.stageHash],
      ["energy.png.sha256", pngA, pngB],
    ];
    let ok = true;
    for (const [name, x, y] of rows) {
      const same = x === y;
      ok = ok && same;
      console.log(`  ${same ? "OK  " : "FAIL"}  ${name}  ${x.slice(0, 16)}…`);
    }
    console.log(`\nDeterminism (seed=${seed}): ${ok ? "PASS — same seed → identical hashes + PNG" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }

  // ---- Build certified state + render the three hero stills ---------------
  const { asset, field, state, chain } = buildCertifiedChain({ id, species, seed });
  const sim = runCharacterSim(asset, { frames: 12 });
  const lines = buildFieldLines(asset, field);
  const outDir = resolve(REPO_ROOT, typeof args.out === "string" ? args.out : `output/character-passes/${id}`);
  mkdirSync(outDir, { recursive: true });

  const heroCam = cameraForFrame(0.5);
  const frames = {
    energy: renderEnergyPass(asset, field, lines, heroCam, width, height),
    clay_rig: renderClayPass(asset, heroCam, width, height),
    beauty: renderBeautyPass(asset, sim, heroCam, width, height),
  };
  const stills = {};
  for (const stage of STAGES) {
    const png = encodeFrame(frames[stage]);
    const path = join(outDir, `${stage}.png`);
    writeFileSync(path, png);
    stills[stage] = { path, sha256: sha256Hex(png), bytes: png.length };
  }

  console.log(`\nCertifiedCharacterState — ${id} (${species}) seed=${seed} t=${state.t}`);
  console.log(`  meshHash       ${state.meshHash}`);
  console.log(`  rigHash        ${state.rigHash}`);
  console.log(`  worldStateHash ${state.world.worldStateHash}`);
  console.log(`  topology       ${asset.mesh.vertexCount} verts / ${asset.mesh.faceCount} quads (status=${asset.status})`);
  console.log(`  field lines    ${lines.length} polylines from ∇φ + bone tangents (field-visualization, NOT 4D physics)`);
  console.log(`\n  Stills:`);
  for (const stage of STAGES) console.log(`    ${stage.padEnd(9)} ${stills[stage].path}  sha256=${stills[stage].sha256.slice(0, 16)}…`);

  // ---- Provenance hash-chain → Jarvis Continuity Ledger -------------------
  const ledgerBase = typeof args["base-url"] === "string" ? args["base-url"] : MEMORYBOARD_BASE;
  const healthy = useMemoryboard ? await isHealthy({ baseUrl: ledgerBase }) : false;
  const posted = {};
  console.log(`\n  Provenance hash-chain (deterministic stageHash chain):`);
  console.log(`    root       ${chain.root.stageHash}   parent=${GENESIS_HASH}`);
  for (const stage of STAGES) {
    console.log(`    ${stage.padEnd(9)}  ${chain[stage].stageHash}   parentStageHash=${chain[stage].parentStageHash.slice(0, 12)}…`);
  }

  if (useMemoryboard && !healthy) {
    console.log(`\n  [memoryboard] ${ledgerBase} not reachable — provenance NOT written.`);
    console.log(`  Start it:  cd jarvis-memoryboard && JARVIS_STORE_PATH=/tmp/jarvis-store.json uvicorn app.main:app --port 8001`);
  }

  if (healthy) {
    console.log(`\n  [memoryboard] ${ledgerBase} healthy — writing certified chain…`);
    const order = ["root", ...STAGES];
    let parentId = null;
    for (const stage of order) {
      const prov = chain[stage];
      const extra = stage === "root"
        ? { note: "certified-state root (mesh+rig+world)" }
        : { artifact: stills[stage].path, artifactSha256: stills[stage].sha256 };
      const rec = memoryRecordFor(prov, sessionId, parentId, extra);
      const created = await createMemory(rec, { baseUrl: ledgerBase });
      posted[stage] = created.id;
      console.log(`    ${stage.padEnd(9)} → ${created.id}  (parentStageId=${parentId ?? "—"})`);
      parentId = created.id;
    }

    // Prove lineage: GET each back and show parent chain from the ledger.
    console.log(`\n  [memoryboard] lineage read-back:`);
    for (const stage of order) {
      const { memory } = await getMemory(posted[stage], { baseUrl: ledgerBase });
      const parentEv = (memory.evidence || []).find((e) => e.kind === "parent-stage");
      const parsed = JSON.parse(memory.content);
      console.log(`    ${memory.id}  stage=${parsed.certified_stage.padEnd(9)} stageHash=${parsed.stageHash.slice(0, 12)}…  parent=${parentEv ? parentEv.ref : "GENESIS"}`);
    }
    const list = await listMemories({ query: `char:${id}`, limit: 50 }, { baseUrl: ledgerBase });
    console.log(`  [memoryboard] list query "char:${id}" → ${list.memories.length} records (this run + any prior).`);
  }

  // ---- Optional eased ping-pong mp4 per pass (cinematic-grade if present) --
  const mp4s = {};
  if (mp4Frames > 0) {
    console.log(`\n  Ping-pong mp4 (${mp4Frames} frames/pass, eased 0.5-0.5cos(2πp)):`);
    const gradeAvailable = existsSync(CINEMATIC_GRADE);
    for (const stage of STAGES) {
      const framesDir = join(outDir, `frames_${stage}`);
      rmSync(framesDir, { recursive: true, force: true });
      mkdirSync(framesDir, { recursive: true });
      for (let i = 0; i < mp4Frames; i++) {
        const p = mp4Frames === 1 ? 0.5 : i / (mp4Frames - 1);
        const cam = cameraForFrame(p);
        let frame;
        if (stage === "energy") frame = renderEnergyPass(asset, field, lines, cam, width, height);
        else if (stage === "clay_rig") frame = renderClayPass(asset, cam, width, height);
        else frame = renderBeautyPass(asset, sim, cam, width, height);
        writeFileSync(join(framesDir, `frame-${String(i).padStart(4, "0")}.png`), encodeFrame(frame));
      }
      const mp4 = join(outDir, `${stage}.mp4`);
      try {
        if (gradeAvailable) {
          execFileSync("node", [CINEMATIC_GRADE, "--frames", framesDir, "--out", mp4, "--fps", "12", "--scale", "0"],
            { stdio: "pipe", timeout: 60000 });
          mp4s[stage] = { path: mp4, filmPass: "cinematic-grade" };
        } else if (existsSync(FFMPEG)) {
          execFileSync(FFMPEG, ["-y", "-framerate", "12", "-i", join(framesDir, "frame-%04d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4], { stdio: "pipe", timeout: 60000 });
          mp4s[stage] = { path: mp4, filmPass: "none (cinematic-grade.mjs not on base main — pending merge)" };
        }
        rmSync(framesDir, { recursive: true, force: true });
        console.log(`    ${stage.padEnd(9)} ${mp4s[stage] ? mp4s[stage].path + "  [film-pass: " + mp4s[stage].filmPass + "]" : "encode skipped (no ffmpeg)"}`);
      } catch (err) {
        console.log(`    ${stage.padEnd(9)} mp4 encode failed: ${String(err).split("\n")[0]}`);
      }
    }
  }

  // ---- Machine-readable summary (gitignored output dir) -------------------
  const summary = {
    characterId: id, species, seed, t: state.t,
    certifiedState: {
      meshHash: state.meshHash, rigHash: state.rigHash, worldStateHash: state.world.worldStateHash,
    },
    chain: Object.fromEntries(Object.entries(chain).map(([k, v]) => [k, {
      stageHash: v.stageHash, parentStageHash: v.parentStageHash, materialHash: v.materialHash ?? null,
      ledgerId: posted[k] ?? null,
    }])),
    stills, mp4s,
    memoryboard: { base: ledgerBase, healthy, written: Object.keys(posted).length },
    honest: {
      energy_pass: "field-visualization (∇φ + bone tangents); NOT 4D physics",
      renderer: "deterministic CPU raster; RT4D has no triangle-mesh path yet",
      film_pass: mp4Frames > 0 ? (existsSync(CINEMATIC_GRADE) ? "cinematic-grade" : "pending cinematic-grade merge") : "n/a",
    },
  };
  writeFileSync(join(outDir, "certified-passes-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n  Summary → ${join(outDir, "certified-passes-summary.json")}`);
}

main().catch((err) => {
  console.error(`character-passes: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
