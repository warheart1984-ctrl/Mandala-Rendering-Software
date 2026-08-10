# Governed Heterogeneous Rendering
## A Sovereign CPU Architecture for Universal, Verifiable GPU Delegation

### Abstract

Modern compute architectures often equate capability with hardware scale: more VRAM, newer accelerators, larger models, and increasingly specialized execution environments. This paper presents a different approach.

**Governed Heterogeneous Rendering (GHR)** treats heterogeneous hardware not as a collection of competing execution authorities, but as a hierarchy in which a **sovereign CPU reference system** retains control over orchestration, provenance, determinism, validation, and conformance while accelerator devices operate as **assist-only backends** under an explicit delegation contract.

The architecture was validated on a 4 GB AMD RX 580 (Ellesmere). Although this device does not provide a supported ROCm path for the target environment, its OpenCL 2.0 AMD-APP capability was sufficient to implement a measured and governed rendering kernel. The resulting system demonstrates that useful acceleration does not require treating legacy hardware as a general-purpose AI platform.

The RX 580 implementation currently provides a focused capability:

> `gpu.compute.amd.legacy_efficient`

It is deliberately limited to still-image rendering at 256²–512² resolution. Within those limits, the accelerator produces byte-exact results against a verified CPU reference implementation.

Measured results include (range across runs on Windows host; GPU device time stable, CPU wall time varies with OS scheduling):

* **512²:** 0.9–1.2 ms GPU wall time versus 68–72 ms CPU — **27–77× wall-clock acceleration range**
* **256²:** 0.5–0.6 ms GPU wall time versus 10–12 ms CPU — **19–27× wall-clock acceleration range**
* **256²/512² output:** byte-identical to CPU reference (hash match true)
* **RMSE:** 0.0
* **Determinism:** identical hashes across independent runs (D2)
* **Conformance:** 16/16 Universal Conformance Gate checks pass per measured run
* **Verification paths:** production validation, end-to-end testing, and benchmarking all establish bit-exact parity

The benchmark variance (earlier reports cited 19.4×/55.9×; later runs 21.8×/76.7×; conformance-instrumented runs 26.9×/36.9×) is due to CPU wall-time variance under Windows OS scheduling; GPU device time is stable (~5 µs at 256², ~13 µs at 512²). The stable claims are byte-exact parity, D2 determinism, device time, and 16/16 conformance.

The central thesis is that **universal does not mean one kernel**.

Universal means a **governed delegation framework with swappable backends**, a common conformance gate, a kernel registry, and an out-of-core tiling/streaming layer capable of adapting workloads to different accelerator memory capacities.

The architecture therefore seeks to scale capability without surrendering authority.

---

# 1. Introduction

GPU acceleration is commonly presented as a hardware problem.

If a workload becomes larger, the conventional response is to acquire a larger GPU. If a workload requires a specialized compute framework, the solution is often to replace the device with one supporting the desired framework. If VRAM becomes a constraint, the solution is more VRAM.

This paper explores a different proposition:

> **Efficiency, correctness, delegation, and governance can sometimes provide more architectural leverage than hardware scale.**

The initial proof point is intentionally modest.

A 4 GB AMD RX 580 is not presented as a modern AI accelerator. It does not magically acquire ROCm support. It is not transformed into a general-purpose machine-learning platform.

Instead, its usable OpenCL capability is isolated behind a trust boundary and assigned a narrowly defined role.

The CPU remains authoritative.

The GPU assists.

This distinction is foundational.

---

# 2. The Architectural Principle

The system is built around five principles.

### 2.1 The CPU is sovereign

The CPU reference implementation is the source of truth.

It owns:

* orchestration
* governance
* provenance
* validation
* conformance
* deterministic reference behavior
* system-of-record output
* authority over final acceptance

The accelerator cannot redefine correctness.

### 2.2 Accelerators are delegates

A GPU is not an independent authority.

It receives work through a delegation contract, executes an approved operation, returns its result, and submits that result to the conformance layer.

The accelerator therefore operates under a simple architectural rule:

> **Execution authority may be delegated; system authority may not.**

### 2.3 Correctness precedes acceleration

The first optimization target is not raw execution time.

It is correctness.

