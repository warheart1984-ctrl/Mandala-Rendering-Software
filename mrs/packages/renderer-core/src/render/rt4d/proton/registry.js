/**
 * ProtonRegistry — collect / list / hash protons for soft splat.
 *
 * STATUS: **enforced**
 * Deterministic hash, capacity limits, stable sort by id.
 */

import { createHash } from "node:crypto";
import { MAX_PROTONS } from "./types.js";

/**
 * @typedef {import("./types.js").Proton4D} Proton4D
 */

/** Stable JSON for hashing (sorted object keys). */
function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeys(value[k]);
  }
  return out;
}

/**
 * @param {Proton4D} a
 * @param {Proton4D} b
 */
function compareProtonId(a, b) {
  const ia = String(a?.id ?? "");
  const ib = String(b?.id ?? "");
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

export class ProtonRegistry {
  /**
   * @param {{ maxProtons?: number }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Proton4D[]} */
    this._protons = [];
    this.maxProtons =
      typeof opts.maxProtons === "number" && opts.maxProtons > 0
        ? Math.floor(opts.maxProtons)
        : MAX_PROTONS;
  }

  /**
   * @param {Proton4D} proton
   * @returns {ProtonRegistry}
   */
  add(proton) {
    if (!proton || typeof proton !== "object") {
      throw new Error("ProtonRegistry.add: proton must be an object");
    }
    if (this._protons.length >= this.maxProtons) {
      throw new Error(
        `ProtonRegistry.add: maxProtons cap (${this.maxProtons}) reached`,
      );
    }
    this._protons.push(proton);
    return this;
  }

  /**
   * Stable list sorted by proton id (P4).
   * @returns {readonly Proton4D[]}
   */
  list() {
    return this._protons.slice().sort(compareProtonId);
  }

  /**
   * Deterministic content hash of registered protons (sorted by id).
   * @returns {string}
   */
  hash() {
    const sorted = this.list();
    const payload = sorted.map((p) => ({
      id: p.id ?? null,
      mu: p.mu ?? p.center ?? null,
      radius: p.radius ?? null,
      color: p.color ?? null,
      opacity: p.opacity ?? p.weight ?? null,
    }));
    return createHash("sha256").update(canonicalJson(payload)).digest("hex");
  }

  /** @returns {number} */
  get size() {
    return this._protons.length;
  }

  clear() {
    this._protons = [];
  }
}
