// mrs/packages/mythar-encoder/src/evidence.js
// Evidence bundling (contract §5): PromptRecord + PrimeVector + SceneSpec.
// promptHash is identity-only — it does NOT drive SceneSpec in the v2 path.

import { createHash } from 'node:crypto';
import { primeVectorToObject } from './primes.js';

export function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function buildEvidence({ prompt, mode, sourceLanguage, primeVector, sceneSpec, roots, unresolvedTokens, compilerRefs }) {
  const promptHash = sha256Hex(prompt.toLowerCase());
  return {
    record: {
      version: 1,
      kind: 'mythar_scenespec_evidence',
      promptRecord: {
        sourceLanguage: sourceLanguage ?? 'mythar',
        prompt,
        promptHash,
        mode: mode ?? null,
      },
      primeVector: primeVectorToObject(primeVector),
      sceneSpec,
      provenance: {
        stage1_mythar: {
          source: 'subprocess:python -m mythar compile',
          roots,
          compilerRegistryRefs: compilerRefs ?? [],
        },
        stage2_primes: { table: 'ROOT_TO_PRIMES', version: 'v1.0' },
        stage3_scenespec: { surfaceByMode: Boolean(mode), planes: (sceneSpec?.rotations ?? []).map((r) => r.plane) },
        unresolvedTokens,
      },
      nonClaims: [
        'encoder NOT wired to render_rt4d_from_prompt (v1.5 hash path remains authoritative)',
        'NSM recovery (English→Mythar at scale) unproven; seed dict is the declared scope',
        'conformance thresholds unvalidated against renderer output',
        'promptHash is identity-only; it does not select surface/planes in the v2 path',
      ],
    },
    evidenceBundleId: `ev-${sha256Hex(promptHash + ':' + sceneSpec.surface + ':' + (sceneSpec.rotations ?? []).map((r) => r.plane + r.speed).join(','))}`,
  };
}