A GPU implementation that is 100× faster but produces subtly different output is not necessarily an acceleration of the same computation. It may instead be a different computation.

The CPU reference therefore establishes the mathematical and byte-level contract before acceleration is considered successful.

### 2.4 Hardware capabilities are declared honestly

The system does not infer capabilities from marketing categories.

The RX 580 is not labeled a ROCm accelerator because it is AMD hardware.

It is classified according to what was actually demonstrated:

`gpu.compute.amd.legacy_efficient`

This is a **focused GPU capability**, not a general AI/compute layer.

### 2.5 Governance is part of the architecture

Governance is not an external policy document.

It is implemented as a runtime architectural boundary.

The GPU is explicitly denied authority associated with:

* print safeguards
* system-of-record decisions
* determinism authority
* provenance authority
* conformance authority

This allows acceleration without transferring constitutional control.

---

# 3. The Sovereign CPU / Assist-Layer Model

The architecture can be expressed as follows:

```text
┌─────────────────────────────────────────────────────────────┐
│  SOVEREIGN CPU (SoT)                                        │
│                                                             │
│  • Orchestration                                            │
│  • Governance                                                │
│  • Provenance                                                │
│  • Conformance                                               │
│  • Reference implementation                                  │
│  • Deterministic system of truth                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Delegation Contract
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ASSIST LAYER — PLUGGABLE BACKENDS                          │
│                                                             │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐           │
│  │  CUDA   │ │ HIP/ROCm │ │ OpenCL  │ │ WebGPU  │   ...     │
│  │ NVIDIA  │ │   AMD    │ │ Legacy  │ │ Browser │           │
│  └────┬────┘ └────┬─────┘ └────┬────┘ └────┬────┘           │
│       │            │             │            │               │
│       └────────────┴─────────────┴────────────┘               │
│                           │                                  │
│              ┌────────────┴────────────┐                    │
│              │   TILING / STREAMING     │                    │
│              │      OUT-OF-CORE         │                    │
│              │                          │                    │
│              │  Handles differing VRAM  │                    │
│              │  capacities              │                    │
│              └────────────┬────────────┘                    │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            │ Byte-Exact Parity Proof
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  CONFORMANCE GATE                                           │
│                                                             │
│  • Same validation contract for every backend               │
│  • Determinism                                               │
│  • Provenance                                                │
│  • Replayability                                             │
│  • Byte-level correctness                                    │
│  • Backend-independent acceptance criteria                  │
└─────────────────────────────────────────────────────────────┘
```

This structure is intentionally asymmetric.

The CPU is the authority.

The assist layer is replaceable.

The conformance gate is universal.

---

# 4. Universal Does Not Mean One Kernel

A common architectural mistake is to confuse universality with a universal implementation.

A single kernel cannot realistically represent every combination of:

* resolution
* workload type
* hardware architecture
* memory capacity
* execution API
* quality target
* latency requirement
* throughput requirement

Therefore, the universal property belongs above the kernel.

The system is universal because it provides a common **delegation and verification protocol**.

The backend implementation may change.

The kernel may change.

The device may change.

The execution API may change.

The conformance contract does not.

This yields the central architectural equation:

> **Universal = governed delegation framework + swappable execution backends + common conformance**

rather than:

> Universal = one kernel that runs everywhere.

---

# 5. AssistBackend Interface

The assist layer exposes a standardized backend abstraction.

A conceptual interface is:

```text
AssistBackend

    init()
    execute(kernel, params)
    readback()
    teardown()
```

The interface deliberately abstracts away the underlying execution technology.

A CUDA backend may use NVIDIA hardware.

A HIP/ROCm backend may use a modern AMD accelerator.

An OpenCL backend may operate on legacy AMD hardware.

A WebGPU backend may operate inside a browser or compatible runtime.

The governing CPU does not need to grant these implementations independent authority.

It only needs to know:

1. how to initialize the delegate,
2. how to submit approved work,
3. how to retrieve the result,
4. how to terminate the delegated session.

The result then enters the same validation pipeline regardless of backend.

---

# 6. Kernel Registry

The architecture separates the **operation** from its available implementations.

A kernel registry can contain multiple implementations for a single conceptual operation.

For example:

