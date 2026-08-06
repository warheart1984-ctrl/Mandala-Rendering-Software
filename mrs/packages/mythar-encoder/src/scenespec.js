// mrs/packages/mythar-encoder/src/scenespec.js
// PrimesToSceneSpec stage (contract §3 stage 3).
// Emits the SAME SceneSpec shape as the deployed buildSceneSpec
// (infra/cdk/lambda/mcp-handler/index.mts) so the renderer codec is unchanged.
// Pure/deterministic — no subprocess, no randomness (P4).

import { PRIME_INDEX } from './primes.js';

export const SURFACES = ['clifford-torus', 'hopf-surface', 'torus-3d', 'trefoil-4d', 'tesseract'];

export const SURFACE_BY_MODE = {
  technical: 'tesseract',
  previz: 'tesseract',
  storyboard: 'trefoil-4d',
  concept: 'torus-3d',
  cinematic: 'clifford-torus',
  final: 'hopf-surface',
};

export const PLANES = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'];

// Fixed constitutional surface-score weights (prime → surface affinity).
// Deterministic, documented; a change is a contract revision.
const SURFACE_WEIGHTS = {
  'torus-3d': { ANIMAL: 0.6, BIG: 0.4, MOVE: 0.8, MANY: 0.3 },
  'clifford-torus': { SKY: 0.4, GOOD: 0.5, WANT: 0.7, MOVE: 0.5 },
  'hopf-surface': { LIGHT: 0.8, SKY: 0.6, DARK: 0.3 },
  'trefoil-4d': { PATH: 0.8, BETWEEN: 0.5, ABOVE: 0.4, SHARP: 0.3 },
  tesseract: { PLACE: 0.7, WORLD: 0.5, SOME: 0.3, EARTH: 0.4 },
};

// Constitutional rotation-plane selection: ordered prime → plane table.
const PLANE_BY_PRIME = [
  ['MOVE', 'xy'],
  ['PATH', 'xw'],
  ['BETWEEN', 'zw'],
  ['GO', 'xz'],
  ['COME', 'yz'],
  ['AROUND', 'yw'],
  ['LIGHT', 'xw'],
  ['SKY', 'yz'],
  ['EARTH', 'xy'],
];

function primeValue(vector, name) {
  return vector[PRIME_INDEX.get(name)] || 0;
}

function topSurface(vector) {
  const scores = SURFACES.map((surface) => {
    const weights = SURFACE_WEIGHTS[surface];
    let score = 0;
    for (const [prime, weight] of Object.entries(weights)) {
      score += primeValue(vector, prime) * weight;
    }
    return { surface, score };
  });
  scores.sort((a, b) => b.score - a.score || SURFACES.indexOf(a.surface) - SURFACES.indexOf(b.surface));
  return scores[0].surface;
}

function selectPlanes(vector) {
  const chosen = [];
  for (const [prime, plane] of PLANE_BY_PRIME) {
    if (primeValue(vector, prime) >= 0.5) chosen.push(plane);
  }
  if (chosen.length === 0) chosen.push('xy');
  return chosen.slice(0, 3);
}

function hashHex(value) {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  return hex;
}

function idFrom(prefix, salt) {
  return `${prefix}-${hashHex(salt).slice(0, 12)}`;
}

// Deterministic transform of (primeVector, {mode, resolution, prompt}) → SceneSpec.
// mode, when provided, is authoritative for the surface (contract §4.1 / §6C).
export function primesToSceneSpec(vector, opts = {}) {
  const { mode, resolution = 128, prompt = '' } = opts;
  const surface = SURFACE_BY_MODE[mode] ?? topSurface(vector);
  const planeNames = selectPlanes(vector);
  const base = prompt.toLowerCase();

  // Velocity/plane selection are PRIME-DERIVED ONLY (semantic), so synonyms
  // with identical primes produce identical motion — §6B convergence holds.
  // The raw prompt text is used for identity fields only (promptHash, ids).
  const semanticSalt = `${surface}:${mode ?? ''}:${planeNames.join('.')}`;
  const rotations = planeNames.map((plane, i) => {
    const speed = Math.round(((parseInt(hashHex(`${semanticSalt}:${plane}:${i}`).slice(0, 2), 16) % 60) / 10 + 0.2) * 100) / 100;
    return { plane, speed };
  });

  const fovX = Math.round(40 + primeValue(vector, 'BIG') * 20);
  const fovY = Math.round(40 + primeValue(vector, 'SMALL') * 20);
  const fovZ = Math.round(6 + primeValue(vector, 'DARK') * 10);
  const fovW = Math.round(6 + primeValue(vector, 'LIGHT') * 10);
  const lensRadius = primeValue(vector, 'SMOOTH') > 0.5 ? 0.06 : 0;
  const distance4d = Math.round((4 + primeValue(vector, 'FAR')) * 10) / 10;
  const distance3d = Math.round((4 + primeValue(vector, 'NEAR')) * 10) / 10;

  const digest = hashHex(base);
  return {
    surface,
    resolution: Math.min(64, Math.max(8, Math.floor((resolution ?? 128) / 8))),
    rotations,
    projection: { type: 'perspective', distance4d, distance3d },
    camera: { fovX, fovY, fovZ, fovW, lensRadius },
    intentId: idFrom('int', `${base}:${mode ?? ''}:${planeNames.join('.')}`),
    timelineId: idFrom('tl', `${base}:${planeNames.join('.')}`),
    worldId: idFrom('world', base),
    promptHash: digest,
  };
}
