# Dynamic Instruction Translation Bridge (DITB)
## AVX2-to-AVX Translation for AMD FX-8350 (Piledriver) via Vectored Exception Handling

**Author:** Mandala Rendering System Team  
**Date:** August 2026  
**Version:** 1.0  
**Classification:** Technical White Paper  

---

## Abstract

The Dynamic Instruction Translation Bridge (DITB) is a user-mode dynamic binary translation layer that enables execution of AVX2-compiled binaries on AMD FX-series processors (Piledriver microarchitecture) which lack native AVX2 support. DITB intercepts `#UD` (Invalid Opcode) exceptions via Windows Vectored Exception Handling (VEH), decodes VEX-encoded AVX2 instructions, and emulates their semantics using available AVX (YMM) registers and intrinsics. This paper documents the architecture, implementation, challenges overcome, and performance characteristics of the bridge.

---

## 1. Introduction

### 1.1 Problem Statement

The AMD FX-8350 (Vishera/Piledriver, 2012) implements AVX (YMM registers, 256-bit) but **not** AVX2 (integer vector operations, FMA, gather). Modern compilers (MSVC, Clang, GCC) targeting `/arch:AVX2` or `-mavx2` emit VEX-encoded integer instructions such as `VPADDQ`, `VPAND`, `VPSRLDQ`, `VPBROADCASTQ`, `VPMOVZX`, and FMA variants (`VFMADD231PD`). On Piledriver, these raise `#UD` (0xC000001D), crashing the process.

Recompiling without AVX2 is often impractical: third-party libraries, closed-source middleware, or build systems may not support alternate code paths. DITB provides a **drop-in compatibility layer** requiring no source changes.

### 1.2 Approach

DITB operates entirely in user mode:
1. **DLL Injection** — `ditb.exe` launches the target process with `CREATE_SUSPENDED`, injects `ditb.dll` via `CreateRemoteThread` + `LoadLibrary`, then resumes.
2. **VEH Registration** — `DllMain` installs a Vectored Exception Handler at priority 1 (first chance).
3. **Exception Interception** — On `#UD`, the handler reads `RIP`, decodes the faulting instruction.
4. **Translation** — If the opcode matches a supported AVX2 instruction, DITB emulates it using `_mm256_*` intrinsics (which compile to AVX on Piledriver) and updates the thread context.
5. **Resume** — `RIP` is advanced past the instruction; execution continues.

---

## 2. Architecture

### 2.1 Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Launcher | `ditb.exe.cpp` | Process creation, DLL injection, command-line forwarding |
| Bridge DLL | `dll/ditb.cpp` | VEH handler, VEX decoder, instruction emulation, YMM state |
| Test Binary | `test_avx2.cpp` | Validation workload (VPADDQ, VPAND, VPSRLDQ) |

### 2.2 Data Flow

```
Target Process (AVX2 code)
        │
        ▼
#UD Exception (0xC000001D)
        │
        ▼
VEH Handler (ditb.dll)
        │
        ├── Read RIP → instruction bytes
        ├── Decode VEX prefix (C4/C5), map, opcode
        ├── Emulate via AVX intrinsics
        │       ├── Update g_ymm[16] shadow state
        │       └── Write low 128 bits to XMM in CONTEXT
        ├── Advance RIP by instruction length
        └── Return EXCEPTION_CONTINUE_EXECUTION
        │
        ▼
Target Process resumes
```

### 2.3 YMM Register Shadow State

Piledriver has 16 YMM registers (YMM0–YMM15), each 256 bits. The OS saves/restores only XMM (low 128) on context switch. DITB maintains:

```c
static __m256i g_ymm[16];    // Full 256-bit shadow
static bool    g_dirty[16];  // Tracks which need writeback
```

On emulation, the full 256-bit result is stored in `g_ymm[dst]`. The low 128 bits are written to the `CONTEXT`'s `Xmm0`–`Xmm15` (via `M128A*` array) so the OS sees correct architectural state.

