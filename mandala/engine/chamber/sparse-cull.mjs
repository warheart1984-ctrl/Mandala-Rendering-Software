/**
 * Pre-induced sparse node cull (partial).
 *
 * Selects active nodes before holoRig.update / appearance / build so hot loops
 * see fewer nodes. Full EGT stays intact for walk / bulk coupling.
 *
 * Keep: ρ > RHO_SPARSE || |K| > K_SPARSE || w_ij > W_JOINT_KEEP endpoints
 *        || anatomy bone/joint structural verts.
 */

export const RHO_SPARSE = 0.05;
export const K_SPARSE = 0.3;
export const W_JOINT_KEEP = 0.1;
export const SPARSE_CULL_STATUS = "partial";

/**
 * @param {object} egt
 * @param {object|null} anatomy
 * @param {{ rhoThresh?: number, kThresh?: number, wKeep?: number }} [opts]
 * @returns {Uint8Array} keep mask length = node count
 */
export function selectSparseKeepMask(egt, anatomy = null, opts = {}) {
  const rhoThresh = opts.rhoThresh ?? RHO_SPARSE;
  const kThresh = opts.kThresh ?? K_SPARSE;
  const wKeep = opts.wKeep ?? W_JOINT_KEEP;
  const n = egt?.nodes?.length ?? egt?.rho?.length ?? 0;
  const keep = new Uint8Array(n);
  const rho = egt.rho;
  const K = egt.K;
  for (let i = 0; i < n; i++) {
    if ((rho?.[i] ?? 0) > rhoThresh || Math.abs(K?.[i] ?? 0) > kThresh) {
      keep[i] = 1;
    }
  }
  for (const e of egt.edges || []) {
    if ((e.w_ij ?? 0) > wKeep) {
      if (e.i >= 0 && e.i < n) keep[e.i] = 1;
      if (e.j >= 0 && e.j < n) keep[e.j] = 1;
    }
  }
  for (const [a, b] of anatomy?.labels?.boneEdges || []) {
    if (a >= 0 && a < n) keep[a] = 1;
    if (b >= 0 && b < n) keep[b] = 1;
  }
  for (const j of anatomy?.bones?.joints || []) {
    if (j.i >= 0 && j.i < n) keep[j.i] = 1;
    if (j.j >= 0 && j.j < n) keep[j.j] = 1;
  }
  return keep;
}

/**
 * Compact EGT to active nodes with remapped edge indices.
 * Does not mutate the source EGT.
 *
 * @param {object} egt
 * @param {Uint8Array} keep
 * @returns {{ egt: object, sourceIndices: Uint32Array, nodeCountFull: number, nodeCountSparse: number }}
 */
export function compactEgtByMask(egt, keep) {
  const n = egt.nodes.length;
  const map = new Int32Array(n).fill(-1);
  const source = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      map[i] = source.length;
      source.push(i);
    }
  }
  const m = source.length;
  const sourceIndices = Uint32Array.from(source);

  const nodes = new Array(m);
  const rho = new Float64Array(m);
  const K = new Float64Array(m);
  const epsilon = egt.epsilon ? new Float64Array(m) : null;
  const E_norms = egt.E_norms ? new Float64Array(m) : null;

  for (let k = 0; k < m; k++) {
    const i = source[k];
    const src = egt.nodes[i];
    const p = src.position || { x: src.x ?? 0, y: src.y ?? 0, z: src.z ?? 0 };
    nodes[k] = {
      ...src,
      id: k,
      position: { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 },
      E: src.E ? Float64Array.from(src.E) : undefined,
      normal: src.normal ? [...src.normal] : undefined,
      gov: src.gov ? { ...src.gov } : undefined,
    };
    rho[k] = egt.rho?.[i] ?? 0;
    K[k] = egt.K?.[i] ?? 0;
    if (epsilon) epsilon[k] = egt.epsilon[i] ?? 0;
    if (E_norms) E_norms[k] = egt.E_norms[i] ?? 0;
  }

  const edges = [];
  for (const e of egt.edges || []) {
    const i = map[e.i];
    const j = map[e.j];
    if (i < 0 || j < 0) continue;
    edges.push({ ...e, i, j });
  }

  const compact = {
    ...egt,
    nodes,
    edges,
    rho,
    K,
    epsilon: epsilon || undefined,
    E_norms: E_norms || undefined,
    h_ij: egt.h_ij || null,
    sparseCull: {
      status: SPARSE_CULL_STATUS,
      nodeCountFull: n,
      nodeCountSparse: m,
      rhoThresh: RHO_SPARSE,
      kThresh: K_SPARSE,
      wKeep: W_JOINT_KEEP,
    },
  };

  return {
    egt: compact,
    sourceIndices,
    nodeCountFull: n,
    nodeCountSparse: m,
  };
}

/**
 * Remap anatomy labels onto compacted node ids (best-effort).
 */
export function remapAnatomyForSparse(anatomy, sourceIndices) {
  if (!anatomy || !sourceIndices?.length) return anatomy;
  const oldToNew = new Map();
  for (let k = 0; k < sourceIndices.length; k++) {
    oldToNew.set(sourceIndices[k], k);
  }
  const mapId = (id) => (oldToNew.has(id) ? oldToNew.get(id) : -1);
  const boneEdges = (anatomy.labels?.boneEdges || [])
    .map(([a, b]) => [mapId(a), mapId(b)])
    .filter(([a, b]) => a >= 0 && b >= 0);
  const joints = (anatomy.bones?.joints || [])
    .map((j) => {
      const i = mapId(j.i);
      const jj = mapId(j.j);
      if (i < 0 || jj < 0) return null;
      return { ...j, i, j: jj };
    })
    .filter(Boolean);
  const muscleVertexIds = (anatomy.labels?.muscleVertexIds || [])
    .map(mapId)
    .filter((id) => id >= 0);
  const softVertexIds = (anatomy.labels?.softVertexIds || [])
    .map(mapId)
    .filter((id) => id >= 0);
  const paths = (anatomy.bones?.paths || [])
    .map((p) => {
      const i = mapId(p.i);
      const j = mapId(p.j);
      if (i < 0 || j < 0) return null;
      return { ...p, i, j };
    })
    .filter(Boolean);

  return {
    ...anatomy,
    bones: {
      ...anatomy.bones,
      paths,
      joints,
    },
    labels: {
      ...anatomy.labels,
      boneEdges,
      muscleVertexIds,
      softVertexIds,
    },
  };
}
