import { MetricTensor } from "../src/render/rt4d/constitutional/arena/MetricTensor.js";
import { FourVector } from "../src/render/rt4d/constitutional/tensor/index.js";
import { FourVelocity } from "../src/render/rt4d/constitutional/kinematics/index.js";
import { Camera4D, ProjectionPolicy } from "../src/render/rt4d/constitutional/projection/index.js";
import { createInitializedRuntime } from "../src/render/rt4d/constitutional/runtime/index.js";

const DTAU = 0.03;
const FRAMES = 300;

function envToWorld(p3) {
  const n = Math.hypot(p3.x, p3.y, p3.z) || 1;
  return { x: -p3.z / n, y: p3.y / n, z: -p3.x / n };
}
function dawnFactor(sunDirY) {
  return Math.max(0, Math.min(1, (sunDirY + 0.25) / 0.85));
}

async function probe(s1, s2, s3, ct0) {
  const metric = MetricTensor.minkowski();
  const u_ct = Math.sqrt(1 + s1 * s1 + s2 * s2 + s3 * s3);
  const runtime = createInitializedRuntime({
    metricSignature: [-1, 1, 1, 1],
    c: 1,
    dtau: DTAU,
    d4: 4,
    camera: Camera4D.atOrigin(),
    projectionPolicy: ProjectionPolicy.perspective(4),
    position: new FourVector(0, ct0, 0, 0, metric),
    velocity: new FourVelocity(new FourVector(u_ct, s1, s2, s3, metric), metric).normalize(1),
    mass: 1.0,
    governance: { strictMode: false, requireReplay: false, requireAudit: false },
  });
  let step0 = await runtime.step();
  let lastStep = step0;
  for (let i = 1; i < FRAMES; i++) lastStep = await runtime.step();
  const rec0 = step0.provenance.projection.errorBound;
  const recLast = lastStep.provenance.projection.errorBound;

  const p30 = { x: step0.projection.x, y: step0.projection.y, z: step0.projection.z };
  const p3L = { x: lastStep.projection.x, y: lastStep.projection.y, z: lastStep.projection.z };
  const dir0 = envToWorld(p30);
  const dirL = envToWorld(p3L);
  const wLast = lastStep.provenance.positionCert.errorBound;
  const w = Math.abs(lastStep.provenance.projection.errorBound.roundtripResidual);
  console.log(
    `u=(${u_ct.toFixed(4)},${s1},${s2},${s3}) ct0=${ct0} | dir0=(${dir0.x.toFixed(3)},${dir0.y.toFixed(3)},${dir0.z.toFixed(3)}) d0=${dawnFactor(dir0.y).toFixed(3)}` +
    ` | dirL=(${dirL.x.toFixed(3)},${dirL.y.toFixed(3)},${dirL.z.toFixed(3)}) dL=${dawnFactor(dirL.y).toFixed(3)}` +
    ` | finite0=${rec0.finite} finiteL=${recLast.finite} rtL=${w.toExponential(1)}`
  );
  return { dir0, dirL, d0: dawnFactor(dir0.y), dL: dawnFactor(dirL.y) };
}

async function probeContract() {
  const metric = MetricTensor.minkowski();
  const runtime = createInitializedRuntime({
    metricSignature: [-1, 1, 1, 1],
    c: 1,
    dtau: DTAU,
    d4: 4,
    camera: Camera4D.atOrigin(),
    projectionPolicy: ProjectionPolicy.perspective(4),
    position: new FourVector(0, 0, -0.3, 0.25, metric),
    velocity: new FourVelocity(new FourVector(Math.sqrt(1.1844), 0.32, 0.28, 0.06, metric), metric).normalize(1),
    mass: 1.0,
    governance: { strictMode: false, requireReplay: false, requireAudit: false },
  });
  let step0 = await runtime.step();
  let lastStep = step0;
  for (let i = 1; i < FRAMES; i++) lastStep = await runtime.step();
  const p30 = { x: step0.projection.x, y: step0.projection.y, z: step0.projection.z };
  const p3L = { x: lastStep.projection.x, y: lastStep.projection.y, z: lastStep.projection.z };
  const dir0 = envToWorld(p30);
  const dirL = envToWorld(p3L);
  const d0 = dawnFactor(dir0.y);
  const dL = dawnFactor(dirL.y);
  const eL = lastStep.provenance.projection.errorBound;
  console.log(
    `CONTRACT canonical pos=(0,0,-0.30,0.25) vel=(sqrt1.1844,0.32,0.28,0.06) | dir0=(${dir0.x.toFixed(3)},${dir0.y.toFixed(3)},${dir0.z.toFixed(3)}) d0=${d0.toFixed(3)}` +
    ` | dirL=(${dirL.x.toFixed(3)},${dirL.y.toFixed(3)},${dirL.z.toFixed(3)}) dL=${dL.toFixed(3)}` +
    ` | finite0=${step0.provenance.projection.errorBound.finite} finiteL=${eL.finite} rtL=${Math.abs(eL.roundtripResidual).toExponential(1)}`
  );
  const pass = dir0.y < 0 && dirL.y > 0.3 && d0 < 0.05 && dL > 0.9;
  console.log(pass ? "  >> PASS E4" : "  >> fail E4");
  return { dir0, dirL, d0, dL, pass };
}

