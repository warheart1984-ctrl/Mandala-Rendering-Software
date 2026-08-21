/**
 * Governance Hamiltonian H_gov — same math as the lattice H, different sites.
 *
 * Physics σ (Mandala lattice) and governance σ (AAIS graph) are different fields.
 * Do not smash them into one array. Not a sold SaaS product. Analogue + tests.
 *
 * 6-coordinate state (required). 8+ dims later = **declared** only.
 *
 *   σ_i = (r_i, a_i, e_i, c_i, t_i, j_i)  ∈ [0,1]⁶
 *   r risk (0 safe … 1 critical)
 *   a ambiguity (0 clear … 1 highly ambiguous)
 *   e evidence sufficiency (0 none … 1 fully supported)
 *   c compliance alignment (0 non-compliant … 1 fully compliant)
 *   t trust / reliability (0 untrusted … 1 highly trusted)
 *   j jurisdictional fit (0 wrong … 1 correct/clear)
 *
 * U_gov(σ_i) = α_r r² + α_a a² + α_c (1−c)² + α_e (1−e)² + α_t (1−t)² + α_j (1−j)²
 *
 * W_gov(σ_i, σ_j) = (1/2)( w_r (r_i−r_j)² + w_a (a_i−a_j)² + w_e (e_i−e_j)²
 *                         + w_c (c_i−c_j)² + w_t (t_i−t_j)² + w_j (j_i−j_j)² )
 * W already contains 1/2, so ∂W/∂r_i = w_r (r_i−r_j), not (1/2) w_r (r_i−r_j).
 *
 * H_gov = Σ_i U_gov(σ_i) + Σ_⟨i,j⟩ J_ij^gov W_gov(σ_i, σ_j)
 * Convention: each unordered pair ⟨i,j⟩ once in H (duplicate directed records collapsed).
 * Neighbor sum in ∇H still includes every neighbor of i.
 *
 * Analytic gradient (implemented; finite-diff is a test oracle only):
 *   ∂U/∂r = 2 α_r r          ∂U/∂a = 2 α_a a
 *   ∂U/∂e = 2 α_e (e−1)      ∂U/∂c = 2 α_c (c−1)
 *   ∂U/∂t = 2 α_t (t−1)      ∂U/∂j = 2 α_j (j−1)   (j = jurisdiction coord)
 *   ∂H/∂r_i = 2 α_r r_i + Σ_{j∈N(i)} J_ij^gov w_r (r_i − r_j)
 *   (and analogously for a,e,c,t,jFit)
 *
 * Update is Jacobi (simultaneous): all ∂H from current σ, then commit clamp(σ − η ∂H).
 * Inner relaxGovStep eta default 0.05; nightlyGovernanceRelaxation eta default 0.01.
 * Same H_gov — not a second Hamiltonian. Computational analogue, not vacuum physics.
 * Clamp after each step to [0,1].
 *
 * Map (reuse in-repo names; do not invent AAIS-UL v20):
 *   CAR (evidence) → raises e (lowers U_gov)
 *   CDR (decision record) → edges ⟨i,j⟩
 *   CEL (logic) → shapes α, w, J, threshold
 *   CPE (JACA execution analogue — NOT CIEMS CPE-* packets) → allow only if H_gov < threshold
 *
 * Cycle: Authority → Validation → Decision → Evidence → Verification → Replay → Audit
 *
 * Status: **working** for demo graph + AAIS engine-ABI hook.
 * Real CAR/CDR store: **declared**.
 */

export const GOV_STATUS = "working";
export const GOV_OPERATOR = "governance-hamiltonian";
export const GOV_DIMS = Object.freeze(["r", "a", "e", "c", "t", "j"]);
export const GOV_N = 6;
export const GOV_HIGHER_DIMS_STATUS = "declared";

export const DEFAULT_ALPHA = Object.freeze({
  r: 1.0,
  a: 1.0,
  e: 1.0,
  c: 1.0,
  t: 0.8,
  j: 0.8,
});

export const DEFAULT_W = Object.freeze({
  r: 1.0,
  a: 1.0,
  e: 1.0,
  c: 1.0,
  t: 1.0,
  j: 1.0,
});

export const DEFAULT_GOV_PARAMS = Object.freeze({
  alpha: DEFAULT_ALPHA,
  w: DEFAULT_W,
  eta: 0.05,
  threshold: 8.0,
  Jdefault: 1.0,
});

