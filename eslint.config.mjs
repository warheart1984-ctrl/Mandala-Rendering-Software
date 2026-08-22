// ESLint flat config for the Mandala Rendering Software monorepo.
//
// Goal: a runnable, high-signal, low-noise lint GATE that catches genuine bugs
// (undefined refs, duplicate keys, unreachable code, const reassignment, parse
// errors) across first-party JavaScript/ESM — NOT a style wall on a large,
// partly-legacy codebase.
//
// Philosophy:
//   * Start from @eslint/js `recommended` (already bug-focused in ESLint 10).
//   * Keep genuinely bug-catching rules as ERRORS (see rules block below).
//   * Dial noisy-but-non-critical rules down to `warn` or `off`.
//   * `no-unused-vars` => warn, ignoring names prefixed with `_`.
//   * Scope linting to first-party JS/MJS/CJS; ignore vendored / generated /
//     non-JS / other-toolchain trees (Python, C#/C++, TS sub-project, etc.).
//
// This gate is intentionally NOT wired into `npm test`; it is an opt-in
// `npm run lint` gate so pre-existing findings do not break the test suite.

import js from '@eslint/js';
import globals from 'globals';

// First-party JS we own and want gated. `eslint .` will only lint files that
// match one of these patterns (other JS is simply skipped, keeping noise low).
const firstParty = [
  '*.js',
  '*.mjs',
  '*.cjs',
  'scripts/**/*.{js,mjs,cjs}',
  'mandala/**/*.{js,mjs,cjs}',
  'mrs/packages/**/src/**/*.{js,mjs,cjs}',
  'engine/**/*.{js,mjs,cjs}',
  'js/**/*.{js,mjs,cjs}',
  'character/**/*.{js,mjs,cjs}',
  'examples/**/*.{js,mjs,cjs}',
];

export default [
  // ---------------------------------------------------------------------------
  // Global ignores: vendored, generated, non-first-party, and non-JS trees.
  // (node_modules is auto-ignored by ESLint, but we list it explicitly too.)
  // ---------------------------------------------------------------------------
  {
    ignores: [
      'node_modules/**',
      '**/node_modules/**',
      'output/**',
      '**/output/**',
      '**/dist/**',
      '**/build/**',
      'vendor/**',
      '**/vendor/**',
      '**/*.min.js',
      'runtime/**',
      '.venv/**',
      '**/.venv/**',
      // Non-JS engine hosts (C#/C++), separate build systems.
      'unity/**',
      'unreal/**',
      'native/**',
      'native-preview/**',
      'mrs/packages/cpp/**',
      // Separate TypeScript sub-project with its own package.json + lint script.
      'FundingOS/**',
    ],
  },

  // ---------------------------------------------------------------------------
  // First-party JS/ESM: recommended rules, dialed for high signal / low noise.
  // ---------------------------------------------------------------------------
  {
    files: firstParty,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        // Bun runtime global (used by tool-lemonade-client.mjs's Bun.file()).
        Bun: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      // --- Kept as ERROR (genuine bug catchers, inherited from recommended) ---
      // no-undef, no-unreachable, no-dupe-keys, no-const-assign, no-cond-assign,
      // no-func-assign, constructor-super, no-obj-calls, getter-return,
      // no-dupe-args, no-dupe-class-members, no-import-assign, no-setter-return,
      // no-this-before-super, use-isnan, valid-typeof, no-class-assign,
      // no-compare-neg-zero, no-new-symbol, no-unsafe-negation, plus parse errors.

      // --- Dialed DOWN: real signals worth seeing, but not gate-breaking ---
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'no-fallthrough': 'warn',
      'no-case-declarations': 'warn',
      'no-misleading-character-class': 'warn',
      'no-async-promise-executor': 'warn',
      'no-irregular-whitespace': 'warn',
      'require-yield': 'warn',
      'no-unsafe-finally': 'warn',
      'no-sparse-arrays': 'warn',
      'no-redeclare': 'warn',
      'no-self-assign': 'warn',
      'no-unexpected-multiline': 'warn',
      'no-loss-of-precision': 'warn',
      'no-useless-catch': 'warn',

      // --- Turned OFF: stylistic / low-value on this codebase ---
      'no-inner-declarations': 'off',
      'no-control-regex': 'off',
      'no-extra-boolean-cast': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // CommonJS files (*.cjs): parse as CommonJS scripts.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },

  // ---------------------------------------------------------------------------
  // Test files: add node:test / jest / mocha-style globals.
  // ---------------------------------------------------------------------------
  {
    files: [
      '**/*.test.{js,mjs,cjs}',
      '**/test/**/*.{js,mjs,cjs}',
      '**/tests/**/*.{js,mjs,cjs}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.jest,
        ...globals.mocha,
      },
    },
  },
];
