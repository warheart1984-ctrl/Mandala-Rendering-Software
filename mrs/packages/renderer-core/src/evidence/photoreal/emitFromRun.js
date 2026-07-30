/**
 * Emit SPR + PEP + CEC from a governed-render / external-pbr run directory.
 * STATUS: **partial**
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emitSpr } from "./emitSpr.js";
import { emitPep } from "./emitPep.js";
import { emitCec } from "./emitCec.js";

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Resolve inputs from a governed-render outDir.
 * @param {string} outDir
 */
export function resolveRunInputs(outDir) {
  const root = resolve(outDir);
  const trail = readJson(join(root, "verification-trail.json"));
  const externalDir = join(root, "external-pbr");
  const exportMeta = readJson(join(externalDir, "external-pbr-export.json"));
  const provenancePath = join(externalDir, "glb-provenance.json");
  const provenance =
    exportMeta?.provenance || readJson(provenancePath) || null;
  const glbPath =
    trail?.artifact?.glbPath ||
    exportMeta?.glbPath ||
    join(externalDir, "scene.glb");
  const beautyPath =
    trail?.artifact?.photorealBeautyPath ||
    join(root, "beauty-cycles.png");
  const beautySha =
    trail?.artifact?.photorealBeautySha256 || null;
  const glbHash =
    trail?.artifact?.glbSha256 || exportMeta?.sha256 || null;

  let sceneSpec = null;
  const specPath =
    exportMeta?.assessment?.specPath ||
    process.env.PHOTOREAL_EXTERNAL_PBR_SPEC ||
    null;
  if (specPath && existsSync(specPath)) {
    sceneSpec = readJson(specPath);
  }

  const width =
    trail?.reproducibility?.canonicalInputs?.width ||
    trail?.artifact?.width ||
    64;
  const height =
    trail?.reproducibility?.canonicalInputs?.height ||
    trail?.artifact?.height ||
    64;
  const seed =
    trail?.reproducibility?.canonicalInputs?.seed ??
    provenance?.seed ??
    0;
  const samples = Number(
    process.env.PHOTOREAL_CYCLES_SAMPLES ||
      exportMeta?.cycles?.samples ||
      8,
  );

  return {
    root,
    trail,
    trailPath: join(root, "verification-trail.json"),
    exportMeta,
    provenance,
    provenancePath: existsSync(provenancePath) ? provenancePath : null,
    glbPath: existsSync(glbPath) ? glbPath : null,
    glbHash,
    beautyPath: existsSync(beautyPath) ? beautyPath : null,
    beautySha,
    sceneSpec,
    specPath,
    width,
    height,
    seed,
    samples,
    device: "cpu",
    pixelsProduced: !!trail?.beautyProvider?.pixelsProduced,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.outDir run directory
 * @param {boolean} [opts.write=true] write spr.json pep.json cec.json
 */
export function emitPhotorealEvidenceFromRun(opts = {}) {
  const outDir = opts.outDir;
  if (!outDir) throw new Error("outDir required");
  const inputs = resolveRunInputs(outDir);
  const governanceTrail =
    opts.governanceTrail ||
    (existsSync(inputs.trailPath) ? inputs.trailPath : null);

  const { spr, completeness: sprC } = emitSpr({
    glbPath: inputs.glbPath,
    glbHash: inputs.glbHash,
    provenance: inputs.provenance,
    provenancePath: inputs.provenancePath,
    exportMeta: inputs.exportMeta,
    sceneSpec: inputs.sceneSpec,
    specPath: inputs.specPath,
    governanceTrail,
  });

  const { pep, completeness: pepC } = emitPep({
    sceneSpec: inputs.sceneSpec,
    provenance: inputs.provenance || {},
    beautyPath: inputs.beautyPath,
    beautySha256: inputs.beautySha,
    glbHash: inputs.glbHash || spr.sceneIdentityBlock.glbHash,
    width: inputs.width,
    height: inputs.height,
    seed: inputs.seed,
    samples: inputs.samples,
    device: inputs.device,
    governanceTrail,
  });

  const pepPath = join(inputs.root, "pep.json");
  const sprPath = join(inputs.root, "spr.json");
  const cecPath = join(inputs.root, "cec.json");

  const { cec } = emitCec({
    pep,
    spr,
    pepCompleteness: pepC.score,
    sprCompleteness: sprC.score,
    governanceTrail,
    pepPath,
    sprPath,
  });

  const write = opts.write !== false;
  if (write) {
    mkdirSync(inputs.root, { recursive: true });
    writeFileSync(sprPath, JSON.stringify(spr, null, 2));
    writeFileSync(pepPath, JSON.stringify(pep, null, 2));
    writeFileSync(cecPath, JSON.stringify(cec, null, 2));
  }

  return {
    ok: true,
    status: "partial",
    outDir: inputs.root,
    paths: { spr: sprPath, pep: pepPath, cec: cecPath },
    spr,
    pep,
    cec,
    completeness: {
      spr: sprC.score,
      pep: pepC.score,
      photorealClaimLevel: pep.photorealClaimLevel,
      fullPhotorealEligible: cec.verification.fullPhotorealEligible,
      promotionEligibility: cec.verification.promotionEligibility,
    },
  };
}