/** Nightly Jacobi pass (Python CPU + JS). All α,w = 1 so the two runtimes match. */
export const NIGHTLY_ETA = 0.01;
export const NIGHTLY_ALPHA = Object.freeze({
  r: 1.0,
  a: 1.0,
  e: 1.0,
  c: 1.0,
  t: 1.0,
  j: 1.0,
});
export const NIGHTLY_W = Object.freeze({
  r: 1.0,
  a: 1.0,
  e: 1.0,
  c: 1.0,
  t: 1.0,
  j: 1.0,
});
export const NIGHTLY_GOV_PARAMS = Object.freeze({
  alpha: NIGHTLY_ALPHA,
  w: NIGHTLY_W,
  eta: NIGHTLY_ETA,
  threshold: DEFAULT_GOV_PARAMS.threshold,
  Jdefault: 1.0,
});

export const CPE_HGOV_CODE = "aais.hgov-cpe-threshold";

const K = GOV_DIMS;

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function cloneSigma(s) {
  return { r: s.r, a: s.a, e: s.e, c: s.c, t: s.t, j: s.j };
}

export function defaultSigma(overrides = {}) {
  return {
    r: 0.12,
    a: 0.12,
    e: 0.82,
    c: 0.82,
    t: 0.82,
    j: 0.82,
    ...overrides,
  };
}

export function siteUgov(s, alpha = DEFAULT_ALPHA) {
  const dc = 1 - s.c;
  const de = 1 - s.e;
  const dt = 1 - s.t;
  const dj = 1 - s.j;
  return (
    alpha.r * s.r * s.r +
    alpha.a * s.a * s.a +
    alpha.c * dc * dc +
    alpha.e * de * de +
    alpha.t * dt * dt +
    alpha.j * dj * dj
  );
}

/**
 * Analytic ∂U/∂σ (object with r,a,e,c,t,j).
 */
export function siteDUgov(s, alpha = DEFAULT_ALPHA) {
  return {
    r: 2 * alpha.r * s.r,
    a: 2 * alpha.a * s.a,
    e: 2 * alpha.e * (s.e - 1),
    c: 2 * alpha.c * (s.c - 1),
    t: 2 * alpha.t * (s.t - 1),
    j: 2 * alpha.j * (s.j - 1),
  };
}

export function weightedDist2(si, sj, w = DEFAULT_W) {
  let acc = 0;
  for (const k of K) {
    const d = si[k] - sj[k];
    acc += w[k] * d * d;
  }
  return acc;
}

export function Wgov(si, sj, w = DEFAULT_W) {
  return 0.5 * weightedDist2(si, sj, w);
}

function nodeById(graph) {
  const m = new Map();
  for (const n of graph.nodes) m.set(n.id, n);
  return m;
}

function undirectedKey(source, target) {
  return source < target ? `${source}|${target}` : `${target}|${source}`;
}

/**
 * Unique unordered edges ⟨i,j⟩. H_gov and ∇H share this walk so energy and
 * gradients stay consistent (W already has 1/2).
 */
export function uniqueGovEdges(graph, params = DEFAULT_GOV_PARAMS) {
  const Jdefault = params.Jdefault ?? 1;
  const index = nodeById(graph);
  const seen = new Set();
  const out = [];
  for (const e of graph.edges || []) {
    if (!e || e.source === e.target) continue;
    const key = undirectedKey(e.source, e.target);
    if (seen.has(key)) continue;
    seen.add(key);
    const ni = index.get(e.source);
    const nj = index.get(e.target);
    if (!ni || !nj) continue;
    out.push({ source: e.source, target: e.target, J: e.J ?? Jdefault, ni, nj });
  }
  return out;
}

export function resolveGovParams(params = DEFAULT_GOV_PARAMS) {
  return {
    alpha: params.alpha || DEFAULT_ALPHA,
    w: params.w || DEFAULT_W,
    eta: params.eta ?? DEFAULT_GOV_PARAMS.eta,
    threshold: params.threshold ?? DEFAULT_GOV_PARAMS.threshold,
    Jdefault: params.Jdefault ?? 1,
  };
}

export function hamiltonianGov(graph, params = DEFAULT_GOV_PARAMS) {
  const { alpha, w } = resolveGovParams(params);
  let h = 0;
  for (const n of graph.nodes) h += siteUgov(n.sigma, alpha);
  for (const e of uniqueGovEdges(graph, params)) {
    h += e.J * Wgov(e.ni.sigma, e.nj.sigma, w);
  }
  return h;
}

/**
 * Local failure cost H_i = U_gov(σ_i) + Σ_{nbr∈N(i)} J_inbr W_gov(σ_i,σ_nbr).
 * Σ_i H_i double-counts W relative to H_gov; that is intentional for ranking.
 */
