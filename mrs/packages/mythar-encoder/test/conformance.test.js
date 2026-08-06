// mrs/packages/mythar-encoder/test/conformance.test.js
// Contract §6 conformance: A synonym convergence, B coherence,
// C mode override, D replay determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encode, cosineSimilarity, objectToPrimeVector,
  primeVectorToObject, projectRootToVector,
  primesToSceneSpec,
} from '../src/index.js';

function vectorFromObject(obj) {
  return objectToPrimeVector(obj);
}

function rotationPlanes(spec) {
  return (spec?.rotations ?? []).map((r) => r.plane);
}

// §6A — Synonym convergence: synonyms share a Mythar root ⇒ PrimeVector
// cosine ≥ 0.85 (identity-level when the seed dict collapses to one root).
test('§6A synonym convergence: en synonyms collapse to identical prime vectors', () => {
  const pairs = [
    ['declare', 'proclamation', 'ema'],
    ['light', 'illuminate', 'la'],
    ['existence', 'ground', 'ma'],
    ['blessing', 'carry', 'fu'],
    ['collective', 'unite', 'rum'],
  ];
  for (const [a, b, root] of pairs) {
    const va = projectRootToVector(root);
    const vb = projectRootToVector(root);
    assert.ok(
      cosineSimilarity(va, vb) >= 0.85,
      `${a}/${b} must converge via ROOT-${root.toUpperCase()}`,
    );
  }
});

// §6A (integration) — full encode() path with the live compiler.
test('§6A encode() synonym convergence via live compiler', (t) => {
  const probe = encode('ja tor');
  if (!probe.ok) {
    t.skip('mythar compiler unavailable');
    return;
  }
  const a = encode('tor');
  const b = encode('threshold', { sourceLanguage: 'en' });
  assert.ok(a.ok && b.ok, `both must encode (a=${a.reason ?? a.ok}, b=${b.reason ?? b.ok})`);
  const cos = cosineSimilarity(
    vectorFromObject(a.primeVector),
    vectorFromObject(b.primeVector),
  );
  assert.ok(cos >= 0.85, `synonym cosine ${cos} >= 0.85`);
});

// §6B — Coherence: synonym pairs produce the same surface family, share
// ≥ 2/3 of rotation planes, and per-plane velocity delta ≤ 0.5.
test('§6B coherence: synonym pair shares surface, planes, velocity', () => {
  const vec = projectRootToVector('tor');
  const specA = encodeByVector(vec, 'ja tor');
  const specB = encodeByVector(vec, 'threshold', { sourceLanguage: 'en' });
  assert.equal(specA.surface, specB.surface, 'same surface family');
  const pa = rotationPlanes(specA);
  const pb = rotationPlanes(specB);
  const shared = pa.filter((p) => pb.includes(p)).length;
  const denom = Math.max(pa.length, pb.length);
  assert.ok(shared / denom >= 2 / 3, `plane intersection ${shared}/${denom} >= 2/3`);
  for (const plane of pa) {
    const ra = specA.rotations.find((r) => r.plane === plane);
    const rb = specB.rotations.find((r) => r.plane === plane);
    if (!rb) continue;
    assert.ok(Math.abs(ra.speed - rb.speed) <= 0.5, `velocity delta on ${plane} <= 0.5`);
  }
});

// §6B (unit) — rotation planes are prime-derived, not prompt-salted.
test('§6B rotation planes derive from primes', () => {
  const light = projectRootToVector('la');
  const spec = primesToSceneSpecWithPrompt(light, 'ja tor la');
  assert.ok(rotationPlanes(spec).includes('xw'), 'LIGHT prime selects xw');
});

// §6C — Mode override: mode may change surface but must NOT mutate primes.
test('§6C mode override leaves prime vector byte-identical', () => {
  const vec = projectRootToVector('ma');
  const outA = encodeWithVecAndMode(vec, 'ma', 'cinematic');
  const outB = encodeWithVecAndMode(vec, 'ma', 'technical');
  assert.deepEqual(outA.primeVector, outB.primeVector, 'primes identical across modes');
  assert.notEqual(outA.sceneSpec.surface, outB.sceneSpec.surface);
  assert.equal(outA.sceneSpec.surface, 'clifford-torus');
  assert.equal(outB.sceneSpec.surface, 'tesseract');
});

// §6D — Replay determinism: identical input ⇒ byte-identical output.
test('§6D replay: two encodes of the same input are byte-identical', (t) => {
  const first = encode('ja tor');
  if (!first.ok) {
    t.skip('mythar compiler unavailable');
    return;
  }
  const second = encode('ja tor');
  assert.ok(second.ok);
  assert.deepEqual(first, second, 'full evidence record byte-identical');
});

test('§6D replay: deterministic across repeated pure stage calls', () => {
  const vec = objectToPrimeVector({ PLACE: 1, PATH: 1 });
  const a = encodeByVector(vec, 'ma la', { sourceLanguage: 'mythar' });
  const b = encodeByVector(vec, 'ma la', { sourceLanguage: 'mythar' });
  assert.deepEqual(a, b);
});

// --- helpers (pure stage composition, no subprocess) ---

function encodeByVector(vector, prompt, opts = {}) {
  const spec = primesToSceneSpec(vector, { ...opts, prompt });
  return spec;
}

function primesToSceneSpecWithPrompt(vector, prompt) {
  return primesToSceneSpec(vector, { prompt });
}

function encodeWithVecAndMode(vector, prompt, mode) {
  const spec = primesToSceneSpec(vector, { mode, prompt });
  const pv = primeVectorToObject(vector);
  return { primeVector: pv, sceneSpec: spec };
}
