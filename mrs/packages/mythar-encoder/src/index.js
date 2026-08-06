// mrs/packages/mythar-encoder/src/index.js
// Public API for the Mythar → NSM prime → SceneSpec encoder (v2, declared).

import { compileMythar, resolveSource, SUPPORTED_SOURCES } from './mythar.js';
import { mergeRootVectors } from './primes.js';
import { primesToSceneSpec } from './scenespec.js';
import { buildEvidence } from './evidence.js';

/**
 * Encode a Mythar expression (or seed-dict English/Mandarin) into a SceneSpec
 * with full evidence. Deterministic and replayable (P4).
 *
 * @param {string} input - Mythar expression or seed-dict source-language text
 * @param {{mode?: string, sourceLanguage?: 'mythar'|'en'|'zh', resolution?: number}} [opts]
 * @returns {{ok: boolean, reason?: string, unresolvedTokens?: string[], error?: string, ...evidence}}
 */
export function encode(input, opts = {}) {
  const sourceLanguage = opts.sourceLanguage ?? 'mythar';
  if (!SUPPORTED_SOURCES.includes(sourceLanguage)) {
    return { ok: false, reason: 'UNSUPPORTED_SOURCE_LANGUAGE', error: `sourceLanguage must be one of ${SUPPORTED_SOURCES.join(', ')}` };
  }

  const { mytharExpression, unresolvedTokens } = resolveSource(input, sourceLanguage);

  if (!mytharExpression.trim()) {
    return {
      ok: false,
      reason: 'UNRESOLVED_PROMPT',
      unresolvedTokens,
      error: 'no token resolved through the seed dict — nothing to compile (no silent hash fallback)',
    };
  }

  const compiled = compileMythar(mytharExpression, { mode: opts.mode === 'lenient' ? 'lenient' : 'strict' });
  if (!compiled.ok) {
    return { ok: false, reason: compiled.reason, error: compiled.error ?? compiled.stderr ?? 'compile failed', unresolvedTokens };
  }
  if (!compiled.compiled?.valid) {
    return {
      ok: false,
      reason: 'COMPILE_INVALID',
      error: 'mythar compiler rejected the expression (invalid)',
      unresolvedTokens,
      diagnostics: compiled.compiled?.diagnostics ?? null,
    };
  }

  const { vector, resolved } = mergeRootVectors(compiled.roots);
  if (resolved === 0) {
    return {
      ok: false,
      reason: 'NO_SEMANTIC_ROOTS',
      error: 'expression parsed but contained no root/composite surfaces to project',
      unresolvedTokens,
      registryRefs: compiled.compiled?.registry_refs ?? [],
    };
  }

  const sceneSpec = primesToSceneSpec(vector, { mode: opts.mode, resolution: opts.resolution, prompt: input });
  const evidence = buildEvidence({
    prompt: input,
    mode: opts.mode,
    sourceLanguage,
    primeVector: vector,
    sceneSpec,
    roots: compiled.roots,
    unresolvedTokens,
    compilerRefs: compiled.compiled?.registry_refs ?? [],
  });

  return { ok: true, ...evidence.record, evidenceBundleId: evidence.evidenceBundleId };
}

export { PRIMES, PRIME_CATEGORIES, PRIME_COUNT, ROOT_TO_PRIMES, mergeRootVectors, cosineSimilarity, projectRootToVector, primeVectorToObject, objectToPrimeVector } from './primes.js';
export { SURFACES, SURFACE_BY_MODE, PLANES, primesToSceneSpec } from './scenespec.js';
export { ENGLISH_SEED, MANDARIN_SEED, compileMythar, resolveSource, extractRootSurfaces, config } from './mythar.js';
export { buildEvidence, sha256Hex } from './evidence.js';
