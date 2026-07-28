# GPU Safety Rules

1. No shell injection in GPU encoder child_process calls.
2. No empty catch blocks in GPU encoder modules.
3. Buffer mapping must use correct `GPUMapMode` flags.
4. Pipeline `storeOp` must never use invalid values.
5. GPU encoding errors must be logged, not silently swallowed.
6. All 11 GPU modules must have unit test coverage.