export function siteHgovLocal(node, graph, params = DEFAULT_GOV_PARAMS) {
  const { alpha, w } = resolveGovParams(params);
  let h = siteUgov(node.sigma, alpha);
  for (const e of uniqueGovEdges(graph, params)) {
    if (e.ni.id === node.id || e.nj.id === node.id) {
      h += e.J * Wgov(e.ni.sigma, e.nj.sigma, w);
    }
  }
  return h;
}

export function rankGovFailures(graph, { k = 5, params = NIGHTLY_GOV_PARAMS } = {}) {
  const rows = graph.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    Hi: siteHgovLocal(n, graph, params),
    sigma: cloneSigma(n.sigma),
  }));
  const maxH = rows.reduce((m, r) => Math.max(m, r.Hi), 0) || 1;
  for (const r of rows) r.normalized = r.Hi / maxH;
  rows.sort((a, b) => b.Hi - a.Hi);
  return {
    status: "partial",
    top: rows.slice(0, k),
    all: rows,
    note: "Top-K H_i = where governance fails (analogue). Not a sold SaaS.",
  };
}

/**
 * Analytic ∂H_gov/∂σ_i into each node's `force` field (mutates graph.nodes[i].force).
 * Jurisdiction coordinate stays `sigma.j` / `force.j` (jFit); neighbor nodes are `nj`.
 */
export function hamiltonianGovForceInto(graph, params = DEFAULT_GOV_PARAMS) {
  const { alpha, w } = resolveGovParams(params);
  for (const n of graph.nodes) {
    n.force = siteDUgov(n.sigma, alpha);
  }
  for (const e of uniqueGovEdges(graph, params)) {
    const { ni, nj, J } = e;
    for (const k of K) {
      const d = J * w[k] * (ni.sigma[k] - nj.sigma[k]);
      ni.force[k] += d;
      nj.force[k] -= d;
    }
  }
  return graph;
}

/**
 * Finite-difference oracle for tests (not the solver).
 */
export function finiteDiffGovForce(graph, params = DEFAULT_GOV_PARAMS, eps = 1e-6) {
  const forces = {};
  for (const n of graph.nodes) {
    forces[n.id] = {};
    for (const k of K) {
      const orig = n.sigma[k];
      n.sigma[k] = orig + eps;
      const hp = hamiltonianGov(graph, params);
      n.sigma[k] = orig - eps;
      const hm = hamiltonianGov(graph, params);
      n.sigma[k] = orig;
      forces[n.id][k] = (hp - hm) / (2 * eps);
    }
  }
  return forces;
}

function jacobiCommit(graph, eta, params) {
  hamiltonianGovForceInto(graph, params);
  const newSigma = graph.nodes.map((n) => {
    const next = {};
    for (const k of K) next[k] = clamp01(n.sigma[k] - eta * n.force[k]);
    return next;
  });
  for (let i = 0; i < graph.nodes.length; i++) graph.nodes[i].sigma = newSigma[i];
  graph.t = (graph.t || 0) + 1;
  graph.H = hamiltonianGov(graph, params);
  return graph;
}

/**
 * One Jacobi step. Same ∇H as nightly; default η=0.05 and α_t=α_j=0.8.
 * Not Gauss-Seidel: new_σ is allocated from the current state, then committed.
 */
export function relaxGovStep(graph, params = DEFAULT_GOV_PARAMS) {
  const eta = params.eta ?? DEFAULT_GOV_PARAMS.eta;
  return jacobiCommit(graph, eta, params);
}

/**
 * SaaS “nightly job” analogue: one Jacobi pass, η=0.01, α=w=1.
 * Does not invent a second H_gov — uses hamiltonianGov / hamiltonianGovForceInto.
 */
export function nightlyGovernanceRelaxation(graph, opts = {}) {
  const params = {
    ...NIGHTLY_GOV_PARAMS,
    ...(opts.params || {}),
    alpha: opts.alpha ?? opts.params?.alpha ?? NIGHTLY_ALPHA,
    w: opts.w ?? opts.params?.w ?? NIGHTLY_W,
    eta: opts.eta ?? opts.params?.eta ?? NIGHTLY_ETA,
  };
  const eta = params.eta;
  const H_before = hamiltonianGov(graph, params);
  jacobiCommit(graph, eta, params);
  const H_after = graph.H;
  return {
    eta,
    jacobi: true,
    gaussSeidel: false,
    nodesTouched: graph.nodes.length,
    H_before,
    H_after,
    deltaH: H_after - H_before,
    t: graph.t,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    params: { alpha: params.alpha, w: params.w, eta },
    note: "Gradient descent on governance cost (computational analogue). Not vacuum-as-decision-making.",
  };
}

