/**
 * Certified 4D state S(x,y,z,t,...) for the tiny proto universe.
 *
 * Dense 32³ × 64 is OK at this scale (~32 MiB). Sparse/hierarchical is conceptual.
 * Temporal BVH / event surfaces are **skeleton**.
 *
 * Status: **partial**
 */

import { createHash } from "node:crypto";
import { DEFAULT_CONSTITUTION, PROTO_SHAPE, idx } from "./constitution.mjs";
import { hashNoise4 } from "../substrate/dual-lattice.mjs";
import { moebiusParity } from "../substrate/moebius.mjs";

export function wellContribution(x, y, z, cx, cy, cz, amplitude, sigma) {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  const r2 = dx * dx + dy * dy + dz * dz;
  return -amplitude * Math.exp(-r2 / (2 * sigma * sigma));
}

export function scalarMass(phi) {
  let s = 0;
  for (let i = 0; i < phi.length; i++) s += phi[i];
  return s;
}

export function applyWell(phi, cx, cy, cz, amplitude, sigma, shape, sign) {
  const { nx, ny, nz } = shape;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        phi[idx(x, y, z, shape)] +=
          sign * wellContribution(x, y, z, cx, cy, cz, amplitude, sigma);
      }
    }
  }
}

export function hashCertifiedPayload({
  constitutionId,
  seed,
  t,
  scalar,
  vector,
  defect,
}) {
  const h = createHash("sha256");
  h.update(String(constitutionId));
  h.update("\0");
  h.update(String(seed));
  h.update("\0");
  h.update(String(t));
  h.update("\0");
  h.update(Buffer.from(scalar.buffer, scalar.byteOffset, scalar.byteLength));
  h.update(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
  h.update(`d:${defect.type}:${defect.x},${defect.y},${defect.z}`);
  return h.digest("hex");
}

function emptyWorldline() {
  return [];
}

/**
 * Allocate a certified vacuum + one local_rupture defect.
 * Simulation Chamber has not evolved yet; t = 0 is stored in the temporal cache.
 */
export function createInitialCertifiedState({
  constitution = DEFAULT_CONSTITUTION,
  seed = 7,
  defect = { x: 16, y: 16, z: 16 },
  observer = { x: 8, y: 16, z: 24, t: 0 },
} = {}) {
  const shape = PROTO_SHAPE;
  const n = shape.cellCount;
  const scalar = new Float32Array(n);
  const vector = new Float32Array(n * 3);
  const { wellAmplitude, wellSigma, etaAmplitude } = constitution.numerics;

  const def = {
    type: "local_rupture",
    x: defect.x | 0,
    y: defect.y | 0,
    z: defect.z | 0,
  };

  applyWell(scalar, def.x, def.y, def.z, wellAmplitude, wellSigma, shape, +1);

  let etaSum = 0;
  const eta = new Float32Array(n);
  for (let z = 0; z < shape.nz; z++) {
    for (let y = 0; y < shape.ny; y++) {
      for (let x = 0; x < shape.nx; x++) {
        const i = idx(x, y, z, shape);
        eta[i] = hashNoise4(x, y, z, 0, seed) * etaAmplitude;
        etaSum += eta[i];
      }
    }
  }
  const etaMean = etaSum / n;
  for (let i = 0; i < n; i++) scalar[i] += eta[i] - etaMean;

  const obs = {
    x: observer.x | 0,
    y: observer.y | 0,
    z: observer.z | 0,
    t: 0,
  };

  const state = {
    constitutionId: constitution.id,
    seed,
    t: 0,
    shape,
    scalar,
    vector,
    defect: def,
    material: { ...constitution.material, albedo: [...constitution.material.albedo] },
    observer: obs,
    frozen: false,
    temporal: {
      status: "partial",
      nt: shape.nt,
      scalarCache: new Float32Array(shape.nt * n),
      vectorCache: new Float32Array(shape.nt * n * 3),
      defectWorldline: emptyWorldline(),
      observerPath: [],
      filled: 0,
    },
    topology: {
      kind: "persistent-topology-graph",
      status: "skeleton",
      defectType: "local_rupture",
      note: "one defect worldline; no dynamic topology surgery",
    },
    temporalBvh: {
      kind: "temporal-bvh-dag",
      status: "skeleton",
      note: "linear certified DAG t → t+1; no hierarchical 4D BVH built",
    },
    eventSurfaces: {
      kind: "event-surfaces",
      status: "skeleton",
      events: [],
    },
    latentMoebius: {
      status: "partial",
      note: "vertexParity (x+y) mod 2 stored as latent map, not coupled into φ (same split as substrate)",
      sampleParity: moebiusParity(def.x, def.y),
    },
    hash: "",
  };

  storeSlice(state, 0);
  rehash(state);
  return state;
}

export function storeSlice(state, t) {
  const n = state.shape.cellCount;
  const tt = t | 0;
  if (tt < 0 || tt >= state.shape.nt) {
    throw new Error(`slice t=${tt} out of temporal cache [0, ${state.shape.nt})`);
  }
  state.temporal.scalarCache.set(state.scalar, tt * n);
  state.temporal.vectorCache.set(state.vector, tt * n * 3);
  state.temporal.defectWorldline[tt] = {
    t: tt,
    x: state.defect.x,
    y: state.defect.y,
    z: state.defect.z,
    type: state.defect.type,
  };
  state.temporal.observerPath[tt] = { ...state.observer, t: tt };
  if (tt + 1 > state.temporal.filled) state.temporal.filled = tt + 1;
  if (tt > 0) {
    const prev = state.temporal.defectWorldline[tt - 1];
    if (prev && (prev.x !== state.defect.x || prev.y !== state.defect.y || prev.z !== state.defect.z)) {
      state.eventSurfaces.events.push({
        status: "skeleton",
        t: tt,
        type: "defect-cell-change",
        from: { x: prev.x, y: prev.y, z: prev.z },
        to: { x: state.defect.x, y: state.defect.y, z: state.defect.z },
      });
    }
  }
}

export function loadSliceInto(state, t) {
  const n = state.shape.cellCount;
  const tt = t | 0;
  if (tt < 0 || tt >= state.temporal.filled) {
    throw new Error(`no certified slice at t=${tt} (filled=${state.temporal.filled})`);
  }
  state.scalar.set(state.temporal.scalarCache.subarray(tt * n, tt * n + n));
  state.vector.set(state.temporal.vectorCache.subarray(tt * n * 3, tt * n * 3 + n * 3));
  const d = state.temporal.defectWorldline[tt];
  state.defect = { type: d.type, x: d.x, y: d.y, z: d.z };
  state.t = tt;
  state.observer = { ...state.temporal.observerPath[tt] };
  rehash(state);
  return state;
}

export function rehash(state) {
  state.hash = hashCertifiedPayload({
    constitutionId: state.constitutionId,
    seed: state.seed,
    t: state.t,
    scalar: state.scalar,
    vector: state.vector,
    defect: state.defect,
  });
  return state.hash;
}

/**
 * Frozen certified snapshot: deep copy of the live fields used for projection.
 * Renderer must use this (or an equivalent copy). Mutating it cannot touch certified truth.
 */
export function freezeCertifiedSnapshot(state) {
  return {
    frozen: true,
    constitutionId: state.constitutionId,
    seed: state.seed,
    t: state.t,
    hash: state.hash,
    shape: state.shape,
    scalar: new Float32Array(state.scalar),
    vector: new Float32Array(state.vector),
    defect: { ...state.defect },
    material: { ...state.material, albedo: [...state.material.albedo] },
    observer: { ...state.observer },
  };
}

export function sliceHashFromCache(state, t) {
  const n = state.shape.cellCount;
  const tt = t | 0;
  if (tt < 0 || tt >= state.temporal.filled) {
    throw new Error(`no certified slice at t=${tt}`);
  }
  const scalar = state.temporal.scalarCache.subarray(tt * n, tt * n + n);
  const vector = state.temporal.vectorCache.subarray(tt * n * 3, tt * n * 3 + n * 3);
  const defect = state.temporal.defectWorldline[tt];
  return hashCertifiedPayload({
    constitutionId: state.constitutionId,
    seed: state.seed,
    t: tt,
    scalar,
    vector,
    defect,
  });
}
