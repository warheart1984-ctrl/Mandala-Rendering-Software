/**
 * SeedManager — deterministic seeding for the Singularity Tree.
 *
 * Every random-looking decision in the generative pipeline is driven by
 * explicit integer seeds. The root seed is fixed by configuration; child
 * seeds are derived deterministically from the parent seed and the child
 * index. No uncontrolled random sources are used anywhere in generation.
 *
 * Status: enforced (verified by determinism tests).
 */

const DEFAULT_SEED = 0xc0ffee;

/**
 * Derive a child seed from a parent seed and a child index (splitmix32).
 * Pure integer arithmetic — deterministic across platforms.
 */
export function deriveSeed(parentSeed, index, salt = 0) {
  let z = (parentSeed >>> 0) + Math.imul(index | 0, 0x9e3779b9) + Math.imul(salt | 0, 0x85ebca6b) + 0x6d2b79f5;
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x85ebca6b) >>> 0;
  z = (z ^ (z >>> 13)) >>> 0;
  z = Math.imul(z, 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z >>> 0;
}

/**
 * mulberry32 — deterministic 32-bit PRNG.
 * @param {number} seed unsigned 32-bit seed
 * @returns {() => number} function returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * SeededRng — a deterministic RNG wrapper with uniform + integer helpers.
 */
export class SeededRng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  /** Uniform float in [0, 1). */
  next() {
    return this._next();
  }

  /** Uniform float in [min, max). */
  range(min, max) {
    return min + (max - min) * this._next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** Bernoulli(p). */
  chance(p) {
    return this._next() < p;
  }
}

export class SeedManager {
  constructor(rootSeed = DEFAULT_SEED) {
    this.rootSeed = rootSeed >>> 0;
  }

  /** RNG for the root state. */
  rootRng() {
    return new SeededRng(deriveSeed(this.rootSeed, 0, 1));
  }

  /** RNG for a node given its generation seed. */
  rngFor(seed) {
    return new SeededRng(seed >>> 0);
  }

  /** RNG for a child of a node. */
  childRng(nodeSeed, childIndex) {
    return new SeededRng(deriveSeed(nodeSeed, childIndex, 7));
  }
}

export const SINGULARITY_TREE_SEED_BANNER = "singularity-tree.determinism.v1";