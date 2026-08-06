// mrs/packages/mythar-encoder/src/primes.js
// Constitutional closed vocabulary (60 primes) + deterministic root→prime projection.
// Contract: docs/4d-engine/v2/scene-spec/MYTHAR_SCENESPEC_CONTRACT.md §3

export const PRIME_CATEGORIES = {
  entities: ['PERSON', 'ANIMAL', 'BODY', 'SOMETHING', 'PLACE', 'SKY', 'EARTH', 'WATER', 'FIRE', 'PATH', 'WORLD'],
  qualities: ['BIG', 'SMALL', 'GOOD', 'BAD', 'HARD', 'SOFT', 'LIGHT', 'DARK', 'HEAVY', 'SHARP', 'SMOOTH', 'ROUGH'],
  actions: ['MOVE', 'GO', 'COME', 'DO', 'MAKE', 'SEE', 'HEAR', 'SAY', 'THINK', 'WANT', 'HOLD', 'TOUCH', 'PUSH', 'PULL'],
  relations: ['PART', 'ABOVE', 'BELOW', 'INSIDE', 'OUTSIDE', 'NEAR', 'FAR', 'AROUND', 'BETWEEN', 'AGAINST'],
  time: ['NOW', 'BEFORE', 'AFTER', 'LONG-TIME', 'SHORT-TIME'],
  quantity: ['ONE', 'TWO', 'MANY', 'ALL', 'SOME'],
  modality: ['CAN', 'MUST', 'MAYBE'],
};

export const PRIMES = Object.values(PRIME_CATEGORIES).flat();
export const PRIME_COUNT = PRIMES.length;

if (PRIME_COUNT !== 60) {
  throw new Error(`Prime vocabulary must have exactly 60 entries, got ${PRIME_COUNT}`);
}

export const PRIME_INDEX = new Map(PRIMES.map((name, index) => [name, index]));

// --- Fixed constitutional root→prime projection table (v1.0) ---
// Derived from the Mythar registry's declared domains/meanings
// (mythar-registry/registry-v0.1.json + ratified v0.3 `ema`). This table is
// constitutional and FIXED: changing it is a contract revision, not a patch.
// Values are deterministic salience weights ∈ [0,1].

export const ROOT_TO_PRIMES = {
  ma: { SOMETHING: 1, PLACE: 1, WORLD: 1, EARTH: 0.5 },
  la: { LIGHT: 1, SKY: 0.5, GOOD: 0.3 },
  ka: { DARK: 1, BIG: 0.6, NOW: 0.5, MUST: 0.3 },
  ta: { SOMETHING: 0.8, ONE: 0.6, NOW: 0.4 },
  ra: { MANY: 0.8, ALL: 0.5, HEAR: 0.4, SAY: 0.4 },
  fu: { GOOD: 1, WANT: 0.6, MOVE: 0.5 },
  jor: { EARTH: 1, HARD: 0.8, HEAVY: 0.6, BIG: 0.5 },
  tor: { PATH: 1, BETWEEN: 0.6, ABOVE: 0.4, FAR: 0.3 },
  fa: { SOME: 0.8, GOOD: 0.4, DO: 0.3 },
  kie: { PLACE: 1, NEAR: 0.5, FAR: 0.4 },
  wie: { CAN: 0.6, MAYBE: 0.5, SMOOTH: 0.3 },
  ia: { SKY: 1, GOOD: 0.7, PERSON: 0.5, ABOVE: 0.4 },
  rum: { ALL: 1, MANY: 0.8, PERSON: 0.6, PART: 0.3 },
  ema: { SAY: 1, HEAR: 0.6, WANT: 0.3 },
};

// Composite roots (registry-v0.2) = component prime union (max).
export const COMPOSITE_ROOTS = {
  kala: ['ka', 'la'],
  mafu: ['ma', 'fu'],
  ramafa: ['ra', 'ma', 'fa'],
};

function zeroVector() {
  return new Float64Array(PRIME_COUNT);
}

export function createZeroPrimeVector() {
  return zeroVector();
}

export function primeVectorToObject(vector) {
  const out = {};
  for (const [name, index] of PRIME_INDEX) {
    const value = vector[index];
    if (value > 0) out[name] = round3(value);
  }
  return out;
}

export function objectToPrimeVector(weights) {
  const vector = zeroVector();
  for (const [name, value] of Object.entries(weights || {})) {
    const index = PRIME_INDEX.get(name);
    if (index !== undefined && Number.isFinite(value)) vector[index] = value;
  }
  return vector;
}

export function projectRootToVector(root) {
  const weights = ROOT_TO_PRIMES[root];
  if (weights) return objectToPrimeVector(weights);
  const composite = COMPOSITE_ROOTS[root];
  if (composite) {
    const vector = zeroVector();
    for (const part of composite) {
      const partVector = projectRootToVector(part);
      for (let i = 0; i < PRIME_COUNT; i++) {
        vector[i] = Math.max(vector[i], partVector[i]);
      }
    }
    return vector;
  }
  return null;
}

// Merge an ordered list of root surfaces into one PrimeVector (max salience).
export function mergeRootVectors(roots) {
  const vector = zeroVector();
  let resolved = 0;
  for (const root of roots) {
    const part = projectRootToVector(root);
    if (!part) continue;
    resolved += 1;
    for (let i = 0; i < PRIME_COUNT; i++) {
      vector[i] = Math.max(vector[i], part[i]);
    }
  }
  return { vector, resolved };
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < PRIME_COUNT; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.min(1, Math.max(-1, cos));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