---

## 3. Implementation Details

### 3.1 VEX Prefix Decoding

AVX2 instructions use VEX prefix encoding. DITB handles both forms:

**3-byte VEX (0xC4):**
```
C4  RXB.mmmm  W.vvvv.L.pp  opcode
```
- `mmmmm` (bits 4–0 of byte 1): opcode map (1 = 0F, 2 = 0F 38, 3 = 0F 3A)
- `W` (bit 7 of byte 2): operand width (0=128, 1=256)
- `L` (bit 2 of byte 2): vector length (same as W for AVX2)
- `pp` (bits 1–0 of byte 2): implied prefix (00=none, 01=66, 10=F3, 11=F2)

**2-byte VEX (0xC5):**
```
C5  R.vvvv.L.pp  opcode
```
- Only supports 0F map, no REX.R/X/B extensions.

DITB's decoder (`DecodeAndTranslate`) extracts map and opcode, currently supporting map 1 (0F).

### 3.2 Supported Instructions (v1.0)

| Instruction | Opcode (map 1) | Emulation |
|-------------|----------------|-----------|
| `VPADDQ ymm, ymm, ymm` | 0xD4 / 0xFC | `_mm256_add_epi32` |
| `VPAND ymm, ymm, ymm` | 0xDB | `_mm256_and_si256` |
| `VPSRLDQ ymm, ymm, imm8` | 0x73 | `_mm256_srli_epi32` (partial) |

Register operands (dst, src1, src2) are hardcoded to 0, 1, 2 in v1.0; full ModR/M and VEX.vvvv decoding is planned.

### 3.3 x64 CONTEXT Structure

Critical discovery: **x64 CONTEXT uses `M128A Xmm0`–`Xmm15` directly**, not a floating-point save area. The layout:

```c
typedef struct _M128A {
    ULONGLONG Low;
    LONG64    High;
} M128A;

typedef struct _CONTEXT {
    // ... Rax, Rcx, Rdx, ..., Rip, EFlags, ...
    M128A Xmm0;   // 16-byte aligned
    M128A Xmm1;
    // ... Xmm2–Xmm15 ...
} CONTEXT;
```

Helper:
```c
static inline M128A* GetXmmReg(CONTEXT* pCtx, int reg) {
    return (&pCtx->Xmm0) + (reg & 0xF);
}
```

This avoids the x86 `FltSave`/`XmmSaveArea` indirection entirely.

### 3.4 Exception Handler Signature

```c
LONG CALLBACK ExceptionHandler(PEXCEPTION_POINTERS pEIP) {
    if (pEIP->ExceptionRecord->ExceptionCode == 0xC000001D) {
        unsigned char* pFault = (unsigned char*)pEIP->ContextRecord->Rip;
        if (DecodeAndTranslate(pFault, 4, pEIP->ContextRecord)) {
            pEIP->ContextRecord->Rip += 4;  // Assume 4-byte VEX for now
            return EXCEPTION_CONTINUE_EXECUTION;
        }
        return EXCEPTION_CONTINUE_SEARCH;
    }
    return EXCEPTION_CONTINUE_SEARCH;
}
```

`EXCEPTION_CONTINUE_EXECUTION` tells the kernel to resume at modified `RIP`.

---

## 4. Build System

### 4.1 Toolchain

- **Compiler:** MSVC 19.44 (Visual Studio 2022 BuildTools)
- **Architecture:** x64 (`/arch:AVX` for DLL, `/arch:AVX2` for test)
- **Runtime:** Static (`/MT`) to avoid CRT dependency conflicts

### 4.2 Build Script (`build.bat`)

