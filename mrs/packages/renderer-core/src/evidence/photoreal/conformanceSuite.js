/**
 * RCS v1.0 — Renderer Conformance Suite (partial).
 * Adapts to existing CLIs (no --scene). Prefers real run dirs; stubs stay PARTIAL.
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { evaluateCertification } from "./evaluateCertification.js";
import { runPhotorealPromotionPipeline } from "./promotionPipeline.js";

/** Declared scene ids — only real out-dirs are promoted; others stay stub PARTIAL. */
export const RCS_DECLARED_SCENES = [
  "blender-10s-plate",
  "tesseract-stub",
  "hdr-room",
  "topology-stress",
  "gi-corridor",
];

/**
 * @param {object} opts
 * @param {string} opts.baseDir output dir for rcs-summary.json (+ optional scene folders)
 * @param {string} [opts.repoRoot]
 * @param {string[]} [opts.runDirs] real governed-run directories to certify
 * @param {string[]} [opts.sceneIds] override declared scene list
 * @param {boolean} [opts.promote=true] run Phase 3 pipeline on real dirs
 * @param {boolean} [opts.write=true]
 */
export function runConformanceSuite(opts = {}) {
  const baseDir = resolve(opts.baseDir || "");
  if (!baseDir) throw new Error("RCS requires opts.baseDir");
  const write = opts.write !== false;
  const promote = opts.promote !== false;
  if (write) mkdirSync(baseDir, { recursive: true });

  const runDirs = (opts.runDirs || [])
    .map((d) => resolve(d))
    .filter((d) => existsSync(d) && statSync(d).isDirectory());

  const sceneIds = opts.sceneIds || RCS_DECLARED_SCENES;
  const results = [];

  // Bind first real run to blender-10s-plate / second to tesseract-stub when present
  const bindings = bindScenesToRuns(sceneIds, runDirs);

  for (const sceneId of sceneIds) {
    const bound = bindings[sceneId];
    if (bound?.runDir) {
      let cert;
      if (promote) {
        const pipe = runPhotorealPromotionPipeline({
          outDir: bound.runDir,
          repoRoot: opts.repoRoot || null,
          trailDir: null,
          write,
        });
        cert = pipe.cpcs || evaluateCertification({
          runDir: bound.runDir,
          fpec: pipe.fpec,
          pep: pipe.pep,
          spr: pipe.spr,
          cel: pipe.cel,
          checklist: pipe.checklist,
          rdc: pipe.rdc,
          cat: pipe.cat,
          write,
        });
      } else {
        cert = evaluateCertification({ runDir: bound.runDir, write });
      }
      results.push({
        sceneId,
        runDir: bound.runDir,
        status: cert.certified ? "CERTIFIED" : "PARTIAL",
        certified: cert.certified === true,
        certificationLevel: cert.certificationLevel,
        cert,
      });
    } else {
      // Honest stub — not a fake certified scene
      const stub = {
        sceneId,
        runDir: null,
        status: "PARTIAL",
        certified: false,
        certificationLevel: "NONE",
        cert: {
          rendererId: "unknown",
          runId: sceneId,
          certified: false,
          certificationLevel: "NONE",
          eligibilityScore: 0,
          pepCompleteness: 0,
          sprCompleteness: 0,
          checklistPassCount: 0,
          dreVerified: false,
          auditVerdict: "STUB_NOT_WIRED",
          note: "RCS stub — multi-scene CLI/--scene not wired; no fake certification",
        },
      };
      results.push(stub);
    }
  }

  const certifiedScenes = results.filter((r) => r.certified).length;
  const total = results.length;
  const summary = {
    "@context": "https://sovereign-x.org/ciems/rcs-v1",
    artifact: "RendererConformanceSuiteSummary",
    version: "1.0",
    timestamp: new Date().toISOString(),
    status: "partial",
    rendererId: results.find((r) => r.cert?.rendererId)?.cert.rendererId || "unknown",
    totalScenes: total,
    certifiedScenes,
    conformanceLevel:
      certifiedScenes === total && total > 0 ? "FULL_CONFORMANCE" : "PARTIAL",
    scenes: results.map((r) => ({
      sceneId: r.sceneId,
      runDir: r.runDir,
      status: r.status,
      certified: r.certified,
      certificationLevel: r.certificationLevel,
      auditVerdict: r.cert?.auditVerdict ?? null,
      pepCompleteness: r.cert?.pepCompleteness ?? null,
      sprCompleteness: r.cert?.sprCompleteness ?? null,
    })),
    note:
      "RCS v1.0 partial — prefer real run dirs; stubs remain PARTIAL; no PHASE_4_FULL_PHOTOREAL without CPCS gates",
  };

  if (write) {
    writeFileSync(
      join(baseDir, "rcs-summary.json"),
      JSON.stringify(summary, null, 2),
    );
  }

  return summary;
}

/**
 * Discover run dirs under common parents if caller passes none.
 * @param {string} repoRoot
 */
export function discoverDefaultRunDirs(repoRoot) {
  const candidates = [
    join(repoRoot, "tmp/blender-10s-test/governed-render"),
    join(repoRoot, "tmp/governed-render"),
  ];
  const found = [];
  for (const parent of candidates) {
    if (!existsSync(parent)) continue;
    for (const name of readdirSync(parent)) {
      const p = join(parent, name);
      if (!statSync(p).isDirectory()) continue;
      if (
        existsSync(join(p, "verification-trail.json")) ||
        existsSync(join(p, "fpec.json")) ||
        existsSync(join(p, "pep.json"))
      ) {
        found.push(p);
      }
    }
  }
  return found;
}

function bindScenesToRuns(sceneIds, runDirs) {
  const map = {};
  const preferred = {
    "blender-10s-plate": (d) => basename(d) === "587f836fc789a003" || d.includes("blender-10s"),
    "tesseract-stub": (d) => !d.includes("blender-10s"),
  };
  const used = new Set();
  for (const sceneId of sceneIds) {
    const pred = preferred[sceneId];
    let pick = null;
    if (pred) {
      pick = runDirs.find((d) => !used.has(d) && pred(d));
    }
    if (!pick && (sceneId === "blender-10s-plate" || sceneId === "tesseract-stub")) {
      pick = runDirs.find((d) => !used.has(d));
    }
    if (pick) {
      used.add(pick);
      map[sceneId] = { runDir: pick };
    } else {
      map[sceneId] = { runDir: null };
    }
  }
  return map;
}
