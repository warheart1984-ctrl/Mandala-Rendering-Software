/**
 * Toy bulk reconstruction: bones / muscle clusters from skin boundary.
 *
 * Clusters of similar B_i + gradients in ρ / w → approximate bone loci.
 * Status: **partial/toy** — not a full anatomical solver.
 * Full RT4D anatomical reconstruction: **declared**.
 */

export const BULK_TOY_STATUS = "partial";
export const ANATOMY_RT4D_STATUS = "declared";

/**
 * Cluster vertices by dominant bone index (argmax of B_i).
 * @param {object} egt — skin EGT
 * @returns {{ clusters: object[], status: string, note: string }}
 */
export function reconstructBonesToy(egt) {
  const boneCount = egt.boneCount || 1;
  const buckets = Array.from({ length: boneCount }, () => []);

  for (const n of egt.nodes) {
    const B = n.B_i;
    if (!B) continue;
    let best = 0;
    let bestW = -1;
    for (let b = 0; b < B.length; b++) {
      if (B[b] > bestW) {
        bestW = B[b];
        best = b;
      }
    }
    if (bestW < 0.15) continue;
    buckets[best].push({ id: n.id, w: bestW, p: n.position, rho: egt.rho[n.id] });
  }

  const clusters = [];
  for (let b = 0; b < boneCount; b++) {
    const verts = buckets[b];
    if (verts.length < 2) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let wr = 0;
    let meanRho = 0;
    for (const v of verts) {
      const ww = v.w;
      cx += v.p.x * ww;
      cy += v.p.y * ww;
      cz += v.p.z * ww;
      wr += ww;
      meanRho += v.rho;
    }
    clusters.push({
      boneIndex: b,
      boneId: egt.boneIds?.[b] ?? `bone_${b}`,
      vertexCount: verts.length,
      centroid: {
        x: cx / (wr || 1),
        y: cy / (wr || 1),
        z: cz / (wr || 1),
      },
      meanRho: meanRho / verts.length,
      status: BULK_TOY_STATUS,
    });
  }

  clusters.sort((a, b) => b.vertexCount - a.vertexCount);

  return {
    kind: "bulk-bones-toy",
    status: BULK_TOY_STATUS,
    anatomyRt4d: ANATOMY_RT4D_STATUS,
    note:
      "Toy centroids from B_i argmax clusters — not osteology / muscle simulation. Full anatomical RT4D reconstruct = declared.",
    clusterCount: clusters.length,
    clusters,
  };
}

/**
 * Muscle-band toy: high-ρ ridges where ∇ρ · edge is large and region matches.
 * @param {object} egt
 * @param {{ region?: string, topK?: number }} [opts]
 */
export function reconstructMuscleBandsToy(egt, opts = {}) {
  const topK = opts.topK ?? 12;
  const scored = [];

  for (const e of egt.edges) {
    const ni = egt.nodes[e.i];
    const nj = egt.nodes[e.j];
    if (opts.region && ni.region !== opts.region && nj.region !== opts.region) {
      continue;
    }
    const dRho = Math.abs(egt.rho[e.i] - egt.rho[e.j]);
    const score = dRho * e.w_ij;
    if (score < 1e-4) continue;
    const mid = {
      x: 0.5 * (ni.position.x + nj.position.x),
      y: 0.5 * (ni.position.y + nj.position.y),
      z: 0.5 * (ni.position.z + nj.position.z),
    };
    scored.push({
      i: e.i,
      j: e.j,
      score,
      mid,
      region: ni.region === nj.region ? ni.region : `${ni.region}|${nj.region}`,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const bands = scored.slice(0, topK);

  return {
    kind: "bulk-muscle-bands-toy",
    status: BULK_TOY_STATUS,
    anatomyRt4d: ANATOMY_RT4D_STATUS,
    note: "High ρ-gradient edges as muscle-band proxies — toy only",
    bandCount: bands.length,
    bands,
  };
}

/**
 * Combined toy bulk summary from skin boundary.
 */
export function reconstructBulkFromSkin(egt, opts = {}) {
  const bones = reconstructBonesToy(egt);
  const muscles = reconstructMuscleBandsToy(egt, opts);
  return {
    kind: "character-bulk-toy",
    status: BULK_TOY_STATUS,
    anatomyRt4d: ANATOMY_RT4D_STATUS,
    claim: "Boundary (skin) → bulk (rig/anatomy) decode is partial/toy",
    bones,
    muscles,
  };
}
