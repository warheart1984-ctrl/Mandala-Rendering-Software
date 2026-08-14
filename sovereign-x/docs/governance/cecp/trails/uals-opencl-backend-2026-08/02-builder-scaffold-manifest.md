# 02 — Builder scaffold manifest

**Trail:** `uals-opencl-backend-2026-08`
**Status:** **declared** (map only — no code landed yet)

| Artifact | Kind | Action when building |
|----------|------|----------------------|
| `axiom-native/include/axiom/uals.h` | new | ABI header per spec §3 (C99) |
| `axiom-native/src/uals/backends/opencl/{icd,context,program,determinism,map,meta}.c` | new | OpenCL backend per spec §6 |
| `axiom-native/src/uals/orchestrator/dispatch.c` | new | registry → gate → backend path per spec §8 |
| `axiom-native/src/uals/kernel-registry/sx.kernels.json` | new | kernel contract seed entry per spec §4 |
| `axiom-native/src/uals/conformance-gate/{provenance,determinism}.c` | new | gates G4/G5 logic |
| `axiom-native/build_vs.bat` | modify | add `uals` target → `uals.dll` |
| `uals/tests/{gate_probe,gate_dispatch,gate_determinism,gate_provenance,gate_registry,gate_parity}.c` | new | gate harness, `run_gates.exe` |
| `uals/abi/` | link | symlink/copy of canonical header |
| `router/registry/gpuSkillsRegistry.json` | new | capability registry per `router/capabilities/README.md` |
| CECP trail dir | this folder | spec + ADR + manifest |

## Verification plan (on code landing)

1. `axiom-native/build_vs.bat` — compiles clean, produces `uals.dll`.
2. `uals/tests/run_gates.exe` — G1–G7 exit 0.
3. Determinism soak — 100 runs same seed, byte-identical.
4. Parity — OpenCL vs `cpu.rt4d.print` bit-exact on deterministic path.
5. Conformance — G1–G5 pass ⇒ status `partial`; no print-SoT claim before G6.