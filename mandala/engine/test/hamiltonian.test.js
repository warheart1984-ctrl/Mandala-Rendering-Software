import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DEFAULT_CONSTITUTION, INVARIANT_ID } from "../../proto/constitution.mjs";
import { createInitialCertifiedState, scalarMass } from "../../proto/certified-state.mjs";
import {
  commitProposal,
  createChamber,
  proposeIllegalMassInjection,
  stepCertified,
} from "../../proto/simulation-chamber.mjs";
import { commitEngineProposal } from "../aais/index.mjs";
import { step as physicsStep } from "../physics/index.mjs";
import {
  HAMILTONIAN_OPERATOR,
  hamiltonianEnergy,
  hamiltonianForceInto,
  relaxStep,
  maxAbsForce,
  siteU,
  siteDU,
  createLattice,
  simulateLattice,
  initRandomLattice,
  initWellLattice,
  scanCoupling,
  writeHamiltonianArtifacts,
  GOV_DIMS,
  GOV_N,
  DEFAULT_ALPHA,
  DEFAULT_W,
  DEFAULT_GOV_PARAMS,
  NIGHTLY_ETA,
  NIGHTLY_ALPHA,
  NIGHTLY_GOV_PARAMS,
  CPE_HGOV_CODE,
  siteUgov,
  siteDUgov,
  Wgov,
  uniqueGovEdges,
  hamiltonianGov,
  hamiltonianGovForceInto,
  finiteDiffGovForce,
  siteHgovLocal,
  rankGovFailures,
  nightlyGovernanceRelaxation,
  detectGovRegimeChange,
  toNightlyPythonPayload,
  relaxGovernance,
  evaluateCpeHgov,
  applyCarEvidence,
  createDemoGovernanceGraph,
  defaultSigma,
} from "../hamiltonian/index.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function finiteDiffLatticeForce(sigma, shape, params, eps = 1e-4) {
  const out = new Float64Array(sigma.length);
  const tmp = new Float32Array(sigma);
  for (let i = 0; i < sigma.length; i++) {
    const orig = tmp[i];
    tmp[i] = orig + eps;
    const hp = hamiltonianEnergy(tmp, shape, params);
    tmp[i] = orig - eps;
    const hm = hamiltonianEnergy(tmp, shape, params);
    tmp[i] = orig;
    out[i] = (hp - hm) / (2 * eps);
  }
  return out;
}

