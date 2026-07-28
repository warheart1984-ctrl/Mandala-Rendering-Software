import fs from "node:fs";
import path from "node:path";

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

const radar = {
  charter: {},
  ckl: {},
  cse: {},
  policies: {},
  gpu: {},
  genblaze: {},
  hosts: {}
};

// Charter drift
const charter = read("engine/constitution/charter.js");
radar.charter.version = charter.includes(`version: "1.0.0"`) ? "aligned" : "drift";
radar.charter.organs = {
  governanceKernel: /governanceKernel:\s*\{[^}]*status:\s*"enforced"/.test(charter)
    ? "enforced"
    : "drift",
  ckl: /ckl:\s*\{[^}]*status:\s*"enforced"/.test(charter) ? "enforced" : "drift",
};

// CKL drift
const ckl = read("engine/governance/ConstitutionalKnowledgeLayer.js");
radar.ckl.precedentFilter = ckl.includes(`p.decision === false || p.decision === "deny"`) ? "aligned" : "drift";
radar.ckl.loadDefault = ckl.includes("import.meta.url") ? "aligned" : "drift";

// CSE drift
const cse = read("js/constitution/cse.js");
radar.cse.determinismRequired =
  cse.includes("determinismRequired") || cse.includes("deterministic") || cse.includes("replay")
    ? "aligned"
    : "missing";

// GPU drift
const envMapper = read("mrs/packages/renderer-core/src/gpu/EnvironmentMapper.js");
const meshRenderer = read("mrs/packages/renderer-core/src/gpu/GPUMeshRenderer.js");
radar.gpu.webgpu = {
  environmentMapper: envMapper.includes("GPUTextureUsage.COPY_DST") ? "aligned" : "drift",
  meshRenderer: meshRenderer.includes(`storeOp: "store"`) ? "aligned" : "drift"
};

// Genblaze drift (BYOK) — SoT is mrs/apps/genblaze-media (not legacy genblaze/)
const byokPy = read("mrs/apps/genblaze-media/app/byok.py");
const byokUi = read("mrs/apps/genblaze-media/app/static/index.html");
radar.genblaze.byok = {
  sessionOnly: byokUi.includes("sessionStorage") && !/localStorage\.setItem\(\s*BYOK_KEY/.test(byokUi),
  allowByokFlag: byokPy.includes("GENBLAZE_ALLOW_BYOK"),
  scopeStillsAssist: byokPy.includes("BYOK_SCOPE_STILLS") && byokPy.includes("BYOK_SCOPE_POLISH"),
  noPrinterSoT: byokPy.includes('"printSoT": False') || byokPy.includes('"printSoT": false'),
};

// Hosts drift (stubs)
radar.hosts.browser = "unknown";
radar.hosts.unity = "unknown";
radar.hosts.unreal = "unknown";

console.log(JSON.stringify(radar, null, 2));
