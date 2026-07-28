# MANDALA AGENT SKILL SPECIFICATION

> **Status:** **declared** — reference skill inventory for the 14 constitutional
> agents. Does **not** amend `AGENTS.md`, `engine/constitution/*`, or OpenCode
> subagent definitions without explicit authorization.
>
> **Total:** 14 Agents · 312 Skills

---

## AGENT 1 — Constitutional Governance Agent
*(41 Skills)*

### Charter & Organs
1. Detect charter version drift
2. Validate organ statuses
3. Enforce "enforced/declared/partial" correctness
4. Sync charter.js with docs
5. Validate constitutional invariants
6. Detect missing organ definitions
7. Validate governanceKernel state

### CKL
8. Detect CKL precedent drift
9. Validate CKL filters
10. Validate CKL loadDefault() path correctness
11. Validate CKL modifier logic
12. Validate CKL truthiness rules
13. Validate CKL recentDenials logic
14. Validate CKL recordPrecedent decision types

### CSE
15. Validate CSE state transitions
16. Validate CSE intent parsing
17. Validate CSE evidence routing
18. Validate CSE determinismRequired logic
19. Validate CSE error propagation

### Policies
20. Validate default.policies.json
21. Detect missing policy bindings
22. Validate policy schema correctness
23. Validate policy enforcement paths

### Governance Tests
24. Generate governance tests for new organs
25. Generate CKL tests
26. Generate CSE tests
27. Generate policy tests
28. Generate constitutional routing tests

### Governance Drift Detection
29. Detect drift between charter and implementation
30. Detect drift between CKL and tests
31. Detect drift between policies and runtime
32. Detect drift between CSE and router
33. Detect drift between charter.js and docs/CHARTER.md
34. Detect drift between organ status and conformance
35. Detect drift between evidence bundle and lineage
36. Detect drift between policy bindings and enforcement
37. Detect drift between contract.js and runtime contracts
38. Detect drift between conformance profile and test matrix
39. Validate charter principle ordering
40. Validate charter version consistency
41. Validate charter field immutability

---

## AGENT 2 — GPU/WebGPU Rendering Agent
*(38 Skills)*

### WebGPU Usage
1. Validate GPUTextureUsage flags
2. Validate GPUBufferUsage flags
3. Validate storeOp/loadOp correctness
4. Validate render pipeline config
5. Validate compute pipeline config
6. Validate shader module creation
7. Validate bind group layouts
8. Validate sampler usage
9. Validate adapter request options
10. Validate device lost handling
11. Validate texture dimension and format
12. Validate buffer mapping operations
13. Validate encoder creation and submission

### GPU Modules
14. Validate SharedGPUImage binary parsing
15. Validate SharedFramePreview buffer parsing
16. Validate GPURenderPipeline lifecycle
17. Validate GPUMeshRenderer support detection
18. Validate EnvironmentMapper usage flags
19. Validate ShadowMapper pipeline
20. Validate PostProcessor uniform layout
21. Validate ComputeMeshSampler shader generation
22. Validate GPUPreviewClient fallback logic
23. Validate WebGPURenderer initialization flow
24. Validate SovereignX router GPU dispatch

### GPU Tests
25. Generate mock WebGPU device
26. Generate GPU pipeline tests
27. Generate shader tests
28. Generate compute tests
29. Generate preview tests
30. Generate GPU integration tests
31. Generate GPU encoding tests

### GPU Safety
32. Detect unsafe GPU usage
33. Detect incorrect buffer mapping
34. Detect incorrect texture creation
35. Detect incorrect pipeline storeOp
36. Detect GPU resource leak
37. Detect unhandled GPU errors
38. Detect GPU capability overreach (assist-only enforcement)

---

## AGENT 3 — Renderer-Core Agent
*(22 Skills)*

1. Validate renderer-core module boundaries
2. Validate ESM imports
3. Validate dynamic imports
4. Validate pathToFileURL usage
5. Validate TimelineSerializer correctness
6. Validate ReplayService correctness
7. Validate ProvenanceRecorder correctness
8. Validate ConformanceChecker correctness
9. Validate encode modules (NVENC, GPUVideoEncoder)
10. Validate surface sync script
11. Validate renderer-web build step
12. Validate schemas
13. Validate files field in package.json
14. Validate renderer-core CLI argument parsing
15. Validate surface index registration
16. Validate scene pipeline creation
17. Validate span-clock overlap with evidence
18. Validate timeline clip application
19. Validate timeline world-required governance
20. Validate binding resolver track mapping
21. Validate mesh uploading and buffer allocation
22. Validate camera4d hyperplane computation

---

## AGENT 4 — Security Hardening Agent
*(29 Skills)*