describe("lattice Hamiltonian (physics σ)", () => {
  it("energy H is non-increasing under small η", () => {
    const init = initRandomLattice({ nx: 16, ny: 16, seed: 11, scale: 0.7 });
    const params = { m2: 0.4, lambda: 0.05, J: 0.2, eta: 0.04 };
    const run = simulateLattice({
      sigma: init.sigma,
      shape: init.shape,
      params,
      maxSteps: 40,
    });
    for (let i = 1; i < run.series.length; i++) {
      assert.ok(
        run.series[i].H <= run.series[i - 1].H + 1e-4,
        `H increased at t=${i}: ${run.series[i - 1].H} → ${run.series[i].H}`,
      );
    }
    assert.ok(run.series[run.series.length - 1].H < run.series[0].H);
  });

  it("uniform σ is a ground state (∇H ≈ 0)", () => {
    const { shape, sigma } = createLattice({ nx: 8, ny: 8, nz: 1, fill: 0.25 });
    const force = new Float32Array(sigma.length);
    hamiltonianForceInto(sigma, force, shape, { m2: 0, lambda: 0, J: 1 });
    assert.ok(maxAbsForce(force) < 1e-6, `uniform coupling force ${maxAbsForce(force)}`);
    const forceU = new Float32Array(sigma.length);
    hamiltonianForceInto(sigma, forceU, shape, { m2: 0.5, lambda: 0, J: 1 });
    const expected = 0.5 * 0.25;
    for (let i = 0; i < forceU.length; i++) {
      assert.ok(Math.abs(forceU[i] - expected) < 1e-5);
    }
  });

  it("analytic ∂H/∂σ matches finite-diff within slack", () => {
    const init = initRandomLattice({ nx: 6, ny: 6, seed: 3, scale: 0.5 });
    const params = { m2: 0.3, lambda: 0.1, J: 0.4, eta: 0.05 };
    const analytic = new Float32Array(init.sigma.length);
    hamiltonianForceInto(init.sigma, analytic, init.shape, params);
    const fd = finiteDiffLatticeForce(init.sigma, init.shape, params, 1e-3);
    let max = 0;
    for (let i = 0; i < analytic.length; i++) {
      max = Math.max(max, Math.abs(analytic[i] - fd[i]));
    }
    assert.ok(max < 0.05, `max |analytic-fd|=${max}`);
  });

  it("SSB / coupling change produces nonzero order parameter (partial analogue)", () => {
    const disordered = simulateLattice({
      ...initRandomLattice({ nx: 16, ny: 16, seed: 7, scale: 0.9 }),
      params: { m2: 0.8, lambda: 0.25, J: 0.2, eta: 0.08 },
      maxSteps: 36,
    });
    const ordered = simulateLattice({
      ...initRandomLattice({ nx: 16, ny: 16, seed: 7, scale: 0.9 }),
      params: { m2: -0.8, lambda: 0.25, J: 0.35, eta: 0.08 },
      maxSteps: 36,
    });
    const mDis = disordered.series[disordered.series.length - 1].meanAbs;
    const mOrd = ordered.series[ordered.series.length - 1].meanAbs;
    assert.ok(mOrd > mDis + 0.05, `order analogue failed: SSB ${mOrd} vs disordered ${mDis}`);
    const well = initWellLattice({ nx: 16, ny: 16, amplitude: 1.4 });
    const wellRun = simulateLattice({
      sigma: well.sigma,
      shape: well.shape,
      params: { m2: 0.2, lambda: 0, J: 0.3, eta: 0.08 },
      maxSteps: 20,
    });
    assert.ok(wellRun.series[0].meanAbs > 0.05);
    const scan = scanCoupling({ nx: 12, ny: 12, seed: 7, maxSteps: 24 });
    assert.equal(scan.status, "partial");
    const hi = scan.points.find((p) => p.value > 0);
    const lo = scan.points.find((p) => p.value < 0);
    assert.ok(lo.meanAbs > hi.meanAbs, "m² scan should show structural change analogue");
  });

  it("site U and ∂U match φ⁴ formula", () => {
    const s = 0.5;
    const params = { m2: 0.4, lambda: 0.2 };
    assert.ok(Math.abs(siteU(s, params) - (0.5 * 0.4 * s * s + 0.2 * s * s * s * s)) < 1e-12);
    assert.ok(Math.abs(siteDU(s, params) - (0.4 * s + 4 * 0.2 * s * s * s)) < 1e-12);
  });

  it("3D 8³ coupling-only step conserves Σσ and lowers H", () => {
    const nx = 8;
    const n = nx * nx * nx;
    const sigma = new Float32Array(n);
    for (let i = 0; i < n; i++) sigma[i] = ((i * 17) % 50) / 100 - 0.25;
    const shape = { nx, ny: nx, nz: nx, cellCount: n };
    const params = { m2: 0, lambda: 0, J: 1, eta: 0.05 };
    const mass0 = scalarMass(sigma);
    const H0 = hamiltonianEnergy(sigma, shape, params);
    const next = new Float32Array(n);
    relaxStep(sigma, next, shape, params);
    assert.ok(Math.abs(scalarMass(next) - mass0) < 1e-4);
    assert.ok(hamiltonianEnergy(next, shape, params) <= H0 + 1e-5);
  });
});

describe("certified proto uses −∇H and AAIS still gates mass", () => {
  it("lawful chamber step commits; operator is lattice-hamiltonian", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const mass0 = scalarMass(state.scalar);
    const r = stepCertified(createChamber(), state);
    assert.equal(r.committed, true);
    assert.equal(r.proposal.provenance.operator, HAMILTONIAN_OPERATOR);
    assert.ok(Math.abs(scalarMass(state.scalar) - mass0) <= DEFAULT_CONSTITUTION.invariant.numericalErrorBound);
  });

  it("illegal mass injection is still rejected without mutating certified state", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const hash = state.hash;
    const proposal = proposeIllegalMassInjection(state, DEFAULT_CONSTITUTION);
    const result = commitProposal(state, proposal, DEFAULT_CONSTITUTION);
    assert.equal(result.committed, false);
    assert.ok(result.decision.reasons.some((x) => x.code === INVARIANT_ID));
    assert.equal(state.hash, hash);
  });

  it("φ⁴ on-site U is not mass-conserving; AAIS rejects the unlawful proposal", () => {
    const state = createInitialCertifiedState({ seed: 5 });
    const hash = state.hash;
    const constitution = {
      ...DEFAULT_CONSTITUTION,
      numerics: {
        ...DEFAULT_CONSTITUTION.numerics,
        hamiltonian: { m2: 0, lambda: 1, J: 1, eta: 0.05 },
      },
    };
    const proposal = physicsStep(state, constitution);
    const r = commitEngineProposal(state, proposal, constitution);
    assert.equal(r.committed, false);
    assert.ok(
      r.decision.reasons.some(
        (x) => x.code === INVARIANT_ID || x.code === "proto.scalar-mass-conservation",
      ),
    );
    assert.equal(state.hash, hash);
  });
});