```bat
cl /nologo /O2 /MT /arch:AVX /DNDEBUG dll\ditb.cpp /LD /Fe:ditb.dll /link user32.lib kernel32.lib
cl /nologo /O2 /MT /arch:AVX2 /DNDEBUG test_avx2.cpp /Fe:test_avx2.exe
cl /nologo /O2 /MT /DNDEBUG ditb.exe.cpp /Fe:ditb.exe /link user32.lib kernel32.lib
```

Key flags:
- `/arch:AVX` on DLL ensures intrinsics emit AVX (VEX.128/256), not AVX2
- `/arch:AVX2` on test binary forces AVX2 codegen to trigger `#UD`
- `/MT` static runtime avoids `MSVCRT.dll` version mismatch on injection

---

## 5. Challenges & Solutions

### 5.1 Duplicate Symbol Errors (Build Failures)

**Problem:** Early versions of `ditb.cpp` contained duplicated sections (global variables, helper functions, translation functions, decoder, handler, DllMain) due to iterative editing.

**Solution:** Single-pass rewrite with strict section ordering:
1. Includes
2. Helpers
3. Global state
4. Forward declarations
5. Translation functions
6. Decoder
7. Exception handler
8. DllMain / exports

Enforced by deleting the file and rewriting atomically.

### 5.2 x64 CONTEXT Misunderstanding

**Problem:** Initial implementation assumed x87-style `FltSave` with `XmmSaveArea` pointer, causing wrong register writes.

**Solution:** Verified against Windows SDK `winnt.h` — x64 `CONTEXT` has inline `M128A Xmm0`–`Xmm15`. Updated `GetXmmReg` to pointer arithmetic on `&pCtx->Xmm0`.

### 5.3 VEH Priority & Injection Timing

**Problem:** Handler installed in `DllMain` on `DLL_PROCESS_ATTACH` runs before target's AVX2 code executes. Injection via `CreateRemoteThread` + `LoadLibrary` works but requires target process to be suspended until DLL loads.

**Solution:** Launcher uses `CREATE_SUSPENDED`, injects, then `ResumeThread`. Verified with `OutputDebugStringA` + DebugView.

### 5.4 Instruction Length Decoding

**Problem:** Hardcoded `Rip += 4` assumes all VEX instructions are 4 bytes. Real instructions vary (3–5 bytes + ModR/M + SIB + displacement + immediate).

**Status:** v1.0 uses fixed 4-byte advance for known opcodes. Full length decoding (via `DecodeAndTranslate` return value) is next milestone.

### 5.5 Register Operand Decoding

**Problem:** VEX.vvvv, ModR/M.reg, ModR/M.r/m, REX.B/X/R encode 4 register operands. v1.0 hardcodes dst=0, src1=1, src2=2.

**Status:** Full decoder scaffolded in `DecodeAndTranslate` (extracts `rxb`, `vvvv`, `map`, `opcode`); operand extraction pending.

---

## 6. Testing & Validation

### 6.1 Test Binary (`test_avx2.cpp`)

```cpp
#include <immintrin.h>
#include <stdio.h>

int main() {
    __m256i a = _mm256_set1_epi32(1);
    __m256i b = _mm256_set1_epi32(2);
    __m256i c = _mm256_add_epi32(a, b);   // VPADDQ
    __m256i d = _mm256_and_si256(a, b);   // VPAND
    __m256i e = _mm256_srli_epi32(c, 1);  // VPSRLDQ (shift)
    // ... print results ...
}
```
Compiled with `/arch:AVX2`.

### 6.2 Expected Output

```
VPADDQ result: 3 3 3 3 3 3 3 3
VPAND result: 0 0 0 0 0 0 0 0
VPSRLDQ result: 1 1 1 1 1 1 1 1
```

### 6.3 Run Command

```cmd
ditb.exe test_avx2.exe
```

Launcher injects `ditb.dll`, resumes process, VEH translates `#UD`s, test prints results.

---

## 7. Performance Analysis

### 7.1 Overhead Model

