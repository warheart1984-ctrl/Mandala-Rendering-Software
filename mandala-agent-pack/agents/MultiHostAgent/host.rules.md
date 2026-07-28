# Host Rules

1. Browser host must support WebGPU and canvas fallback.
2. Unity host must use `UnityEngine.Rendering` for GPU dispatch.
3. Unreal host must use `RHI` interface for GPU compute.
4. All hosts must maintain determinism boundaries.
5. All hosts must propagate evidence chains correctly.
6. Host-specific code must live in its own directory — no cross-host coupling.