describe("governance Hamiltonian H_gov (6 coordinates)", () => {
  it("uses the exact 6-vector (r,a,e,c,t,j) — not a 4-vector leftover", () => {
    assert.deepEqual([...GOV_DIMS], ["r", "a", "e", "c", "t", "j"]);
    assert.equal(GOV_N, 6);
    const s = defaultSigma();
    for (const k of GOV_DIMS) assert.equal(typeof s[k], "number");
    assert.equal(s.trust, undefined);
    assert.equal(s.evidence, undefined);
    assert.equal(s.ambiguity, undefined);
    assert.equal(s.risk, undefined);
  });

  it("U_gov increases if r or a increases, or if e,c,t,j decrease", () => {
    const s0 = defaultSigma();
    const u0 = siteUgov(s0);
    assert.ok(siteUgov({ ...s0, r: s0.r + 0.2 }) > u0);
    assert.ok(siteUgov({ ...s0, a: s0.a + 0.2 }) > u0);
    assert.ok(siteUgov({ ...s0, e: s0.e - 0.2 }) > u0);
    assert.ok(siteUgov({ ...s0, c: s0.c - 0.2 }) > u0);
    assert.ok(siteUgov({ ...s0, t: s0.t - 0.2 }) > u0);
    assert.ok(siteUgov({ ...s0, j: s0.j - 0.2 }) > u0);
  });

  it("two coupled nodes with high J relax toward each other on mismatched coordinates", () => {
    const graph = {
      nodes: [
        { id: "d0", kind: "decision", actorId: "alice", sigma: defaultSigma({ r: 0.9, e: 0.2 }) },
        { id: "d1", kind: "decision", actorId: "alice", sigma: defaultSigma({ r: 0.1, e: 0.9 }) },
      ],
      edges: [{ source: "d0", target: "d1", J: 3, reason: "cdr" }],
      t: 0,
    };
    const dr0 = Math.abs(graph.nodes[0].sigma.r - graph.nodes[1].sigma.r);
    const de0 = Math.abs(graph.nodes[0].sigma.e - graph.nodes[1].sigma.e);
    relaxGovernance(graph, { steps: 20, params: { ...DEFAULT_GOV_PARAMS, eta: 0.04 } });
    const dr1 = Math.abs(graph.nodes[0].sigma.r - graph.nodes[1].sigma.r);
    const de1 = Math.abs(graph.nodes[0].sigma.e - graph.nodes[1].sigma.e);
    assert.ok(dr1 < dr0 - 0.05, `r mismatch ${dr0} → ${dr1}`);
    assert.ok(de1 < de0 - 0.05, `e mismatch ${de0} → ${de1}`);
  });

  it("H_gov is non-increasing for small η", () => {
    const graph = createDemoGovernanceGraph();
    const params = { ...DEFAULT_GOV_PARAMS, eta: 0.03 };
    const { series } = relaxGovernance(graph, { steps: 16, params });
    for (let i = 1; i < series.length; i++) {
      assert.ok(
        series[i].H <= series[i - 1].H + 1e-6,
        `H_gov increased at t=${i}: ${series[i - 1].H} → ${series[i].H}`,
      );
    }
    assert.ok(series[series.length - 1].H < series[0].H);
  });

  it("coordinates remain in [0,1] after relaxation", () => {
    const graph = createDemoGovernanceGraph({ highCost: true });
    graph.threshold = DEFAULT_GOV_PARAMS.threshold;
    relaxGovernance(graph, { steps: 24, params: { ...DEFAULT_GOV_PARAMS, eta: 0.2 } });
    for (const n of graph.nodes) {
      for (const k of GOV_DIMS) {
        assert.ok(n.sigma[k] >= 0 && n.sigma[k] <= 1, `${n.id}.${k}=${n.sigma[k]}`);
      }
    }
  });

  it("analytic gradient matches finite-diff within slack", () => {
    const graph = createDemoGovernanceGraph();
    hamiltonianGovForceInto(graph);
    const fd = finiteDiffGovForce(graph, DEFAULT_GOV_PARAMS, 1e-5);
    let max = 0;
    for (const n of graph.nodes) {
      for (const k of GOV_DIMS) {
        max = Math.max(max, Math.abs(n.force[k] - fd[n.id][k]));
      }
    }
    assert.ok(max < 2e-4, `max |analytic-fd|=${max}`);
  });

  it("∂U/∂σ matches the closed form", () => {
    const s = defaultSigma({ r: 0.3, a: 0.4, e: 0.5, c: 0.6, t: 0.7, j: 0.8 });
    const d = siteDUgov(s, DEFAULT_ALPHA);
    assert.ok(Math.abs(d.r - 2 * DEFAULT_ALPHA.r * s.r) < 1e-12);
    assert.ok(Math.abs(d.a - 2 * DEFAULT_ALPHA.a * s.a) < 1e-12);
    assert.ok(Math.abs(d.e - 2 * DEFAULT_ALPHA.e * (s.e - 1)) < 1e-12);
    assert.ok(Math.abs(d.c - 2 * DEFAULT_ALPHA.c * (s.c - 1)) < 1e-12);
    assert.ok(Math.abs(d.t - 2 * DEFAULT_ALPHA.t * (s.t - 1)) < 1e-12);
    assert.ok(Math.abs(d.j - 2 * DEFAULT_ALPHA.j * (s.j - 1)) < 1e-12);
  });

  it("CPE analogue denies execution when H_gov is above threshold", () => {
    const hot = createDemoGovernanceGraph({ highCost: true });
    const cpe = evaluateCpeHgov(hot);
    assert.equal(cpe.ok, false);
    assert.equal(cpe.reasons[0].code, CPE_HGOV_CODE);

    const state = createInitialCertifiedState({ seed: 2 });
    const proposal = physicsStep(state, DEFAULT_CONSTITUTION);
    const r = commitEngineProposal(state, proposal, DEFAULT_CONSTITUTION, { governance: hot });
    assert.equal(r.committed, false);
    assert.ok(r.decision.reasons.some((x) => x.code === CPE_HGOV_CODE));
    assert.equal(state.t, 0);
  });

  it("healthy demo graph is below threshold so lawful physics can proceed", () => {
    const graph = createDemoGovernanceGraph();
    const cpe = evaluateCpeHgov(graph);
    assert.equal(cpe.ok, true, `H_gov=${cpe.H} threshold=${cpe.threshold}`);
  });

  it("flipping an evidence flag jumps H_gov (CAR analogue)", () => {
    const graph = createDemoGovernanceGraph();
    const H0 = hamiltonianGov(graph);
    applyCarEvidence(graph.nodes[0], { evidence: 0.02 });
    const H1 = hamiltonianGov(graph);
    assert.ok(H1 > H0 + 0.2, `expected H jump, ${H0} → ${H1}`);
    applyCarEvidence(graph.nodes[0], { evidence: 1, risk: 0.05, ambiguity: 0.05 });
    const H2 = hamiltonianGov(graph);
    assert.ok(H2 < H1, "raising evidence should lower U_gov");
  });

  it("writes heatmap / energy artifacts", () => {
    const r = writeHamiltonianArtifacts({ nx: 16, ny: 16, seed: 7 });
    assert.ok(existsSync(r.heatPath));
    assert.ok(existsSync(r.energyPngPath));
    assert.ok(existsSync(r.energyJsonPath));
    assert.ok(existsSync(r.scanPath));
    assert.equal(r.receipt.physics.operator, HAMILTONIAN_OPERATOR);
    assert.equal(r.receipt.physics.energyNonIncreasing, true);
    assert.equal(r.receipt.scanStatus, "partial");
  });

  it("W_gov includes 1/2 and unique undirected edges are used in H and ∇H", () => {
    const si = defaultSigma({ r: 1, a: 0, e: 0, c: 0, t: 0, j: 0 });
    const sj = defaultSigma({ r: 0, a: 0, e: 0, c: 0, t: 0, j: 0 });
    assert.equal(Wgov(si, sj, DEFAULT_W), 0.5);
    const graph = {
      nodes: [
        { id: "n0", sigma: defaultSigma({ r: 0.8, e: 0.2 }) },
        { id: "n1", sigma: defaultSigma({ r: 0.2, e: 0.8 }) },
      ],
      edges: [
        { source: "n0", target: "n1", J: 2 },
        { source: "n1", target: "n0", J: 99 },
      ],
    };
    assert.equal(uniqueGovEdges(graph).length, 1);
    assert.equal(uniqueGovEdges(graph)[0].J, 2);
    hamiltonianGovForceInto(graph, NIGHTLY_GOV_PARAMS);
    const fd = finiteDiffGovForce(graph, NIGHTLY_GOV_PARAMS, 1e-6);
    for (const k of GOV_DIMS) {
      assert.ok(Math.abs(graph.nodes[0].force[k] - fd.n0[k]) < 2e-4);
    }
  });

  it("isolated node: ∂H/∂x matches on-site closed form", () => {
    const s = defaultSigma({ r: 0.3, a: 0.4, e: 0.5, c: 0.6, t: 0.7, j: 0.8 });
    const graph = { nodes: [{ id: "solo", sigma: { ...s } }], edges: [] };
    hamiltonianGovForceInto(graph, { ...DEFAULT_GOV_PARAMS, alpha: DEFAULT_ALPHA });
    const f = graph.nodes[0].force;
    assert.ok(Math.abs(f.r - 2 * DEFAULT_ALPHA.r * s.r) < 1e-12);
    assert.ok(Math.abs(f.a - 2 * DEFAULT_ALPHA.a * s.a) < 1e-12);
    assert.ok(Math.abs(f.e - 2 * DEFAULT_ALPHA.e * (s.e - 1)) < 1e-12);
    assert.ok(Math.abs(f.c - 2 * DEFAULT_ALPHA.c * (s.c - 1)) < 1e-12);
    assert.ok(Math.abs(f.t - 2 * DEFAULT_ALPHA.t * (s.t - 1)) < 1e-12);
    assert.ok(Math.abs(f.j - 2 * DEFAULT_ALPHA.j * (s.j - 1)) < 1e-12);
  });

  it("two-node edge: interaction is J w (x_i − x_j)", () => {
    const J = 1.25;
    const graph = {
      nodes: [
        { id: "n0", sigma: defaultSigma({ r: 0.9, e: 0.2 }) },
        { id: "n1", sigma: defaultSigma({ r: 0.1, e: 0.9 }) },
      ],
      edges: [{ source: "n0", target: "n1", J }],
    };
    hamiltonianGovForceInto(graph, NIGHTLY_GOV_PARAMS);
    const i = graph.nodes[0];
    const jn = graph.nodes[1];
    const wr = NIGHTLY_GOV_PARAMS.w.r;
    const we = NIGHTLY_GOV_PARAMS.w.e;
    assert.ok(Math.abs(i.force.r - (2 * NIGHTLY_ALPHA.r * i.sigma.r + J * wr * (i.sigma.r - jn.sigma.r))) < 1e-12);
    assert.ok(Math.abs(i.force.e - (2 * NIGHTLY_ALPHA.e * (i.sigma.e - 1) + J * we * (i.sigma.e - jn.sigma.e))) < 1e-12);
    assert.ok(Math.abs(jn.force.r - (2 * NIGHTLY_ALPHA.r * jn.sigma.r + J * wr * (jn.sigma.r - i.sigma.r))) < 1e-12);
  });

  it("Jacobi nightly vs in-place Gauss-Seidel differs on a two-node mismatch", () => {
    assert.equal(NIGHTLY_ETA, 0.01);
    const J = 1.25;
    const eta = NIGHTLY_ETA;
    const s0 = defaultSigma({ r: 0.9, a: 0.1, e: 0.2, c: 0.3, t: 0.4, j: 0.5 });
    const s1 = defaultSigma({ r: 0.1, a: 0.8, e: 0.9, c: 0.7, t: 0.6, j: 0.2 });
    const graph = {
      nodes: [
        { id: "n0", sigma: { ...s0 } },
        { id: "n1", sigma: { ...s1 } },
      ],
      edges: [{ source: "n0", target: "n1", J }],
      t: 0,
    };
    const d0 = 2 * NIGHTLY_ALPHA.r * s0.r + J * (s0.r - s1.r);
    const d1 = 2 * NIGHTLY_ALPHA.r * s1.r + J * (s1.r - s0.r);
    const jac0 = Math.min(1, Math.max(0, s0.r - eta * d0));
    const jac1 = Math.min(1, Math.max(0, s1.r - eta * d1));
    const gs1 = Math.min(1, Math.max(0, s1.r - eta * (2 * NIGHTLY_ALPHA.r * s1.r + J * (s1.r - jac0))));
    const rec = nightlyGovernanceRelaxation(graph);
    assert.equal(rec.eta, 0.01);
    assert.equal(rec.jacobi, true);
    assert.ok(Math.abs(graph.nodes[0].sigma.r - jac0) < 1e-12);
    assert.ok(Math.abs(graph.nodes[1].sigma.r - jac1) < 1e-12);
    assert.ok(Math.abs(jac1 - gs1) > 1e-9, "Jacobi must differ from sequential in-place");
    for (const n of graph.nodes) {
      for (const k of GOV_DIMS) {
        assert.ok(n.sigma[k] >= 0 && n.sigma[k] <= 1);
      }
    }
  });

  it("nightly pass is non-increasing on the demo graph and ranks failures", () => {
    const graph = createDemoGovernanceGraph();
    const rec = nightlyGovernanceRelaxation(graph);
    assert.ok(rec.H_after <= rec.H_before + 1e-9, `${rec.H_before} → ${rec.H_after}`);
    const ranked = rankGovFailures(graph, { k: 3 });
    assert.equal(ranked.top.length, 3);
    assert.ok(ranked.top[0].Hi >= ranked.top[1].Hi);
    const solo = siteHgovLocal(graph.nodes[0], graph, NIGHTLY_GOV_PARAMS);
    assert.ok(solo >= 0);
  });

  it("evidence influx flags a regime-change analogue", () => {
    const graph = createDemoGovernanceGraph({ highCost: true });
    graph.threshold = DEFAULT_GOV_PARAMS.threshold;
    const series = [{ t: 0, H: hamiltonianGov(graph, NIGHTLY_GOV_PARAMS) }];
    for (const n of graph.nodes) applyCarEvidence(n, { evidence: 1, risk: 0.05, ambiguity: 0.05 });
    series.push({ t: 1, H: hamiltonianGov(graph, NIGHTLY_GOV_PARAMS) });
    const det = detectGovRegimeChange(series, { absDrop: 0.25, relDrop: 0.1 });
    assert.equal(det.flaggedDrop, true);
    assert.ok(series[1].H < series[0].H);
  });

  it("JS nightly Δσ matches Python within 1e-9", () => {
    const graph = {
      nodes: [
        { id: "n0", sigma: defaultSigma({ r: 0.9, a: 0.1, e: 0.2, c: 0.3, t: 0.4, j: 0.5 }) },
        { id: "n1", sigma: defaultSigma({ r: 0.1, a: 0.8, e: 0.9, c: 0.7, t: 0.6, j: 0.2 }) },
      ],
      edges: [{ source: "n0", target: "n1", J: 1.25 }],
      t: 0,
    };
    const payload = toNightlyPythonPayload(graph, NIGHTLY_GOV_PARAMS);
    nightlyGovernanceRelaxation(graph);
    const dir = mkdtempSync(join(tmpdir(), "hgov-"));
    const fixture = join(dir, "two-node.json");
    writeFileSync(fixture, JSON.stringify(payload));
    const py = spawnSync(
      "python3",
      ["mandala/engine/hamiltonian/nightly_governance.py", "--fixture", fixture, "--dump-json"],
      { encoding: "utf8", cwd: REPO_ROOT },
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    const rec = JSON.parse(py.stdout);
    for (const n of graph.nodes) {
      for (const k of GOV_DIMS) {
        assert.ok(
          Math.abs(n.sigma[k] - rec.sigma[n.id][k]) < 1e-9,
          `${n.id}.${k} js=${n.sigma[k]} py=${rec.sigma[n.id][k]}`,
        );
      }
    }
  });
});