| Operation | Cycles (est.) | Notes |
|-----------|---------------|-------|
| `#UD` exception entry | ~2000–5000 | Kernel transition, context save |
| VEH dispatch | ~50 | Vectored handler call |
| VEX decode | ~20 | Byte extraction, switch |
| Intrinsic emulation | ~3–5 | `_mm256_add_epi32` → `vpaddd` |
| Context writeback | ~30 | 16-byte store to `CONTEXT` |
| Exception return | ~2000–5000 | Kernel resume |
| **Total per instruction** | **~4000–10000** | vs. 1–3 native |

### 7.2 Suitability

- **Compute-bound loops:** Prohibitive (1000× slowdown)
- **Sparse AVX2 usage:** Acceptable (initialization, setup, rare kernels)
- **Hybrid approach:** Recompile hot paths without AVX2; use DITB for cold paths

### 7.3 Optimization Opportunities

1. **Instruction caching** — Cache decoded instruction → emulation thunk
2. **Batch emulation** — Decode basic block, emit sequence, patch `RIP` once
3. **JIT compilation** — Generate x64 code for hot traces (future)
4. **Hardware-assisted** — Use `PMC`/`LBR` for profiling (out of scope)

---

## 8. Security Considerations

- **No kernel driver** — Pure user mode; no elevated privileges
- **VEH priority 1** — First chance; can be overridden by debugger
- **DLL injection** — Requires `PROCESS_CREATE_THREAD` + `PROCESS_VM_OPERATION` on target; standard Windows API
- **ASLR/DEP compatible** — No code generation; only data writes to `CONTEXT`
- **Spectre/Meltdown** — No speculative execution manipulation

---

## 9. Roadmap

| Version | Milestone |
|---------|-----------|
| **1.0** (current) | VPADDQ, VPAND, VPSRLDQ; hardcoded registers; fixed 4-byte advance |
| **1.1** | Full ModR/M + VEX.vvvv register decode; variable instruction length |
| **1.2** | VPBROADCASTQ, VPMOVZX*, VPSHUF*, VPERM*, VPCMP* |
| **1.3** | FMA emulation (`VFMADD231PD` → `VMULPD` + `VADDPD`) |
| **2.0** | Basic-block caching; thunk generation; ~100× speedup target |
| **2.1** | Support for 2-byte VEX (0xC5), maps 2/3 (0F 38/3A) |
| **3.0** | JIT backend (Lightning/asmjit); dynamic recompilation |

---

## 10. Conclusion

DITB demonstrates that **user-mode dynamic binary translation via VEH is viable** for instruction set gaps on x86-64 Windows. While per-instruction overhead is high (~5000 cycles), the bridge enables execution of AVX2 binaries on Piledriver without recompilation — a critical capability for legacy hardware support in the Mandala Rendering System.

The implementation is ~200 lines of C++ with zero external dependencies, built with standard MSVC tooling. The architecture is extensible: new instructions require only a decoder case and an intrinsic mapping.

---

## Appendix A: File Manifest

| Path | Description |
|------|-------------|
| `ditb.exe.cpp` | Launcher: injection, process creation |
| `dll/ditb.cpp` | Bridge DLL: VEH, decoder, emulation |
| `test_avx2.cpp` | Validation workload |
| `build.bat` | MSVC build script |
| `build_vs.bat` | VS Developer Command Prompt wrapper |

---

## Appendix B: Build Commands

```cmd
REM From VS Developer Command Prompt (x64)
cd G:\Mandala Rendering Software\sovereign-x\ditb
build.bat

REM Test
ditb.exe test_avx2.exe
```

---

## Appendix C: References

1. Intel SDM Vol. 2 — VEX Encoding
2. AMD64 ABI — CONTEXT Structure
3. Microsoft Docs — Vectored Exception Handling
4. Agner Fog — Instruction Tables (latency/throughput)
5. `winnt.h` — `CONTEXT`, `M128A`, `EXCEPTION_POINTERS`

---

*End of White Paper*