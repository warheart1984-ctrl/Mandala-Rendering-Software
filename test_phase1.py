# Test script for Axiom-X Phase 1
from axiom_x.runtime import (
    AxiomXRuntime,
    WorkgroupTuner,
    TuningCache,
    TuningKey,
    DeviceFingerprint,
    KernelFingerprint,
    ProblemShape,
    BenchmarkConfig,
    BenchmarkResult,
    run_benchmark,
    select_best_candidate,
    CandidateResult,
    TuningEvidence,
)
print("All exports work!")

# Test TuningKey schema
import json
tk_json = '{"backend": "opencl", "device_fingerprint": {"vendor": "AMD", "name": "RX 580", "compute_units": 36, "global_memory_bytes": 8589934592, "max_work_group_size": 256, "max_work_item_sizes": [256, 256, 256], "max_local_mem_size": 32768}, "kernel_fingerprint": {"name": "legacy_still", "version": "1.0.0", "source_hash": "sha256:abc", "build_options_hash": "sha256:def", "precision": "fp32", "algorithm_variant": "default"}, "problem_shape": {"global_size": [256, 256], "work_dimensions": 2}}'
tk = TuningKey.from_json(tk_json)
print(f"Loaded TuningKey: {tk.cache_key()}")
print(f"Full hash: {tk.full_hash()}")

# Test JSON schema
from axiom_x.runtime import TUNING_KEY_JSON_SCHEMA
print(f"JSON Schema title: {TUNING_KEY_JSON_SCHEMA['title']}")

print("\nAll tests passed!")