/**
 * Flag large |ΔH| / relative drops across nightly passes.
 * Analogue of regime change — not a proven critical point.
 */
export function detectGovRegimeChange(series, { absDrop = 0.25, relDrop = 0.1 } = {}) {
  const flagged = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].H;
    const cur = series[i].H;
    const dH = cur - prev;
    const rel = prev !== 0 ? dH / Math.abs(prev) : 0;
    if (Math.abs(dH) >= absDrop || rel <= -relDrop) {
      flagged.push({
        t: series[i].t ?? i,
        H_prev: prev,
        H: cur,
        dH,
        rel,
      });
    }
  }
  return {
    status: "partial",
    flagged,
    flaggedDrop: flagged.length > 0,
    analogue: "regime-change analogue on H_gov(t), not a proven critical exponent",
  };
}

export function toNightlyPythonPayload(graph, params = NIGHTLY_GOV_PARAMS) {
  const r = {};
  const a = {};
  const e = {};
  const c = {};
  const t = {};
  const jv = {};
  const neighbors = {};
  const J = {};
  for (const n of graph.nodes) {
    r[n.id] = n.sigma.r;
    a[n.id] = n.sigma.a;
    e[n.id] = n.sigma.e;
    c[n.id] = n.sigma.c;
    t[n.id] = n.sigma.t;
    jv[n.id] = n.sigma.j;
    neighbors[n.id] = [];
    J[n.id] = {};
  }
  for (const edge of uniqueGovEdges(graph, params)) {
    neighbors[edge.ni.id].push(edge.nj.id);
    neighbors[edge.nj.id].push(edge.ni.id);
    J[edge.ni.id][edge.nj.id] = edge.J;
    J[edge.nj.id][edge.ni.id] = edge.J;
  }
  return {
    nodes: graph.nodes.map((n) => n.id),
    r,
    a,
    e,
    c,
    t,
    j: jv,
    neighbors,
    J,
    eta: params.eta ?? NIGHTLY_ETA,
  };
}

export function relaxGovernance(graph, { steps = 8, params = DEFAULT_GOV_PARAMS } = {}) {
  const series = [];
  graph.H = hamiltonianGov(graph, params);
  series.push({ t: graph.t || 0, H: graph.H });
  for (let s = 0; s < steps; s++) {
    relaxGovStep(graph, params);
    series.push({ t: graph.t, H: graph.H });
  }
  return { graph, series, H: graph.H };
}

export function evaluateCpeHgov(graph, params = DEFAULT_GOV_PARAMS) {
  if (!graph) {
    return { ok: true, applied: false, H: null, threshold: params.threshold };
  }
  const H = typeof graph.H === "number" ? graph.H : hamiltonianGov(graph, params);
  const threshold = graph.threshold ?? params.threshold ?? DEFAULT_GOV_PARAMS.threshold;
  const ok = H < threshold;
  const reasons = ok
    ? []
    : [
        {
          code: CPE_HGOV_CODE,
          detail: `H_gov=${H} >= threshold ${threshold} (CPE analogue: execution denied)`,
        },
      ];
  return { ok, applied: true, H, threshold, reasons };
}

/**
 * CAR analogue: raising evidence (and typically lowering risk/ambiguity) lowers U_gov.
 */
export function applyCarEvidence(node, { evidence = 1, risk, ambiguity } = {}) {
  node.sigma = cloneSigma(node.sigma);
  node.sigma.e = clamp01(evidence);
  if (typeof risk === "number") node.sigma.r = clamp01(risk);
  if (typeof ambiguity === "number") node.sigma.a = clamp01(ambiguity);
  return node;
}

function addEdge(edges, source, target, J, reason) {
  if (source === target) return;
  const a = source < target ? source : target;
  const b = source < target ? target : source;
  if (edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))) {
    return;
  }
  edges.push({ source, target, J, reason });
}

/**
 * Adjacency from: same actor / different decisions; same policy / different intents;
 * same tool / different runs; plus explicit CDR edges.
 */
export function inferGovEdges(nodes, { J = 1, extra = [] } = {}) {
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let k = i + 1; k < nodes.length; k++) {
      const a = nodes[i];
      const b = nodes[k];
      if (a.actorId && a.actorId === b.actorId && a.kind === "decision" && b.kind === "decision") {
        addEdge(edges, a.id, b.id, J, "same-actor-different-decisions");
      }
      if (a.policyId && a.policyId === b.policyId && a.kind === "intent" && b.kind === "intent") {
        addEdge(edges, a.id, b.id, J, "same-policy-different-intents");
      }
      if (a.toolId && a.toolId === b.toolId && a.kind === "tool-run") {
        addEdge(edges, a.id, b.id, J, "same-tool-different-runs");
      }
    }
  }
  for (const e of extra) addEdge(edges, e.source, e.target, e.J ?? J, e.reason || "cdr");
  return edges;
}