```text
Kernel Registry

still-256
    ├── cpu-reference
    ├── opencl-legacy
    ├── cuda
    ├── hip
    └── webgpu

still-512
    ├── cpu-reference
    ├── opencl-legacy
    ├── cuda
    └── hip

still-4k
    ├── cpu-reference
    ├── cuda
    ├── hip
    └── tiled-opencl

video-tile
    ├── cpu-reference
    ├── cuda
    ├── hip
    └── webgpu
```

The `QualitySelector` or equivalent scheduling layer can select an implementation based on:

* resolution
* quality
* device capability
* available memory
* expected execution cost
* determinism requirements
* backend availability
* workload type

The user therefore selects a workload and quality target rather than manually selecting hardware instructions.

---

# 7. The RX 580 Proof of Concept

The 4 GB RX 580 (Ellesmere) provides the first concrete demonstration of this architecture.

Its role is deliberately constrained.

### Capability

```text
gpu.compute.amd.legacy_efficient
```

### Backend

```text
OpenCL 2.0 AMD-APP
```

### Current kernel

```text
legacy_still
```

### Supported range

```text
256² – 512²
```

### Workload

```text
Still rendering
```

### Governance

```text
Assist-only
```

### ROCm status

```text
Not supported / not claimed
```

This distinction is important.

The architecture does not attempt to force an unsupported software stack onto legacy hardware.

Instead, it identifies the actual usable execution path and wraps that path in the same governance model used for future backends.

---

# 8. Memory Efficiency Changes the Hardware Equation

The experiment also demonstrates a second architectural principle:

> **VRAM capacity is only a fundamental limitation when the workload architecture requires the entire workload to reside in VRAM simultaneously.**

The measured still outputs are extremely small relative to a 4 GB framebuffer.

Typical 256²–512² still outputs occupy approximately 0.25–1 MB.

Consequently, the RX 580's 4 GB memory capacity is not the limiting resource for this class of workload.

This changes the optimization strategy.

Instead of asking:

> "How much VRAM does the GPU have?"

the architecture asks:

> "How much state must actually be resident on the accelerator at any one time?"

This distinction becomes even more important when combined with the proposed tiling and streaming layer.

---

# 9. Out-of-Core Tiling and Streaming

The universal architecture cannot assume that the accelerator has sufficient memory for an entire workload.

Therefore, workloads exceeding available accelerator memory are divided into independently managed tiles.

Conceptually:

```text
CPU Workload
     │
     ▼
┌───────────────┐
│ Tiling Engine │
└───────┬───────┘
        │
   ┌────┼────┬────┐
   ▼    ▼    ▼    ▼
 Tile  Tile Tile Tile
   │    │    │    │
   ▼    ▼    ▼    ▼
 GPU execution
   │    │    │    │
   └────┼────┴────┘
        ▼
   CPU reassembly
        │
        ▼
 Conformance Gate
```

**Status note:** The tiling engine (`TilingEngine.js`) is implemented but has not been exercised on workloads exceeding device VRAM in this proof of concept. The 256²–512² still outputs fit entirely in VRAM. The out-of-core path remains **declared** / **unexercised**; it is not yet a verified capability.

This enables a workload to exceed device VRAM while preserving a CPU-controlled system of record.

The GPU does not need to possess the entire world.

It only needs enough memory to process the current delegated region.

The CPU retains:

* global ordering
* tile identity
* provenance
* reassembly
* final validation
* final authority

This is the mechanism by which a 4 GB device can participate in a larger universal rendering architecture without pretending to possess unlimited memory.

---

# 10. Correctness Before Performance

One of the most important findings from the RX 580 implementation is that the major engineering challenge was not GPU execution speed.

The device execution time was already approximately:

```text
5 µs
```

The difficult problem was proving that the GPU implementation actually computed the same operation as the CPU reference.

A correction to the CPU reference implementation was required around the `smoothstep`/`fp32` behavior. The original CPU reference used a different `smoothstep` edge order (`smoothstep(0.55, 0.92, r2)`) and lacked explicit `np.float32` casts, causing divergence from the OpenCL kernel's `smoothstep(0.92, 0.55, r2)` semantics and fp32 rounding path. The CPU reference was corrected post hoc to match the GPU's exact operation order and fp32 rounding.

This illustrates a general principle:

> **Optimization exposes correctness assumptions.**