async function scanAll(s1, s2, s3, ct0) {
  const metric = MetricTensor.minkowski();
  const u_ct = Math.sqrt(1 + s1 * s1 + s2 * s2 + s3 * s3);
  const runtime = createInitializedRuntime({
    metricSignature: [-1, 1, 1, 1],
    c: 1,
    dtau: DTAU,
    d4: 4,
    camera: Camera4D.atOrigin(),
    projectionPolicy: ProjectionPolicy.perspective(4),
    position: new FourVector(0, ct0, 0, 0, metric),
    velocity: new FourVelocity(new FourVector(u_ct, s1, s2, s3, metric), metric).normalize(1),
    mass: 1.0,
    governance: { strictMode: false, requireReplay: false, requireAudit: false },
  });
  let maxPosErr = 0, maxVelErr = 0, maxMomErr = 0, maxRt = 0;
  let allFinite = true, allInTol = true, minD = Infinity, maxD = 0;
  for (let i = 0; i < FRAMES; i++) {
    const s = await runtime.step();
    const p = s.provenance.projection.errorBound;
    maxPosErr = Math.max(maxPosErr, s.provenance.positionCert.errorBound.max ?? 0);
    maxVelErr = Math.max(maxVelErr, s.provenance.velocityCert.errorBound.max ?? 0);
    maxMomErr = Math.max(maxMomErr, s.provenance.momentumCert.errorBound.max ?? 0);
    maxRt = Math.max(maxRt, Math.abs(p.roundtripResidual));
    if (!p.finite || !p.withinTolerance) allFinite = allInTol = false;
    if (p.withinTolerance !== true) allInTol = false;
    const d = dawnFactor(envToWorld({ x: s.projection.x, y: s.projection.y, z: s.projection.z }).y);
    minD = Math.min(minD, d); maxD = Math.max(maxD, d);
  }
  const ok = allFinite && allInTol && maxPosErr < 1e-6 && maxVelErr < 1e-9 && maxMomErr < 1e-9 && maxRt < 1e-9;
  console.log(
    `scan s=(${s1},${s2},${s3}) ct0=${ct0} | maxPosErr=${maxPosErr.toExponential(2)} maxVelErr=${maxVelErr.toExponential(2)}` +
    ` maxMomErr=${maxMomErr.toExponential(2)} maxRt=${maxRt.toExponential(2)} finite=${allFinite} tol=${allInTol}` +
    ` dawnMin=${minD.toFixed(3)} dawnMax=${maxD.toFixed(3)} E1E2=${ok ? "PASS" : "FAIL"}`
  );
  return ok;
}

const candidates = [
  [1.1, 0.7, 0.05, -0.6],
  [1.2, 0.5, 0.05, -0.6],
  [1.3, 0.4, 0.05, -0.6],
  [1.25, 0.45, 0.05, -0.4],
  [1.35, 0.35, 0.03, -0.4],
  [1.5, 0.3, 0.03, -0.3],
  [1.4, 0.4, 0.03, -0.3],
  [1.45, 0.35, 0.03, -0.25],
];
for (const c of candidates) {
  const r = await probe(c[0], c[1], c[2], c[3]);
  const pass = r.dir0.y < 0 && r.dirL.y > 0.3 && r.d0 < 0.05 && r.dL > 0.9;
  console.log(pass ? "  >> PASS E4" : "  >> fail E4");
}
console.log("---");
await probeContract();
console.log("---");
await scanAll(1.35, 0.35, 0.03, -0.4);
await scanAll(1.3, 0.4, 0.05, -0.6);