/**
 * Tiny demo graph (fake records + one AAIS-shaped proposal node). Real CAR/CDR store: declared.
 */
export function createDemoGovernanceGraph({ highCost = false } = {}) {
  const calm = defaultSigma();
  const hot = defaultSigma({ r: 0.95, a: 0.9, e: 0.05, c: 0.1, t: 0.1, j: 0.15 });
  const nodes = [
    {
      id: "intent-0",
      kind: "intent",
      actorId: "alice",
      policyId: "policy-p1",
      sigma: cloneSigma(highCost ? hot : calm),
    },
    {
      id: "intent-1",
      kind: "intent",
      actorId: "bob",
      policyId: "policy-p1",
      sigma: cloneSigma(calm),
    },
    {
      id: "decision-0",
      kind: "decision",
      actorId: "alice",
      policyId: "policy-p1",
      sigma: cloneSigma(calm),
    },
    {
      id: "decision-1",
      kind: "decision",
      actorId: "alice",
      policyId: "policy-p2",
      sigma: cloneSigma(highCost ? hot : defaultSigma({ r: 0.35, e: 0.55 })),
    },
    {
      id: "tool-run-a",
      kind: "tool-run",
      toolId: "chamber-step",
      sigma: cloneSigma(calm),
    },
    {
      id: "tool-run-b",
      kind: "tool-run",
      toolId: "chamber-step",
      sigma: cloneSigma(defaultSigma({ t: 0.4, j: 0.5 })),
    },
    {
      id: "actor-alice",
      kind: "actor",
      actorId: "alice",
      sigma: cloneSigma(calm),
    },
    {
      id: "policy-p1",
      kind: "policy",
      policyId: "policy-p1",
      sigma: cloneSigma(calm),
    },
    {
      id: "aais-proposal-0",
      kind: "proposal",
      sigma: cloneSigma(calm),
    },
  ];
  const extra = [
    { source: "intent-0", target: "decision-0", J: 1.2, reason: "cdr" },
    { source: "decision-0", target: "policy-p1", J: 1.0, reason: "cdr" },
    { source: "aais-proposal-0", target: "intent-0", J: 0.8, reason: "cdr" },
    { source: "actor-alice", target: "decision-0", J: 0.6, reason: "cdr" },
    { source: "intent-0", target: "policy-p1", J: 0.7, reason: "cdr" },
  ];
  const edges = inferGovEdges(nodes, { J: 1, extra });
  const graph = {
    organ: "AAIS",
    operator: GOV_OPERATOR,
    status: GOV_STATUS,
    t: 0,
    nodes,
    edges,
    params: { ...DEFAULT_GOV_PARAMS },
    threshold: highCost ? 0.5 : DEFAULT_GOV_PARAMS.threshold,
    note:
      "Demo graph. Real CAR/CDR store declared. CPE here is the JACA execution analogue, not CIEMS CPE-* packets.",
  };
  graph.H = hamiltonianGov(graph);
  return graph;
}

export function describeGovernanceHamiltonian() {
  return {
    organ: "AAIS",
    operator: GOV_OPERATOR,
    status: GOV_STATUS,
    dims: GOV_DIMS,
    n: GOV_N,
    higherDims: GOV_HIGHER_DIMS_STATUS,
    alpha: DEFAULT_ALPHA,
    w: DEFAULT_W,
    eta: DEFAULT_GOV_PARAMS.eta,
    nightlyEta: NIGHTLY_ETA,
    nightlyAlpha: NIGHTLY_ALPHA,
    jacobi: true,
    wConvention: "W_gov includes 1/2; each unordered pair once in H_gov",
    threshold: DEFAULT_GOV_PARAMS.threshold,
    formula:
      "H_gov=Σ U_gov + Σ J W_gov; U=α_r r²+α_a a²+α_c(1-c)²+α_e(1-e)²+α_t(1-t)²+α_j(1-j)²",
    flow: "σ ← clamp01(σ − η ∂H_gov/∂σ)",
    map: {
      CAR: "evidence raises e → lowers U_gov",
      CDR: "decision-record edges ⟨i,j⟩",
      CEL: "shapes α, w, J, threshold",
      CPE: "execution iff H_gov < threshold (engine ABI gate; not CIEMS CPE-*)",
    },
    cycle: "Authority → Validation → Decision → Evidence → Verification → Replay → Audit",
    product: "analogue + tests, not a sold SaaS",
    realStore: "declared",
  };
}
