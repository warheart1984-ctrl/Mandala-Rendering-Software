# Test Patterns

1. Use `node:test` with `describe`/`it` blocks.
2. Use `node:assert/strict` for assertions.
3. Mock WebGPU device objects for GPU tests.
4. Test constructor defaults, edge cases, and error paths.
5. Test pure functions directly; use dependency injection for side-effect-heavy code.