A CPU implementation may appear correct because its output looks correct.

A GPU implementation forces the system to specify the operation more precisely.

Floating-point behavior, interpolation, normalization, precision, ordering, and conversion semantics must become explicit.

The resulting architecture therefore treats the reference implementation as a verified specification rather than merely a convenient implementation.

---

# 11. Byte-Exact Parity

The accelerator is not accepted merely because the rendered image looks visually similar.

The acceptance criterion is substantially stronger.

The GPU output must satisfy the conformance contract against the CPU reference.

For the demonstrated 256²/512² workloads:

```text
hash_match: true
RMSE:        0.0
```

The result is byte-identical.

**Clarification:** Byte-exact parity was achieved by correcting the CPU reference to match the GPU's fp32 operation order and `smoothstep(0.92, 0.55, r2)` edge semantics. This demonstrates internal self-consistency of the pair, not independent verification of the GPU against a pre-existing specification that existed before the GPU implementation. The GPU output is the de facto ground truth for this kernel; the CPU reference was made to agree with it.

This distinction is critical.

Visual similarity establishes that two outputs may appear equivalent.

Byte-exact parity establishes that they are equivalent under the defined serialization and rendering contract.

The latter is considerably more useful for:

* deterministic pipelines
* regression testing
* caching
* reproducibility
* provenance
* replay
* auditability

---

# 12. Determinism as a First-Class Property

The system operates under a D2 determinism target (identical hashes across independent runs on the same hardware/backend). D1 (cross-platform, cross-backend bit-exact) is not claimed.

Independent executions produce identical hashes.

This allows rendering to be treated as a replayable computation rather than a probabilistic artifact.

A successful execution can therefore be represented conceptually as:

```text
Input
  +
Parameters
  +
Kernel identity
  +
Backend identity
  +
Version
  +
Execution contract
  ↓
Deterministic result
  ↓
Hash
  ↓
Provenance record
```

A future execution can reproduce the operation and verify the resulting hash.

The accelerator therefore contributes computation without becoming the source of truth for whether that computation was valid.

---

# 13. Three Independent Verification Paths

The architecture is intentionally redundant in verification.

The RX 580 implementation has been validated through three independent paths:

1. production validation
2. end-to-end validation
3. benchmark validation

All three establish bit-exact behavior.

This is more than conventional unit testing.

It creates a layered confidence model:

```text
Implementation
      │
      ▼
Production Validation
      │
      ▼
End-to-End Validation
      │
      ▼
Benchmark Validation
      │
      ▼
Cross-run Determinism
      │
      ▼
Conformance
```

The philosophy is:

> **Verify, test, verify again.**

Verification is therefore not an afterthought attached to the accelerator.

It is the mechanism through which the accelerator earns permission to participate in the system.

---

# 14. Performance Results

The current measured results demonstrate that the governance layer does not eliminate the usefulness of legacy hardware.

| Resolution | GPU Wall (ms) | CPU Wall (ms) | Speedup Range | GPU Device (µs) | Parity     | Conformance |
| ---------- | ------------: | ------------: | ------------: | --------------: | ---------- | ----------- |
| 256²       | 0.5–0.6       | 10–12         | 19–27×        | ~5.1            | Byte-exact | 16/16 pass  |
| 512²       | 0.9–1.2       | 68–72         | 27–77×        | ~13.6           | Byte-exact | 16/16 pass  |

**Speedup variance explanation:** GPU device time is stable (OpenCL event profiling). CPU wall time varies with Windows OS scheduling load. The earlier report (19.4×/55.9×) and later run (21.8×/76.7×) and conformance-instrumented run (26.9×/36.9×) reflect this host-load variance. The stable claims are byte-exact parity, D2 determinism, GPU device time, and 16/16 conformance.

The 512² result is particularly significant: even at the low end of the range (~27×), the system achieves substantial wall-clock acceleration while retaining the CPU as the authoritative reference and conformance authority.

The performance improvement therefore does not come from weakening the trust model.

It comes from delegation.

---

# 15. Correctness Created the Performance Opportunity

An important architectural observation emerges from the measurements.

The final speedup was not primarily achieved by attempting to optimize everything simultaneously.

The progression was:

