// mrs/packages/mythar-encoder/src/mythar.js
// MytharEncode stage (contract §3 stage 1): subprocess compile + seed dict.
// Mythar (G:\mythar) remains the source of truth; MRS never rewrites it.
// Config is env-overridable (MYTHAR_PYTHON, MYTHAR_PYTHONPATH, MYTHAR_REGISTRY_DIR)
// so the path is not vendor-locked (P5).

import { spawnSync } from 'node:child_process';

// Seed dictionary mirroring mythar-v0.2/src/mythar/semantic_input.py (v0.4 specified
// mappings). This is the DECLARED seed scope, not a phonemic reconstruction
// engine. English path scale-up is a documented future Mythar-side task.
export const ENGLISH_SEED = {
  proclamation: 'ema', declare: 'ema', existence: 'ma', ground: 'ma',
  light: 'la', illuminate: 'la', power: 'ka', test: 'ka',
  threshold: 'tor', cross: 'tor', divinity: 'ia', sanctify: 'ia',
  blessing: 'fu', carry: 'fu', speech: 'ra', speak: 'ra',
  collective: 'rum', unite: 'rum',
};

export const MANDARIN_SEED = {
  光: 'la', 说: 'ra', 神: 'ia', 门: 'tor', 力量: 'ka',
  风: 'fu', 存在: 'ma', 集体: 'rum',
};

export const SUPPORTED_SOURCES = ['mythar', 'en', 'zh'];

export function config() {
  return {
    python: process.env.MYTHAR_PYTHON || 'python',
    pythonPath: process.env.MYTHAR_PYTHONPATH || 'G:\\mythar\\mythar-v0.2\\src',
    registryDir: process.env.MYTHAR_REGISTRY_DIR || 'G:\\mythar\\mythar-registry',
  };
}

// Map one source-language token to a Mythar surface using the seed dict.
// Returns null when the token is not in the seed scope (unresolved).
export function seedLookup(token, sourceLanguage) {
  const dict = sourceLanguage === 'zh' ? MANDARIN_SEED : ENGLISH_SEED;
  const key = sourceLanguage === 'zh' ? token : token.toLowerCase();
  return dict[key] ?? null;
}

// Resolve a full source string to a Mythar expression + unresolved tokens.
export function resolveSource(input, sourceLanguage = 'mythar') {
  if (sourceLanguage === 'mythar') {
    return { mytharExpression: input, unresolvedTokens: [] };
  }
  const tokens = input.trim().split(/[\s,.;:!?()]+/).filter(Boolean);
  const mytharTokens = [];
  const unresolvedTokens = [];
  for (const token of tokens) {
    const mythar = seedLookup(token, sourceLanguage);
    if (mythar) mytharTokens.push(mythar);
    else unresolvedTokens.push(token);
  }
  return { mytharExpression: mytharTokens.join(' '), unresolvedTokens };
}

// Extract semantic surface refs (roots + composites) from compiler output.
// Particles/grammar lexemes are grammatical, not semantic — excluded from the
// prime projection for v1.0 (documented in the contract).
export function extractRootSurfaces(compiled) {
  const refs = Array.isArray(compiled?.registry_refs) ? compiled.registry_refs : [];
  return refs
    .filter((ref) => typeof ref === 'string' && (ref.startsWith('ROOT-') || ref.startsWith('COMP-')))
    .map((ref) => ref.replace(/^(ROOT|COMP)-/, '').toLowerCase());
}

// Run `python -m mythar compile` in a subprocess (deterministic, no server).
export function compileMythar(expression, opts = {}) {
  const cfg = config();
  const env = {
    ...process.env,
    PYTHONPATH: cfg.pythonPath,
    MYTHAR_REGISTRY_DIR: cfg.registryDir,
  };
  const args = ['-m', 'mythar', 'compile', expression];
  if (opts.mode && opts.mode !== 'strict') args.push('--mode', opts.mode);
  const result = spawnSync(cfg.python, args, {
    env,
    encoding: 'utf8',
    timeout: opts.timeout ?? 15000,
    windowsHide: true,
  });
  if (result.error) {
    return { ok: false, reason: 'SPAWN_ERROR', error: String(result.error.message ?? result.error) };
  }
  let compiled = null;
  try {
    compiled = JSON.parse(result.stdout);
  } catch {
    return { ok: false, reason: 'PARSE_ERROR', stdout: result.stdout.slice(0, 500), stderr: result.stderr.slice(0, 500) };
  }
  return {
    ok: true,
    compiled,
    roots: extractRootSurfaces(compiled),
    exitCode: result.status,
  };
}
