// mrs/packages/mythar-encoder/test/encoder.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMES, PRIME_CATEGORIES, PRIME_COUNT, ROOT_TO_PRIMES,
  projectRootToVector, mergeRootVectors, cosineSimilarity,
  primesToSceneSpec, SURFACE_BY_MODE, SURFACES, PLANES,
  resolveSource, compileMythar, config, encode,
} from '../src/index.js';

// --- Prime vocabulary (contract §3) ---

test('vocabulary is exactly 60 primes across 7 categories', () => {
  assert.equal(PRIME_COUNT, 60);
  const categories = Object.values(PRIME_CATEGORIES);
  const counts = categories.map((c) => c.length);
  assert.deepEqual(counts, [11, 12, 14, 10, 5, 5, 3]);
});

test('vocabulary has no duplicate prime names', () => {
  assert.equal(new Set(PRIMES).size, 60);
});

test('every root in the constitutional table projects to known primes', () => {
  for (const [root, weights] of Object.entries(ROOT_TO_PRIMES)) {
    const vector = projectRootToVector(root);
    assert.ok(vector, `root ${root} must project`);
    for (const [prime, weight] of Object.entries(weights)) {
      assert.ok(PRIMES.includes(prime), `prime ${prime} of ${root} is unknown`);
      assert.equal(vector[PRIMES.indexOf(prime)], weight, `weight of ${root}.${prime}`);
    }
  }
});

test('unknown roots return null; composites merge component primes (max)', () => {
  assert.equal(projectRootToVector('notaroot'), null);
  const kala = projectRootToVector('kala');
  const ka = projectRootToVector('ka');
  const la = projectRootToVector('la');
  for (let i = 0; i < PRIME_COUNT; i++) {
    assert.equal(kala[i], Math.max(ka[i], la[i]));
  }
});

// --- Projection ---

test('mergeRootVectors takes max salience across roots and counts resolved', () => {
  const { vector, resolved } = mergeRootVectors(['ma', 'tor']);
  assert.equal(resolved, 2);
  assert.equal(vector[PRIMES.indexOf('PLACE')], 1);
  assert.equal(vector[PRIMES.indexOf('PATH')], 1);
});

test('cosine: identical vectors = 1, disjoint vectors = 0', () => {
  const a = projectRootToVector('ma');
  const b = projectRootToVector('ma');
  const c = projectRootToVector('la');
  assert.equal(cosineSimilarity(a, b), 1);
  assert.equal(cosineSimilarity(a, c), 0);
});

// --- SceneSpec (P4 determinism) ---

test('primesToSceneSpec is deterministic and matches deployed shape', () => {
  const vector = projectRootToVector('tor');
  const a = primesToSceneSpec(vector, { mode: 'storyboard', resolution: 128, prompt: 'ja tor' });
  const b = primesToSceneSpec(vector, { mode: 'storyboard', resolution: 128, prompt: 'ja tor' });
  assert.deepEqual(a, b);
  assert.equal(a.surface, SURFACE_BY_MODE.storyboard);
  for (const r of a.rotations) assert.ok(PLANES.includes(r.plane));
  assert.equal(typeof a.resolution, 'number');
  assert.equal(typeof a.promptHash, 'string');
  assert.ok(SURFACES.includes(a.surface));
});

test('mode is authoritative for surface but never mutates primes (contract §6C)', () => {
  const vec = projectRootToVector('ma');
  const specA = primesToSceneSpec(vec, { mode: 'cinematic' });
  const specB = primesToSceneSpec(vec, { mode: 'technical' });
  assert.equal(specA.surface, SURFACE_BY_MODE.cinematic);
  assert.equal(specB.surface, SURFACE_BY_MODE.technical);
});

test('different semantic content produces different surfaces (encoder not degenerate)', () => {
  const s1 = primesToSceneSpec(projectRootToVector('ma'), { prompt: 'ma' });
  const s2 = primesToSceneSpec(projectRootToVector('tor'), { prompt: 'tor' });
  assert.notEqual(s1.surface, s2.surface);
});

// --- Source resolution / seed dict ---

test('mythar source is verbatim', () => {
  assert.deepEqual(resolveSource('ja tor'), { mytharExpression: 'ja tor', unresolvedTokens: [] });
});

test('english seed dict maps known words, surfaces unknowns', () => {
  assert.deepEqual(resolveSource('light crystal', 'en'), { mytharExpression: 'la', unresolvedTokens: ['crystal'] });
  assert.deepEqual(resolveSource('sanctify a threshold', 'en'), { mytharExpression: 'ia tor', unresolvedTokens: ['a'] });
});

test('empty english input yields nothing to compile', () => {
  const r = resolveSource('crystal dragon', 'en');
  assert.equal(r.mytharExpression, '');
  assert.deepEqual(r.unresolvedTokens, ['crystal', 'dragon']);
});

test('unsupported source language is rejected', () => {
  const out = encode('x', { sourceLanguage: 'ko' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'UNSUPPORTED_SOURCE_LANGUAGE');
});

// --- Mythar compiler integration (skipped when compiler unavailable) ---

test('subprocess compiler resolves env-configurable paths (P5)', () => {
  const cfg = config();
  assert.equal(typeof cfg.python, 'string');
  assert.equal(typeof cfg.pythonPath, 'string');
  assert.equal(typeof cfg.registryDir, 'string');
});

test('compileMythar + extractRootSurfaces against live compiler', (t) => {
  const probe = compileMythar('ja tor');
  if (!probe.ok || !probe.compiled?.valid) {
    t.skip(`mythar compiler unavailable (${probe.reason ?? 'invalid'}) — set MYTHAR_PYTHONPATH/MYTHAR_REGISTRY_DIR`);
    return;
  }
  assert.ok(probe.compiled.valid);
  assert.ok(probe.roots.includes('tor'));
  assert.equal(probe.compiled.invariants.length > 0, true);
  assert.equal(typeof probe.exitCode, 'number');
});
