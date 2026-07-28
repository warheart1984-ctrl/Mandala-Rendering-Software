# Conformance Rules

1. All 16 checks from `default.conformance-profile.json` must be implemented.
2. Each check must have a test in the conformance test suite.
3. Drift between conformance profile and test matrix is a violation.
4. Error messages must be descriptive and include the check ID.
5. ConformanceChecker must load and validate all rules before running.