### Critical
1. Detect shell injection
2. Detect XSS
3. Detect unsafe eval
4. Detect unsafe dynamic import
5. Detect unsafe fs usage in browser
6. Detect unsafe ledger calls
7. Detect credential leakage
8. Detect command injection in child_process

### High
9. Validate SECURITY.md
10. Validate browser safety
11. Validate async ledger calls
12. Validate GPUVideoEncoder empty catch
13. Validate NVENCEncoder dynamic import
14. Validate CSP headers in static server
15. Validate cross-origin isolation headers

### Medium
16. Validate environment variable usage
17. Validate error propagation
18. Validate fallback logic
19. Validate regex safety (ReDoS)
20. Validate path traversal protections
21. Validate file upload restrictions

### Low
22. Remove stray console.log
23. Remove stray debug prints
24. Remove unused error handlers
25. Standardize error codes
26. Validate type coercion safety
27. Validate prototype pollution guards
28. Validate npm dependency audit
29. Validate os/temp file safety

---

## AGENT 5 — Conformance Agent
*(18 Skills)*

1. Validate conformance schemas
2. Validate conformance rules
3. Validate conformance test coverage
4. Validate conformance error messages
5. Validate conformance drift
6. Generate conformance tests
7. Validate conformance checker logic
8. Validate conformance profile schema
9. Validate conformance check IDs
10. Validate conformance check descriptions
11. Validate conformance domain assignments
12. Validate provenance conformance
13. Validate replay conformance
14. Validate binding conformance
15. Validate timeline conformance
16. Validate evidence conformance
17. Validate CKL conformance
18. Validate conformance profile JSON validity

---

## AGENT 6 — Replay Agent
*(12 Skills)*

1. Validate replay record
2. Validate replay playback
3. Validate replay determinism
4. Validate replay error propagation
5. Generate replay tests
6. Validate replay lineage
7. Validate replay parameter restoration
8. Validate replay frame ordering
9. Validate replay with timeline seek
10. Validate replay with multiple evidence refs
11. Validate replay determinism across hosts
12. Validate replay receipt generation

---

## AGENT 7 — Provenance Agent
*(11 Skills)*

1. Validate provenance record
2. Validate provenance lineage
3. Validate provenance hashing
4. Validate provenance schema
5. Generate provenance tests
6. Validate provenance field completeness
7. Validate provenance intentId assignment
8. Validate provenance worldId/timelineId binding
9. Validate provenance timeSeconds indexing
10. Validate provenance parameter capture
11. Validate provenance attach during render/play

---

## AGENT 8 — Genblaze Agent
*(33 Skills)*

### BYOK
1. Validate sessionStorage-only
2. Validate header injection
3. Validate model override
4. Validate hosted BYOK flag
5. Validate key never logged
6. Validate key never persisted
7. Validate key never enters printer
8. Validate key never transmitted to cloud
9. Validate key never visible in UI exceptions
10. Validate sessionStorage clear on tab close
11. Validate no server-side BYOK path

### UI
12. Validate settings panel
13. Validate diagnostics panel
14. Validate model marketplace
15. Validate face creation UI
16. Validate SceneSpec visualizer
17. Validate character gallery
18. Validate prompt builder
19. Validate rendering progress indicators
20. Validate error display boundaries

### Pipeline
21. Validate Genblaze → NIM → SceneSpec → CharacterSpec → RT4D pipeline
22. Validate assist-only domain
23. Validate determinism boundaries
24. Validate evidence chain propagation through pipeline
25. Validate SceneSpec generation from natural language
26. Validate CharacterSpec generation from description
27. Validate render parameter mapping
28. Validate output format negotiation
29. Validate pipeline error recovery
30. Validate pipeline timeout handling
31. Validate pipeline cancellation
32. Validate pipeline progress reporting
33. Validate pipeline cost estimation

---

## AGENT 9 — Multi-Host Integration Agent
*(17 Skills)*

1. Validate Browser host
2. Validate Unity host
3. Validate Unreal host
4. Validate host adapters
5. Validate host routing
6. Validate host determinism boundaries
7. Validate host safety
8. Validate host capability detection
9. Validate host fallback logic
10. Validate host-specific build steps
11. Validate host platform compatibility
12. Validate host WebGPU availability
13. Validate host node-canvas fallback
14. Validate host interop boundaries
15. Validate host evidence propagation
16. Validate host timeline integration
17. Validate host constitutional compliance

---

## AGENT 10 — Documentation Agent
*(21 Skills)*

