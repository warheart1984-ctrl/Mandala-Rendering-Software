/**
 * BulkSpacetimeEngine — adapter over mandala/proto certified state (Claim A).
 * Status: **partial**
 */

import {
  createInitialCertifiedState,
  freezeCertifiedSnapshot,
  rehash,
} from "../proto/certified-state.mjs";
import {
  createChamber,
  stepCertified,
} from "../proto/simulation-chamber.mjs";
import { g_munu, makeGmunu, c as PROJECTOR_C } from "./projector.mjs";
import { PROTO_SHAPE, idx } from "../proto/constitution.mjs";

export const BULK_ENGINE_STATUS = "partial";

export class BulkSpacetimeEngine {
  /**
   * @param {object} [opts]
   * @param {object} [opts.state] — existing certified state
   * @param {number} [opts.seed]
   */
  constructor(opts = {}) {
    this.status = BULK_ENGINE_STATUS;
    this.state = opts.state || createInitialCertifiedState({ seed: opts.seed ?? 7 });
    this.chamber = createChamber(opts.constitution);
    this.Metric4D = g_munu;
    this.c = PROJECTOR_C;
  }

  get fields() {
    return {
      scalar: this.state.scalar,
      vector: this.state.vector,
      t: this.state.t,
      shape: this.state.shape,
      hash: this.state.hash,
    };
  }

  get worldlines() {
    return {
      defect: this.state.defect,
      defectWorldline: this.state.temporal?.defectWorldline ?? [],
      status: "partial",
    };
  }

  get g_mu_nu() {
    return this.Metric4D;
  }

  /**
   * Advance bulk by one lawful chamber step (dt lattice unit).
   * Does not bypass AAIS — uses proto stepCertified.
   */
  stepBulk(dt = 1) {
    void dt;
    const hashBefore = this.state.hash;
    stepCertified(this.chamber, this.state);
    return {
      t: this.state.t,
      hashBefore,
      hashAfter: this.state.hash,
      advanced: true,
    };
  }

  /**
   * Sample scalar in a 4D AABB region (inclusive lattice indices).
   * @param {{ t0?:number,t1?:number,x0:number,x1:number,y0:number,y1:number,z0:number,z1:number }} region4D
   */
  sampleBulkRegion(region4D) {
    const shape = this.state.shape || PROTO_SHAPE;
    const samples = [];
    const x0 = region4D.x0 | 0;
    const x1 = region4D.x1 | 0;
    const y0 = region4D.y0 | 0;
    const y1 = region4D.y1 | 0;
    const z0 = region4D.z0 | 0;
    const z1 = region4D.z1 | 0;
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (x < 0 || y < 0 || z < 0 || x >= shape.nx || y >= shape.ny || z >= shape.nz) {
            continue;
          }
          samples.push({
            x,
            y,
            z,
            t: this.state.t,
            phi: this.state.scalar[idx(x, y, z, shape)],
          });
        }
      }
    }
    return { samples, count: samples.length, t: this.state.t };
  }

  freeze() {
    return freezeCertifiedSnapshot(this.state);
  }

  rehash() {
    return rehash(this.state);
  }
}

export function createBulkSpacetimeEngine(opts) {
  return new BulkSpacetimeEngine(opts);
}

void makeGmunu;
