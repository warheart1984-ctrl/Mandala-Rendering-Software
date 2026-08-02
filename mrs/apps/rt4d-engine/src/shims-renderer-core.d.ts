// Status: live — ambient type shims for @mrs/renderer-core subpath imports.
// renderer-core package.json exports subpaths without "types" conditions (only the
// root "." and "./node" entries carry types.d.ts), so TS bundler resolution cannot
// find declarations. These ambient modules let the engine import the runtime symbols
// used by renderer.ts (verified by `tsc --noEmit` + the AC1-AC6 suite).
declare module "@mrs/renderer-core/rt4d";
declare module "@mrs/renderer-core/surfaces";
declare module "@mrs/renderer-core/math";
declare module "@mrs/renderer-core/render/rt4d/proton/index.js";