```text
Reference correctness
        ↓
Byte-exact parity
        ↓
Verified delegation
        ↓
GPU execution
        ↓
Measured acceleration
```

This ordering matters.

Without a correct reference, performance measurements become ambiguous.

Without parity, a speedup may represent a different computation.

Without governance, the accelerator becomes difficult to trust.

The architecture therefore makes correctness an enabling technology for optimization.

---

# 16. The Governance Boundary

The CPU/GPU boundary can be summarized as follows:

| Function                       | CPU         | GPU                  |
| ------------------------------ | ----------- | -------------------- |
| Orchestration                  | Authority   | No                   |
| System of Truth                | Authority   | No                   |
| Provenance                     | Authority   | Contributes metadata |
| Reference computation          | Authority   | No                   |
| Execution                      | May execute | Assist               |
| Print authority                | Authority   | Denied               |
| Determinism authority          | Authority   | Must demonstrate     |
| Conformance decision           | Authority   | No                   |
| Hardware-specific optimization | Optional    | Yes                  |
| Readback                       | Authority   | Provides result      |

This prevents a common failure mode in heterogeneous systems: allowing an accelerator to gradually become an implicit authority because it happens to execute the fastest path.

Performance does not grant sovereignty.

---

# 17. The Conformance Gate

The conformance gate is the universal layer of the architecture.

Every backend, regardless of implementation technology, must satisfy the same contract.

Conceptually:

```text
             Backend Result
                    │
                    ▼
          ┌───────────────────┐
          │ Conformance Gate  │
          └─────────┬─────────┘
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
 Determinism   Provenance    Correctness
       │            │            │
       └────────────┼────────────┘
                    ▼
              Replayability
                    │
                    ▼
              ACCEPT / REJECT
```

The backend therefore cannot define its own acceptance criteria.

A CUDA backend does not receive a different definition of correctness.

A WebGPU backend does not receive a weaker definition.

An OpenCL legacy backend does not receive a special exception.

The execution technology changes.

The constitution does not.

---

# 18. Conformance Suite — Now Individually Recorded

The architecture's conformance gate (§17) is now exercised via the **Universal Conformance Gate** (`engine/governance/UniversalConformanceGate.js` — the SoT gate used by the Constitutional Engine). Each benchmark run invokes all 16 checks against the measured run's data (GPU/CPU output bytes, kernel capabilities, provenance record, host OpenCL handle snapshot, governed memory-access log).

**Verified status (both 256² and 512², conformance-instrumented runs):** 16/16 checks pass. Each check's basis documents where its input came from (measured GPU bytes, measured CPU bytes, static kernel caps, UALS provenance hash, host handle snapshot, memory-access log).

The 16 checks cover:
- input normalization, parameter validity, kernel identity, backend identity
- output shape, output encoding, numerical correctness, byte-level parity
- hash consistency, deterministic replay, provenance completeness
- tile integrity, reassembly integrity, error handling
- authority boundaries, final system-of-record acceptance

This replaces the earlier "three verification paths" (§13) with an individually auditable, per-check pass/fail recording that is embedded in the benchmark evidence (`evidence.json` v1.1.0, field `conformance`).

---

# 19. Provenance

Every delegated operation should retain enough information to explain how the result was produced.

A conceptual provenance record can contain:

```text
operation
kernel
kernel_version
backend
backend_version
device
parameters
input_hash
output_hash
resolution
tile_configuration
validation_result
determinism_result
timestamp
```

The purpose is not merely debugging.

Provenance makes accelerated rendering auditable and replayable.

A result should not merely say:

> "The GPU produced this."

It should be possible to establish:

> "This exact operation, with these parameters and this kernel version, was delegated to this backend, returned this result, and passed the same conformance contract as every other backend."

---

# 20. The 4 GB RX 580 as a First-Class Backend

The architectural result is therefore not:

> "An RX 580 is equivalent to a modern GPU."

That claim would be false.

The correct conclusion is:

> **A legacy 4 GB RX 580 can become a first-class still-rendering accelerator when its demonstrated capability is isolated, governed, measured, and verified.**

Its current identity is intentionally narrow:

```text
legacy_still_256_512
backend = opencl
device = AMD RX 580 (Ellesmere)
role = assist
authority = none
determinism = D2
parity = byte-exact
conformance = 16/16 UniversalConformanceGate
```

