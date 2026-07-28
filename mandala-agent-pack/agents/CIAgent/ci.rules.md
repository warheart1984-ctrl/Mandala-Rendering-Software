# CI Rules

1. `npm test` must run without errors.
2. `npm run test:conformance` must pass 16/16 checks.
3. All governance tests must pass before merge.
4. Build steps must be reproducible across CI runners.
5. Environment variables must be validated, not interpolated unsafely.
