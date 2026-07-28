# Checker Logic Rules

1. `ConformanceChecker.checkAll()` must return results for all 16 checks.
2. Each result must include `id`, `passed`, and `message` fields.
3. Provenance domain checks require `ProvenanceRecorder` to exist.
4. Replay domain checks require `ReplayService` to exist.
5. CKL domain checks require CKL policy loading and evaluation.