This is an important distinction between **capability** and **marketing category**.

A device does not need to be classified as "AI-capable" to be useful.

It needs a workload it can execute correctly.

---

# 21. One-Command Reproducibility — With Caveat

The architecture provides an operational proof mechanism:

```text
npm run sx:axiom-bench -- --width 256 --height 256 --out-dir tmp/axiom-x-bench-256
npm run sx:axiom-bench -- --width 512 --height 512 --out-dir tmp/axiom-x-bench-512
```

This transforms the performance claim from a one-time observation into a repeatable experiment **on a machine that has the `axiom_x/` source tree**.

**Caveat:** The `axiom_x/` directory is **not committed to the repository** (not tracked by git, not in `.gitignore`). A fresh clone will not have the benchmark runner or the conformance shim. The one-command proof works in the development environment but is not yet reproducible from a clean checkout. Committing `axiom_x/` is a prerequisite for the reproducibility claim to hold externally.

A benchmark becomes substantially more valuable when another execution can independently establish:

* the same workload
* the same performance measurement methodology
* the same correctness result
* the same deterministic output
* the same 16/16 conformance verdict

---

# 22. Why the Architecture Scales

The architecture is intentionally designed so that the RX 580 implementation is not the destination.

It is the first backend.

Today:

```text
legacy_still_256_512
        │
        └── OpenCL / RX 580
```

Tomorrow:

```text
Kernel Registry
      │
      ├── CPU reference
      ├── CUDA
      ├── HIP/ROCm
      ├── OpenCL
      ├── WebGPU
      └── future backends
```

The CPU orchestration layer remains stable.

The conformance layer remains stable.

The delegation contract remains stable.

Only the assist implementation changes.

This is the primary scalability property.

---

# 23. Hardware Independence Through Delegation

The system can therefore support hardware diversity without requiring architectural duplication.

A future machine might contain:

* an NVIDIA GPU
* an AMD GPU
* an integrated GPU
* a legacy accelerator
* a browser WebGPU environment
* no accelerator at all

The same conceptual workload can remain valid.

The selector determines which backend is appropriate.

If no accelerator satisfies the required contract, the CPU reference implementation remains available.

This produces graceful degradation rather than architectural failure.

```text
Best accelerator available?
        │
     Yes ──────► Delegate
        │
       No
        │
        ▼
 CPU reference execution
```

The accelerator improves performance.

It does not define whether the system can function.

---

# 24. Efficiency Over Hardware Scale

The RX 580 experiment demonstrates a broader engineering philosophy.

If a workload consumes only a fraction of available memory, buying additional VRAM does not automatically solve the actual bottleneck.

If GPU execution is already extremely fast, optimizing the CPU reference or reducing unnecessary synchronization may provide greater gains than replacing the GPU.

If correctness is uncertain, adding hardware does not solve the fundamental problem.

Therefore:

> **Architecture should optimize the actual constraint, not the presumed constraint.**

In this case, the important constraints were:

1. correctness
2. deterministic behavior
3. delegation safety
4. efficient execution

not raw framebuffer capacity.

---

# 25. Limitations

The current implementation must be described conservatively.

It does **not** establish:

* general-purpose AI acceleration
* ROCm support for the RX 580
* arbitrary GPU workload support
* video rendering support
* unlimited resolution
* universal kernel compatibility
* performance parity across all devices
* arbitrary floating-point workloads without validation
* D1 (cross-platform) determinism
* out-of-core tiling on >VRAM workloads
* one-command reproducibility from a fresh clone (`axiom_x/` not committed)

The current proven capability is:

```text
OpenCL 2.0 AMD-APP
+
RX 580 (Ellesmere)
+
legacy_still kernel
+
256²–512² stills
+
byte-exact CPU parity (hash match true, RMSE 0.0)
+
D2 determinism (identical hashes across runs)
+
16/16 Universal Conformance Gate pass
+
governed assist role
```

These limits are a strength rather than a weakness.

They define what has actually been demonstrated.

---

# 26. Future Work

The architecture provides a clear path for expansion.

### 26.1 Additional kernels

Examples:

```text
still-1024
still-4k
video-tile
animation-frame
procedural-texture
geometry-pass
```