1. Generate charters
2. Generate whitepapers
3. Generate operator manuals
4. Generate governance docs
5. Generate GPU constitution
6. Generate BYOK charter
7. Generate pipeline diagrams
8. Generate lineage docs
9. Generate conformance docs
10. Generate replay docs
11. Generate provenance docs
12. Generate CECP protocol docs
13. Generate ESFR gate docs
14. Generate skill inventories
15. Generate trail artifacts
16. Generate promotion packets
17. Generate evidence trail templates
18. Generate capability maps
19. Generate README files (only when explicitly requested)
20. Generate API references
21. Generate integration guides (declared)

---

## AGENT 11 — CI Agent
*(14 Skills)*

1. Validate CI pipeline
2. Validate test runner
3. Validate coverage
4. Validate build steps
5. Validate linting
6. Validate formatting
7. Validate package.json fields
8. Validate CI caching
9. Validate CI artifact publication
10. Validate CI environment variable safety
11. Validate CI conditional execution
12. Validate CI matrix strategy
13. Validate CI timeout handling
14. Validate CI notification integration

---

## AGENT 12 — Code Quality Agent
*(20 Skills)*

1. Validate naming
2. Validate structure
3. Validate module boundaries
4. Validate comments
5. Validate readability
6. Validate maintainability
7. Validate dead code
8. Validate unused imports
9. Validate function length
10. Validate cyclomatic complexity
11. Validate parameter count
12. Validate consistent return types
13. Validate async function error handling
14. Validate promise chain flattening
15. Validate destructuring consistency
16. Validate variable naming conventions
17. Validate file naming conventions
18. Validate export placement
19. Validate import ordering
20. Validate test coverage thresholds

---

## AGENT 13 — Test Generation Agent
*(28 Skills)*

1. Generate node:test suites
2. Generate mock devices
3. Generate mock encoders
4. Generate mock pipelines
5. Generate governance tests
6. Generate GPU tests
7. Generate conformance tests
8. Generate replay tests
9. Generate provenance tests
10. Generate BYOK tests
11. Generate SceneSpec tests
12. Generate CharacterSpec tests
13. Generate integration tests
14. Generate unit tests
15. Generate edge-case tests
16. Generate security tests
17. Generate WebGPU mock tests
18. Generate timeline tests
19. Generate evidence chain tests
20. Generate determinism tests
21. Generate host adapter tests
22. Generate pipeline tests
23. Generate performance tests
24. Generate regression tests
25. Generate smoke tests
26. Generate snapshot tests
27. Generate fuzz tests (declared)
28. Generate load tests (declared)

---

## AGENT 14 — Constitutional Compliance Agent
*(28 Skills)*

1. Validate determinism boundaries
2. Validate assist-only GPU domain
3. Validate sovereign CPU print domain
4. Validate evidence chain purity
5. Validate constitutional routing
6. Validate constitutional invariants
7. Validate constitutional compliance test suite
8. Generate compliance tests
9. Validate P1 — no execution without intent
10. Validate P2 — no state change without evidence
11. Validate P3 — no authority without contract
12. Validate P4 — replayable reality
13. Validate P5 — sovereign independence
14. Validate policy 1 — no execution without intent
15. Validate policy 2 — no state change without evidence
16. Validate policy 3 — no render without provenance
17. Validate policy 4 — no authority without contract
18. Validate policy 5 — play timeline requires world
19. Validate policy 6 — ascension drift throttle
20. Validate policy 7 — ascension evidence
21. Validate conformance check completeness (16/16)
22. Validate evidence bundle field presence
23. Validate frame field completeness
24. Validate binding resolution completeness
25. Validate timeline clip correctness
26. Validate CKL denial logic
27. Validate CKL modify_param behavior
28. Validate CKL attach_provenance behavior

---

## TOTAL: 312 Skills

Each skill can be expanded further with sub-operations, probes, and expected
outcomes. Skills are **declared** — adoption into individual agent implementations
is tracked via CECP trails.

### Relation to CECP crew

| CECP Stage | Agent ID | Skills |
|------------|----------|--------|
| 01 — Architect | `architect` | Design-only; references Agent 1, 5, 14 for governance/conformance |
| 02 — Builder | `builder` | Scaffolding; references Agent 3 for module structure |
| 03 — Implementor | `implementor` | Feature logic; references Agent 2, 3, 4 for GPU/renderer/security |
| 04 — Reviewer | `reviewer` | Constitutional audit (read-only); references Agent 1, 14 |
| 05 — Inspector | `inspector` | Evidence/CI probes; references Agent 5, 6, 7, 11 |
| 06 — ESFR | `engineer-standards` | Final ship gate (read-only); references Agent 10, 12, 13 |
| Explore | `explore` | Codebase exploration; general-purpose search |
| General | `general` | Multi-step research; references any agent |