Each kernel should have an explicit reference implementation and conformance contract.

### 26.2 Additional backends

Potential implementations include:

```text
CPU
CUDA
HIP/ROCm
OpenCL
WebGPU
```

Additional APIs can be incorporated without changing the sovereignty model.

### 26.3 Automated backend selection

The `QualitySelector` can eventually consider:

```text
device capability
VRAM
estimated workload size
kernel support
measured throughput
latency
determinism requirements
power constraints
```

### 26.4 Out-of-core rendering

The tiling engine (`TilingEngine.js`) can extend the architecture beyond framebuffer-sized workloads.

Large operations become streams of governed work units.

### 26.5 Backend certification

A new backend could be admitted through a formal process:

```text
Implement
   ↓
Reference comparison
   ↓
Conformance suite
   ↓
Determinism testing
   ↓
Provenance testing
   ↓
Benchmark
   ↓
Backend certification
```

This would make backend admission itself a governed operation.

### 26.6 Commit `axiom_x/` for external reproducibility

Add `axiom_x/` to the repository so the one-command benchmark is reproducible from a fresh clone.

---

# 27. Architectural Invariant

The most important invariant can be stated simply:

> **No accelerator can become the source of truth merely by becoming faster than the CPU.**

This prevents performance from silently changing system authority.

A future accelerator could be 1,000× faster.

It could still remain an assist backend.

The CPU reference and conformance system would continue to determine whether its output is acceptable.

This separates two concepts that are frequently conflated:

**execution power** and **system authority**.

They are independent.

---

# 28. The Deeper Design Pattern

The resulting architecture is not fundamentally about the RX 580.

The RX 580 is a proof that the pattern works under constrained conditions.

The deeper pattern is:

```text
                 GOVERNANCE
                     │
                     ▼
              CPU REFERENCE
                     │
             Delegation Contract
                     │
                     ▼
            PLUGGABLE ASSISTS
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
        CUDA       OpenCL     WebGPU
          │          │          │
          └──────────┼──────────┘
                     ▼
             Tiling / Streaming
                     │
                     ▼
              Result Readback
                     │
                     ▼
             CONFORMANCE GATE
                     │
             ┌───────┴───────┐
             ▼               ▼
          ACCEPT           REJECT
             │
             ▼
       SYSTEM OF RECORD
```

The accelerator becomes replaceable infrastructure.

The governance layer becomes the durable architecture.

---

# 29. Conclusion

The 4 GB RX 580 experiment demonstrates that useful heterogeneous acceleration does not require surrendering architectural control to the accelerator.

The GPU can be fast without being authoritative.

It can be specialized without being universal.

It can be legacy hardware without being obsolete.

It can have limited memory without being the limiting factor.

And it can participate in a deterministic pipeline without becoming the system of truth.

The measured results establish a concrete proof point:

* 19–27× acceleration at 256² (wall-clock range; device ~5 µs stable)
* 27–77× acceleration at 512² (wall-clock range; device ~13 µs stable)
* byte-exact parity (hash match true, RMSE 0.0)
* identical hashes across deterministic runs (D2)
* 16/16 Universal Conformance Gate checks pass per run
* independent production, end-to-end, and benchmark verification
* repeatable benchmark execution (where `axiom_x/` is present)
* explicit governance boundaries

The larger architectural conclusion is more important than any individual speedup:

> **Universal does not mean one kernel.**

> **Universal means a governed delegation framework with swappable backends.**

Under this model, CUDA, HIP/ROCm, OpenCL, WebGPU, and future execution technologies become implementations rather than authorities.

The CPU remains sovereign.

The accelerator assists.

The conformance gate decides (16 checks, individually recorded).

The provenance system records.

The tiling layer allows constrained hardware to participate in larger workloads (declared, not yet exercised).

And the system scales not by assuming that every machine must have the same hardware, but by ensuring that every backend must obey the same contract.

The RX 580 therefore represents more than a successful legacy-GPU optimization.

It represents the first concrete instance of a broader architecture:

> **Compute power may be heterogeneous.
> Execution may be delegated.
> Hardware may be replaceable.
> Correctness must remain universal.
> Authority must remain governed.**

That is the foundation of a genuinely universal rendering system.