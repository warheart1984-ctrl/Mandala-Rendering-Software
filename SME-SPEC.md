# Sovereign Multimodal Engine v1.1
## Constitutional Technical Specification (Draft) — CPU‑Bound Mathematical Revision

---

### 1. Purpose and scope
**Purpose:**  
Define a governed, multimodal execution environment that can ingest and emit text, image, audio, and video, with:

- Training: on older GPU frameworks.
- Inference: CPU‑first, GPU‑optional.
- Governance: aligned with CIEMS and your constitutional chain:
  Authority → Validation → Decision → Evidence → Verification → Replay → Audit.

**Scope:**  
This specification covers:
- Modules: per modality and orchestration.
- Interfaces: between modules and the constitutional runtime.
- Contracts: for behavior, safety, and conformance.

---

### 2. Constitutional invariants
**Invariant 1 – No decision without evidence:**  
Every multimodal output must be traceable to explicit inputs, intermediate artifacts, and model states.

**Invariant 2 – Modality neutrality:**  
Text, image, audio, and video are treated as governed substrates; no modality bypasses constitutional review.

**Invariant 3 – Replayable state:**  
All executions must be reproducible given: inputs, configuration, model versions, and random seeds.

**Invariant 4 – Framework independence:**  
The constitution governs behavior, not specific libraries; older GPU frameworks are implementation details, not authorities.

---

### 3. High‑level architecture
**Top‑level components:**

- SME-Core: Sovereign Multimodal Engine Core (orchestrator + constitutional runtime).
- SME-TXT: Text Reasoning Core (LLM).
- SME-VIS: Vision Module (images).
- SME-AUD: Audio Module (speech and sound).
- SME-VID: Video Module (temporal visual streams).
- SME-GEN: Generative Media Module (image/audio/video synthesis, optional/offload).
- SME-LOG: Evidence, Replay, and Audit subsystem.

**Data flows through:**
Intent & Authority Layer → 2. Modality Ingestion → 3. Fusion & Reasoning → Generation → 5. Verification & Replay → 6. Audit & Stewardship.

---

### 4. Module specifications and interfaces

#### 4.1 SME-TXT – Text Reasoning Core
**Role:**  
Primary constitutional decision engine; all multimodal reasoning is anchored in text space.

**Implementation constraints:**
- Training: Older GPU frameworks (CUDA 10/11, cuDNN 7/8, PyTorch 1.x or TensorFlow 2.x)
- Parameter range: 100M–1B for practical CPU inference.
- Inference: CPU‑optimized runtimes (ggml/llama.cpp/ONNXRuntime + oneDNN).
- Quantization: INT8 / Q4 / Q5.

**Interface: SME-TXT-IFC**

**Input:**
- TXT_PROMPT: UTF‑8 text.
- MM_EMBEDDINGS: structured embeddings from VIS/AUD/VID.
- CTX_CONSTITUTION: active constitutional context (rules, policies).

**Output:**
- TXT_RESPONSE: generated text.
- TXT_REASON_TRACE: optional chain‑of‑thought or justification tokens (internal).
- DECISION_RECORD: structured decision object for SME-LOG.

**Contract: SME-TXT-CON**
- Determinism: Given seed + model version + inputs → identical outputs.
- Governance: Must honor Authority and Validation layers before emitting user‑visible text.
- Explainability: Must produce a machine‑readable DecisionRecord with references to inputs and modality embeddings.

---

#### 4.2 SME-VIS – Vision Module (Images)
**Role:**  
Encode images into embeddings and optionally decode/generate images via SME-GEN.

**Implementation constraints:**
- Training: Older GPU frameworks as above.
- Models: MobileViT, EfficientNet, ViT‑Tiny/Small, pruned ResNet.
- Inference: CPU‑friendly: small models, INT8 quantization.

**Interface: SME-VIS-IFC**

**Input:**
- IMG_RAW: image bytes (PNG/JPEG/WebP).
- IMG_META: resolution, color space, source.

**Output:**
- VIS_EMBED: fixed‑length embedding vector.
- VIS_FEATURES: optional tags (objects, scenes, attributes).
- VIS_EVIDENCE: mapping from regions → features (for audit).

**Contract: SME-VIS-CON**
- Safety: Must route potentially unsafe content through Validation before exposing features to SME-TXT.
- Traceability: VIS_EMBED must be linked to IMG_RAW via unique EvidenceId.
- Versioning: Model version and preprocessing pipeline must be recorded in SME-LOG.

---

#### 4.3 SME-AUD – Audio Module (Speech and Sound)
**Role:**  
Transcribe, classify, and embed audio; optionally support TTS via SME-GEN.

**Implementation constraints:**
- Training: Whisper‑style or smaller speech models on older GPUs.
- Inference: CPU runtimes (whisper.cpp, faster‑whisper CPU).

**Interface: SME-AUD-IFC**

**Input:**
- AUD_RAW: audio stream (WAV/OGG/MP3).
- AUD_META: sample rate, channels, duration.

**Output:**
- AUD_TRANSCRIPT: text transcription.
- AUD_EMBED: audio embedding.
- AUD_TIMECODES: word/segment timestamps.

**Contract: SME-AUD-CON**
- Alignment: Transcription must be time‑aligned for replay and audit.
- Governance: Transcripts are treated as text evidence and pass through SME-TXT governance.
- Replay: Given AUD_RAW + model version → reproducible transcript.

---

#### 4.4 SME-VID – Video Module (Temporal Visual Streams)
**Role:**  
Understand video via frame sampling and temporal modeling; provide embeddings and structured events.

**Implementation constraints:**
- Training: Older GPUs with 3D‑CNNs, TimeSformer, or frame‑based ViT + RNN.
- Inference: CPU‑friendly: Key‑frame sampling + SME-VIS, Lightweight temporal aggregation.

**Interface: SME-VID-IFC**

**Input:**
- VID_RAW: video file/stream.
- VID_META: codec, resolution, FPS, duration.

**Output:**
- VID_EMBED: global video embedding.
- VID_FRAME_EMBEDS: per‑frame or per‑segment embeddings.
- VID_EVENTS: optional structured events (actions, scenes).

**Contract: SME-VID-CON**
- Sampling transparency: Sampling strategy (FPS, key‑frame rules) must be recorded in Evidence.
- Hierarchy: Frame embeddings must be traceable back to specific timestamps.
- Resource bounds: CPU inference must respect configured limits (max frames, max duration).

---

#### 4.5 SME-GEN – Generative Media Module
**Role:**  
Generate images, audio, and video under constitutional control.

**Implementation constraints:**
- Training: Older GPUs with diffusion/GAN/TTS models.
- Inference: CPU‑only for low‑resolution/low‑latency tasks; Optional offload to external GPU services (NIM, etc.) via governed connectors.

**Interface: SME-GEN-IFC**

**Input:**
- GEN_REQUEST: structured generation request (modality, prompt, constraints).
- CTX_CONSTITUTION: active rules (safety, style, domain).

**Output:**
- GEN_ARTIFACT: generated media (IMG/AUD/VID).
- GEN_TRACE: parameters, seeds, model versions.

**Contract: SME-GEN-CON**
- Authority: No generation without explicit AuthorityGrant from SME-Core.
- Safety & policy: Must enforce content policies before returning artifacts.
- Replayability: Seeds + parameters must allow deterministic regeneration.

---

### 5. SME-Core – Orchestration and constitutional runtime
**Role:**  
Central Constitutional Execution Environment (CEE) for multimodal operations.

**Subcomponents:**
- Authority Engine (SME-AUTH): Evaluates requests against constitutional rules and CIEMS sovereignty stack.
- Validation Engine (SME-VAL): Input validation, safety checks, resource limits.
- Fusion Engine (SME-FUSE): Fuses VIS_EMBED, AUD_EMBED, VID_EMBED, and text into a unified context for SME-TXT.
- Decision Engine (SME-DEC): Coordinates SME-TXT outputs and SME-GEN actions.
- Evidence & Replay Engine (SME-EVR): Captures all artifacts needed for deterministic replay.
- Audit & Stewardship Engine (SME-AUDIT): Long‑term logging, compliance, and lineage.

**Core interface: SME-CORE-IFC**

**Input:**
- USER_INTENT: structured intent (modality, goal, constraints).
- RAW_MEDIA: text/image/audio/video as provided.

**Output:**
- GOVERNED_RESPONSE: final multimodal response.
- CONSTITUTIONAL_TRACE: full chain: Authority → Validation → Decision → Evidence → Verification → Replay → Audit.

**Core contract: SME-CORE-CON**
- Chain enforcement: Every request must traverse the constitutional chain; no shortcuts.
- Modality isolation: Each modality module is sandboxed; SME-Core is the only orchestrator.
- Framework abstraction: PyTorch/TensorFlow/CUDA versions are recorded as ImplementationEvidence, not as authorities.

---

### 6. Older GPU frameworks – implementation profile
**Implementation profile: SME-IMP-GPU-LEGACY**

**Supported stacks:**
- CUDA: 10.x, 11.x
- cuDNN: 7.x, 8.x
- PyTorch: 1.7–1.13
- TensorFlow: 2.3–2.9

**Contract:**
- IMP-GPU-CON-1: All models must declare their framework, version, and hardware in SME-LOG.
- IMP-GPU-CON-2: Framework upgrades require Promotion via CIEMS: evidence, replay verification, conformance, arena certification, constitutional review.
- IMP-GPU-CON-3: Training frameworks are substrations; inference runtimes (CPU‑optimized) are substrates.

---

### 7. Conformance and versioning
**SME Versioning:** SME-MAJOR.MINOR.PATCH (e.g., 1.0.0).

**Modality contracts:** Each module (TXT/VIS/AUD/VID/GEN) must publish:
- Interface spec (IFC).
- Behavioral contract (CON).
- Implementation profile (IMP).

**Conformance process:** Specification → Implementation → Conformance tests → Deployment → Stewardship, aligned with CIEMS.

---

### 8. Deployment architecture
**8.1 Target environments**
- **CPU-first bare metal:** x86_64 (AVX2/AVX-512) and ARM64 (NEON/SVE) hosts with 8–64GB RAM.
- **Containerized:** Docker/Podman images with multi-arch manifests (linux/amd64, linux/arm64).
- **Edge/embedded:** Optional stripped builds for Jetson Orin, Raspberry Pi 5, industrial PCs.
- **GPU-optional sidecar:** NVIDIA GPU containers (CUDA 11/12) for SME-GEN offload; AMD ROCm containers for MI300X/MI250.

**8.2 Deployment units**
| Unit | Contents | Scaling |
|------|----------|---------|
| `sme-core` | SME-AUTH, SME-VAL, SME-FUSE, SME-DEC, SME-EVR, SME-AUDIT | 1–N (stateless) |
| `sme-txt` | LLM runtime (llama.cpp/ONNX), model weights, tokenizer | 1–N (model-parallel optional) |
| `sme-vis` | Vision encoder runtime (ONNXRuntime), model weights | 1–N |
| `sme-aud` | Audio runtime (whisper.cpp), model weights | 1–N |
| `sme-vid` | Video pipeline (frame sampler + SME-VIS + temporal agg) | 1–N |
| `sme-gen` | Diffusion/TTS/FFmpeg runners, optional GPU connector | 0–N (on-demand) |
| `sme-log` | Evidence store (SQLite/PostgreSQL), replay index, audit log | 1 (leader) + replicas |

**8.3 Configuration management**
- All configuration via `SME-CONFIG` YAML/TOML with environment-specific overlays.
- Secrets via vault integration (HashiCorp Vault, AWS Secrets Manager, or file-based for air-gapped).
- Model version pinning: `model:{name}:{version}:{quantization}:{checksum}`.

**8.4 Network topology**
```
                    ┌─────────────────┐
                    │   API Gateway   │
                    │  (TLS, AuthZ)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ sme-core │  │ sme-core │  │ sme-core │  (stateless pool)
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │             │             │
    ┌────────┼────────┐    │    ┌────────┼────────┐
    ▼        ▼        ▼    ▼    ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ txt  │ │ vis  │ │ aud  │ │ vid  │ │ gen  │ │ log  │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
```

**8.5 Health & readiness**
- Liveness: `/health/live` — process alive.
- Readiness: `/health/ready` — all modality backends responsive, models loaded, evidence store reachable.
- Startup: `/health/startup` — model loading complete (may take 30–120s for large quantized models).

---

### 9. Testing strategy
**9.1 Test pyramid**
| Layer | Scope | Tools | Target |
|-------|-------|-------|--------|
| Unit | Single function/class, mocked deps | pytest, vitest, googletest | >90% coverage per module |
| Integration | Module-to-module via IFCs | pytest, testcontainers | All IFC contracts verified |
| Conformance | Constitutional checks (21) | Custom harness + CI | 21/21 pass |
| Replay | Deterministic replay verification | SME-EVR harness | Bit-exact replay for seeded runs |
| Contract | Schema validation, policy eval | JSON Schema, OPA/Rego | 100% schema compliance |
| E2E | Full pipeline: intent → governed response | Playwright, custom scenarios | Critical paths covered |
| Chaos | Fault injection, resource exhaustion | Chaos Mesh, litmus | Graceful degradation verified |

**9.2 Conformance test catalog (maps to §IV of AGENTS.md)**
| Check ID | Test Description |
|----------|------------------|
| `provenance.recorder-exists` | SME-EVR exposes ProvenanceRecorder API |
| `provenance.frame-fields` | Every frame carries intentId, timelineId, worldId, timeSeconds, parameters |
| `provenance.frame-recorded-during-play` | Frames recorded only between play/stop |
| `replay.service-exists` | ReplayService accepts frames + target |
| `replay.deterministic-params` | Replay restores identical parameter values |
| `binding.resolver-exists` | BindingResolver maps track bindings to scene objects |
| `binding.all-tracks-resolved` | Every track.binding resolves to a target |
| `binding.director-contract-exists` | Director agent contract registered and valid |
| `timeline.loader-exists` | GovernedTimelineDto loads from JSON |
| `timeline.clip-application` | Player applies set_param and render_4d clips |
| `timeline.world-required` | play_timeline denied without world id |
| `evidence.bundle-fields` | Evidence contains id, worldId, timelineId |
| `evidence.dual-require` | CKL denies when require[] evidence ids missing |
| `ckl.policy-load` | Runtime loads default.policies.json |
| `ckl.deny-without-intent` | CKL denies execution when intent null |
| `ckl.modify-param` | CKL modify_param adjusts params on condition |
| `ckl.attach-provenance` | CKL sets attachProvenance for render/play |
| `authority.chain-valid` | Authority chains valid; Director chain respects boundaries |
| `governance.no-implicit-escalation` | Director cannot implicitly escalate privileges |
| `execution.no-cross-layer-mutation` | Director cannot mutate artifacts directly |
| `normalization.brdf-energy` | BRDF integrates to 3ρ/(4π) (from rt4d test suite) |

**9.3 Test data management**
- Golden fixtures: `test/fixtures/golden/{modality}/{scenario}/` with inputs, expected embeddings, traces.
- Synthetic generators: property-based tests for embedding dimensions, timestamp alignment, seed determinism.
- CI artifacts: Model weights cached via Git LFS or artifact registry; test runs download pinned versions.

**9.4 Continuous integration**
```yaml
# .github/workflows/ci.yml (conceptual)
stages:
  - lint: ruff, mypy, eslint, clang-tidy
  - unit: pytest -m unit (parallel)
  - integration: pytest -m integration (serial, needs model cache)
  - conformance: python -m sme.conformance.run_all
  - replay: python -m sme.replay.verify_determinism
  - contract: python -m sme.contract.validate_all
  - build: docker buildx bake (multi-arch)
  - smoke: deploy to staging, run e2e smoke suite
```

---

### 10. Security model
**10.1 Threat model (STRIDE)**
| Threat | Mitigation |
|--------|------------|
| Spoofing | mTLS between all services; SPIFFE/SPIRE for identity |
| Tampering | Immutable evidence log (append-only, Merkle-tree hashed); signed model weights |
| Repudiation | SME-AUDIT provides non-repudiable audit trail with timestamps + signatures |
| Info disclosure | Encryption at rest (LUKS/Transparent DB encryption); TLS 1.3 in transit; PII scrubbing in logs |
| DoS | Resource quotas per request (SME-VAL); circuit breakers; priority queuing for constitutional ops |
| Elevation | Authority chain validation (SME-AUTH); no implicit escalation (policy-governance) |

**10.2 Supply chain**
- SBOM generation (Syft) for every container image.
- SLSA Level 2+ build provenance (GitHub Actions + cosign).
- Model weight verification: SHA256 + cosign signatures against approved keyring.
- Dependency scanning: Trivy/Grype in CI; no critical/high CVEs in runtime images.

**10.3 Content safety**
- SME-VAL integrates configurable safety classifiers (NSFW, violence, PII, extremism).
- All generated content passes through safety pipeline before user delivery.
- Safety decisions recorded in SME-LOG with EvidenceId for audit.

**10.4 Runtime hardening**
- Containers run as non-root, read-only rootfs, dropped capabilities.
- seccomp profile: allow only required syscalls.
- ASLR, stack canaries, FORTIFY_SOURCE enabled in all compiled components.
- Memory limits enforced via cgroups; OOM scoring tuned to protect sme-core.

---

### 11. Observability
**11.1 Metrics (Prometheus exposition)**
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `sme_requests_total` | Counter | modality, result, code | Request volume by outcome |
| `sme_request_duration_seconds` | Histogram | modality, phase | Latency per phase (authority, validation, fusion, inference, generation) |
| `sme_model_inference_seconds` | Histogram | model, quantization | Model inference latency |
| `sme_evidence_bytes_total` | Counter | module | Evidence payload size |
| `sme_replay_verification_total` | Counter | result | Replay pass/fail |
| `sme_policy_denials_total` | Counter | policy_id | Policy enforcement events |
| `sme_resource_usage` | Gauge | resource (cpu, mem, gpu) | Resource utilization |

**11.2 Logging (structured JSON)**
- All logs: `timestamp, level, trace_id, span_id, module, event, payload`.
- Trace context propagated via W3C TraceContext headers.
- SME-LOG emits `EvidenceRecord` events for every modality processing step.

**11.3 Tracing (OpenTelemetry)**
- Spans: `sme.authority`, `sme.validation`, `sme.fusion`, `sme.txt.inference`, `sme.vis.encode`, `sme.aud.transcribe`, `sme.vid.encode`, `sme.gen.generate`, `sme.evr.record`, `sme.audit.write`.
- Attributes: `model.version`, `quantization`, `seed`, `evidence_id`, `constitution.version`.

**11.4 Alerting rules (examples)**
- `sme_request_duration_seconds{p99} > 30s` → page on-call.
- `sme_policy_denials_total[5m] > 100` → investigate policy drift.
- `sme_replay_verification_total{result="fail"} > 0` → immediate investigation.
- `sme_model_inference_seconds > 2x baseline` → model regression alert.

---

### 12. Operations & runbooks
**12.1 Model lifecycle**
| Phase | Action | Authority |
|-------|--------|-----------|
| Propose | New model candidate + benchmarks | Architect |
| Validate | Conformance suite + replay verification | Inspector |
| Certify | Arena certification + constitutional review | Director + Reviewer |
| Promote | Deploy to staging → canary → production | Director (with approval) |
| Deprecate | Mark deprecated, set sunset date | Director |

**12.2 Incident response**
| Severity | Response | Example |
|----------|----------|---------|
| SEV-1 (constitutional violation) | Immediate halt, Director + Reviewer + Engineer-Standards | Policy bypass detected |
| SEV-2 (replay failure) | Freeze deployments, root cause in 1hr | Determinism regression |
| SEV-3 (latency degradation) | Investigate, mitigate in 4hr | Model inference 3x slower |
| SEV-4 (observability gap) | Fix in next sprint | Missing metric/span |

**12.3 Backup & disaster recovery**
- SME-LOG (evidence store): Daily snapshot + WAL archiving; RPO < 1hr, RTO < 4hr.
- Model weights: Immutable in artifact registry; re-pull on recovery.
- Configuration: Git-backed (ArgoCD/Flux); single-source-of-truth.

**12.4 Capacity planning**
- CPU inference: ~2–4 GB RAM per 1B-param Q4 model + KV cache.
- Concurrent requests: Size thread pool to `(CPU cores / 2)` for llama.cpp; ONNXRuntime uses internal thread pool.
- SME-GEN offload: GPU queue depth monitored; fallback to CPU (degraded quality) with alert.

---

### 13. API specification (OpenAPI 3.1)
**13.1 Core endpoints**
```yaml
openapi: 3.1.0
info:
  title: Sovereign Multimodal Engine API
  version: 1.0.0
paths:
  /v1/intent:
    post:
      summary: Submit a governed multimodal intent
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserIntent'
      responses:
        '202':
          description: Accepted for processing
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IntentReceipt'
        '400': { $ref: '#/components/responses/ValidationError' }
        '403': { $ref: '#/components/responses/AuthorityDenied' }
        '503': { $ref: '#/components/responses/Overloaded' }
  /v1/intent/{intentId}/result:
    get:
      summary: Retrieve governed response (polling)
      parameters:
        - $ref: '#/components/parameters/IntentId'
      responses:
        '200':
          description: Governed response ready
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GovernedResponse'
        '202': { description: Still processing }
        '404': { $ref: '#/components/responses/NotFound' }
  /v1/evidence/{evidenceId}:
    get:
      summary: Retrieve evidence bundle by ID
      parameters:
        - $ref: '#/components/parameters/EvidenceId'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EvidenceBundle'
  /v1/replay:
    post:
      summary: Request deterministic replay
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReplayRequest'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReplayResult'
  /v1/health/live:
    get: { responses: { '200': { description: Alive } } }
  /v1/health/ready:
    get: { responses: { '200': { description: Ready } } }
components:
  schemas:
    UserIntent:
      type: object
      required: [intentId, modality, goal, constraints]
      properties:
        intentId: { type: string, format: uuid }
        modality: { type: array, items: { type: string, enum: [text, image, audio, video] } }
        goal: { type: string }
        constraints: { type: object }
        priority: { type: integer, minimum: 0, maximum: 10, default: 5 }
        deadline: { type: string, format: date-time }
    IntentReceipt:
      type: object
      required: [intentId, status, traceId]
      properties:
        intentId: { type: string, format: uuid }
        status: { type: string, enum: [accepted, queued, rejected] }
        traceId: { type: string }
        estimatedCompletion: { type: string, format: date-time }
    GovernedResponse:
      type: object
      required: [intentId, response, constitutionalTrace]
      properties:
        intentId: { type: string, format: uuid }
        response: { type: object }
        constitutionalTrace: { $ref: '#/components/schemas/ConstitutionalTrace' }
    ConstitutionalTrace:
      type: object
      required: [authority, validation, fusion, decision, evidence, verification, replay, audit]
      properties:
        authority: { $ref: '#/components/schemas/AuthorityRecord' }
        validation: { $ref: '#/components/schemas/ValidationRecord' }
        fusion: { $ref: '#/components/schemas/FusionRecord' }
        decision: { $ref: '#/components/schemas/DecisionRecord' }
        evidence: { $ref: '#/components/schemas/EvidenceRecord' }
        verification: { $ref: '#/components/schemas/VerificationRecord' }
        replay: { $ref: '#/components/schemas/ReplayRecord' }
        audit: { $ref: '#/components/schemas/AuditRecord' }
    # ... additional schemas elided for brevity
```

**13.2 SDKs**
- Python: `pip install sme-sdk` — async client with Pydantic models.
- TypeScript: `npm i @sme/sdk` — typed fetch wrapper.
- Rust: `sme-sdk` crate — zero-copy embedding support.
- Go: `github.com/sme/sdk/go` — CLI and library.

---

### 14. CIEMS integration
**14.1 Sovereignty stack alignment**
- SME-Core implements the CIEMS **Authority → Validation → Decision → Evidence → Verification → Replay → Audit** chain as first-class runtime.
- Each SME module publishes its **ImplementationEvidence** (framework, version, hardware, quantization, checksum) to the CIEMS stewardship layer.
- Model promotions follow CIEMS **Promotion Pipeline**: Evidence → Replay Verification → Conformance → Arena Certification → Constitutional Review.

**14.2 Constitutional Knowledge Layer (CKL) integration**
- SME-AUTH embeds CKL policy engine (`engine/governance/ConstitutionalKnowledgeLayer.js`).
- Policies loaded from `engine/governance/policies/default.policies.json` at startup.
- Policy evaluation results attached to every `AuthorityRecord` and `ValidationRecord`.

**14.3 Governance Kernel integration**
- SME-DEC uses `engine/governance/GovernanceKernel.js` for decision pipeline.
- All decisions produce `DecisionRecord` with full provenance.

**14.4 Conformance profile**
- SME conformance tests implement `engine/conformance/default.conformance-profile.json` checks (21 checks).
- CI gate: `npm run test:conformance` must pass 21/21.

---

### 15. Migration & compatibility
**15.1 Version compatibility matrix**
| SME Version | Constitution Schema | Policy Schema | Model Format | Min Runtime |
|-------------|---------------------|---------------|--------------|-------------|
| 1.0.x | 1.0 | 1.0 | GGUF v3 / ONNX opset 17 | llama.cpp b4000+ / ORT 1.16+ |
| 1.1.x | 1.0 | 1.1 | + Safetensors | llama.cpp b4500+ / ORT 1.17+ |

**15.2 Upgrade procedure**
1. Deploy new SME-Core alongside old (blue/green).
2. Run shadow traffic: duplicate requests to new version, compare constitutional traces.
3. Verify conformance 21/21 on new version.
4. Cut over API Gateway traffic.
5. Decommission old version after 24h observation.

**15.3 Deprecation policy**
- Major versions: 18 months support.
- Minor versions: 6 months support after next minor.
- Model formats: 2 major versions support (e.g., GGUF v3 supported through SME 2.x).

---

### 16. Appendix A: Model zoo (recommended starting points)
| Module | Model | Params | Quant | Source | License |
|--------|-------|--------|-------|--------|---------|
| SME-TXT | SmolLM-360M | 360M | Q4_K_M | HuggingFace (HuggingFaceTB) | Apache-2.0 |
| SME-TXT | Phi-3-mini-4k | 3.8B | Q4_K_M | Microsoft | MIT |
| SME-TXT | Qwen2.5-0.5B | 0.5B | Q4_K_M | Alibaba | Apache-2.0 |
| SME-VIS | MobileViT-XXS | 1.3M | INT8 | Apple | MIT |
| SME-VIS | ViT-Tiny (patch16) | 5M | INT8 | Google | Apache-2.0 |
| SME-VIS | EfficientNet-B0 | 5.3M | INT8 | Google | Apache-2.0 |
| SME-AUD | Whisper-tiny | 39M | INT8 | OpenAI | MIT |
| SME-AUD | Whisper-base | 74M | INT8 | OpenAI | MIT |
| SME-AUD | Distil-Whisper-large-v2 | 154M | INT8 | HuggingFace | Apache-2.0 |
| SME-VID | (frame sampler + SME-VIS) + TSM-ResNet18 | 11M | INT8 | MIT/Apache |
| SME-GEN-IMG | Stable Diffusion 1.5 (pruned) | ~860M | Q4 | Runway | OpenRAIL-M |
| SME-GEN-IMG | SDXL Turbo (1-step) | ~2.6B | Q4 | Stability | OpenRAIL++ |
| SME-GEN-AUD | Piper TTS (vox-populi) | ~50M | INT8 | RHVoice | MIT |
| SME-GEN-AUD | Coqui TTS (XTTS v2) | ~400M | Q4 | Coqui | CPML |

---

### 17. Appendix B: Quantization guide
**17.1 llama.cpp / GGUF quantization levels**
| Level | Bits | Size (1B) | Perplexity Δ | Speed (tokens/s, Ryzen 7950X) |
|-------|------|-----------|--------------|-------------------------------|
| F16 | 16 | 2.0 GB | baseline | ~45 |
| Q8_0 | 8 | 1.1 GB | +0.02 | ~65 |
| Q6_K | 6 | 0.85 GB | +0.05 | ~78 |
| Q5_K_M | 5 | 0.72 GB | +0.08 | ~92 |
| Q4_K_M | 4 | 0.58 GB | +0.15 | ~115 |
| Q3_K_M | 3 | 0.45 GB | +0.35 | ~140 |
| Q2_K | 2 | 0.32 GB | +0.80 | ~180 |

**Recommendation:** Q4_K_M for balance; Q5_K_M for quality-critical; Q3_K_M for edge.

**17.2 ONNXRuntime quantization**
- Static quantization (INT8): `ort.quantization.quantize_static` with calibration dataset.
- Dynamic quantization (INT8): `ort.quantization.quantize_dynamic` — faster to apply, slight accuracy cost.
- Per-channel for Conv/Linear; per-tensor for embeddings/LayerNorm.

**17.3 whisper.cpp quantization**
- `ggml-quantize` to Q5_1 or Q4_1 recommended.
- Tiny/base models: Q5_1 negligible WER increase.
- Large models: Q4_1 acceptable for CPU-only.

---

### 18. Appendix C: Constitutional trace example
```json
{
  "intentId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "constitutionalTrace": {
    "authority": {
      "actor": "user:alice",
      "contract": "contract.user.v1",
      "action": "multimodal.query",
      "granted": true,
      "policyResults": [
        { "policyId": "policy-no-execution-without-intent", "decision": "allow" },
        { "policyId": "policy-no-authority-without-contract", "decision": "allow" }
      ]
    },
    "validation": {
      "inputChecks": [
        { "check": "size_limit", "modality": "image", "result": "pass", "maxBytes": 10485760 },
        { "check": "safety_classifier", "modality": "image", "result": "pass", "score": 0.02 }
      ],
      "resourceQuota": { "cpuSeconds": 30, "memoryBytes": 4294967296, "granted": true }
    },
    "fusion": {
      "modalities": ["text", "image"],
      "textEmbeddingDim": 768,
      "imageEmbeddingDim": 512,
      "fusedDim": 1024,
      "method": "concat_projection",
      "evidenceId": "ev-fusion-550e8400"
    },
    "decision": {
      "model": "SmolLM-360M-Q4_K_M",
      "seed": 123456789,
      "promptTokens": 247,
      "completionTokens": 89,
      "reasonTrace": ["identified_object", "retrieved_knowledge", "synthesized_answer"],
      "evidenceId": "ev-decision-550e8400"
    },
    "evidence": {
      "bundleId": "bundle-550e8400",
      "worldId": "world-default",
      "timelineId": "timeline-session-123",
      "artifacts": [
        { "type": "image_embedding", "evidenceId": "ev-vis-550e8400", "model": "MobileViT-XXS-INT8", "checksum": "sha256:..." },
        { "type": "text_embedding", "evidenceId": "ev-txt-550e8400", "model": "SmolLM-360M-Q4_K_M", "checksum": "sha256:..." }
      ]
    },
    "verification": {
      "replayVerified": true,
      "replayEvidenceId": "ev-replay-550e8400",
      "deterministic": true
    },
    "replay": {
      "requestId": "replay-550e8400",
      "target": "decision",
      "result": "match",
      "diff": null
    },
    "audit": {
      "recordId": "audit-550e8400",
      "timestamp": "2026-08-04T12:34:56.789Z",
      "steward": "sme-audit-v1.0.0",
      "immutable": true
    }
  }
}
```

---

### 19. Appendix D: Directory layout (repository structure)
```
sme/
├── constitution/
│   ├── CHARTER.md                 # Master constitutional charter
│   └── sme-charter.json           # Machine-readable SME charter
├── engine/
│   ├── constitution/
│   │   ├── charter.js             # Constitutional engine charter (SoT)
│   │   ├── contracts.js           # Authority contracts
│   │   └── sme-contracts.js       # SME-specific contracts
│   ├── governance/
│   │   ├── policies/
│   │   │   └── default.policies.json
│   │   ├── ConstitutionalKnowledgeLayer.js
│   │   └── GovernanceKernel.js
│   ├── conformance/
│   │   └── default.conformance-profile.json
│   └── replay/
│       └── ReplayService.js
├── sme-core/
│   ├── src/
│   │   ├── auth/                  # SME-AUTH
│   │   ├── val/                   # SME-VAL
│   │   ├── fuse/                  # SME-FUSE
│   │   ├── dec/                   # SME-DEC
│   │   ├── evr/                   # SME-EVR
│   │   └── audit/                 # SME-AUDIT
│   ├── tests/
│   └── Cargo.toml / package.json / pyproject.toml
├── sme-txt/
│   ├── src/
│   │   ├── runtime/               # llama.cpp / ONNXRuntime wrapper
│   │   ├── tokenizer/
│   │   ├── models/                # Model loader, quantization
│   │   └── ifc/                   # SME-TXT-IFC implementation
│   ├── models/                    # Model weights (git-lfs)
│   ├── tests/
│   └── quantization/
├── sme-vis/
│   ├── src/
│   │   ├── encoder/               # ONNXRuntime vision encoder
│   │   ├── preprocess/
│   │   └── ifc/
│   ├── models/
│   └── tests/
├── sme-aud/
│   ├── src/
│   │   ├── whisper/               # whisper.cpp wrapper
│   │   ├── embed/
│   │   └── ifc/
│   ├── models/
│   └── tests/
├── sme-vid/
│   ├── src/
│   │   ├── sampler/               # Frame sampling strategies
│   │   ├── temporal/              # Temporal aggregation
│   │   └── ifc/
│   └── tests/
├── sme-gen/
│   ├── src/
│   │   ├── diffusion/             # CPU diffusion (ONNX/ggml)
│   │   ├── tts/                   # Piper/Coqui wrapper
│   │   ├── ffmpeg/                # Video stitching
│   │   ├── gpu-connector/         # Governed GPU offload
│   │   └── ifc/
│   ├── models/
│   └── tests/
├── sme-log/
│   ├── src/
│   │   ├── store/                 # SQLite/PostgreSQL evidence store
│   │   ├── index/                 # Replay index
│   │   ├── audit/                 # Audit log writer
│   │   └── api/                   # Evidence retrieval API
│   └── tests/
├── sdk/
│   ├── python/
│   ├── typescript/
│   ├── rust/
│   └── go/
├── deploy/
│   ├── docker/
│   │   ├── Dockerfile.sme-core
│   │   ├── Dockerfile.sme-txt
│   │   ├── ...
│   │   └── docker-compose.yml
│   ├── k8s/
│   │   ├── base/
│   │   ├── overlays/
│   │   └── helm/
│   └── nomad/
├── test/
│   ├── fixtures/
│   │   └── golden/
│   ├── conformance/
│   ├── integration/
│   ├── replay/
│   └── chaos/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── operations/
│   └── development/
├── .github/
│   └── workflows/
├── AGENTS.md                      # This project's agent lawbook
├── CITATION.cff
├── .zenodo.json
├── Makefile
├── README.md
└── LICENSE
```

---

### 20. Appendix E: Implementation task breakdown (for Director Agent dispatch)
| Task ID | Module | Agent | Description | Conformance Checks |
|---------|--------|-------|-------------|-------------------|
| SME-001 | sme-core | builder | Scaffold sme-core package with Authority, Validation, Fusion, Decision, EVR, Audit stubs | binding.director-contract-exists, governance.no-implicit-escalation |
| SME-002 | sme-core | implementor | Implement SME-AUTH with CKL integration | ckl.policy-load, ckl.deny-without-intent |
| SME-003 | sme-core | implementor | Implement SME-VAL with safety classifiers | ckl.modify-param, ckl.attach-provenance |
| SME-004 | sme-core | implementor | Implement SME-FUSE (concat + projection) | binding.resolver-exists, binding.all-tracks-resolved |
| SME-005 | sme-core | implementor | Implement SME-DEC with GovernanceKernel | authority.chain-valid, execution.no-cross-layer-mutation |
| SME-006 | sme-core | implementor | Implement SME-EVR (ProvenanceRecorder, ReplayService) | provenance.*, replay.* |
| SME-007 | sme-core | implementor | Implement SME-AUDIT (append-only, Merkle) | evidence.*, audit.* |
| SME-008 | sme-txt | builder | Scaffold sme-txt with llama.cpp/ORT wrapper stubs | - |
| SME-009 | sme-txt | implementor | Implement model loader (GGUF/Safetensors) + quantization | - |
| SME-010 | sme-txt | implementor | Implement tokenizer + chat template | - |
| SME-011 | sme-txt | implementor | Implement SME-TXT-IFC (generate, embed, decision_record) | provenance.frame-fields, evidence.bundle-fields |
| SME-012 | sme-txt | inspector | Write unit/integration tests for SME-TXT | normalization.brdf-energy (if applicable) |
| SME-013 | sme-vis | builder | Scaffold sme-vis with ONNXRuntime encoder stub | - |
| SME-014 | sme-vis | implementor | Implement MobileViT-XXS/ViT-Tiny loader + INT8 quant | - |
| SME-015 | sme-vis | implementor | Implement preprocess (resize, normalize, tensor) | - |
| SME-016 | sme-vis | implementor | Implement SME-VIS-IFC (encode, features, evidence) | provenance.frame-fields, evidence.bundle-fields |
| SME-017 | sme-aud | builder | Scaffold sme-aud with whisper.cpp wrapper stub | - |
| SME-018 | sme-aud | implementor | Implement whisper.cpp transcription + timestamps | - |
| SME-019 | sme-aud | implementor | Implement audio embedding extraction | - |
| SME-020 | sme-aud | implementor | Implement SME-AUD-IFC | provenance.frame-fields, evidence.bundle-fields |
| SME-021 | sme-vid | builder | Scaffold sme-vid with sampler + temporal stubs | - |
| SME-022 | sme-vid | implementor | Implement frame sampling (uniform, keyframe, scene-detect) | - |
| SME-023 | sme-vid | implementor | Implement temporal aggregation (mean, attention, TSM) | - |
| SME-024 | sme-vid | implementor | Implement SME-VID-IFC | provenance.frame-fields, evidence.bundle-fields |
| SME-025 | sme-gen | builder | Scaffold sme-gen with diffusion/tts/ffmpeg stubs | - |
| SME-026 | sme-gen | implementor | Implement CPU diffusion (SD 1.5 pruned, ONNX) | - |
| SME-027 | sme-gen | implementor | Implement Piper TTS wrapper | - |
| SME-028 | sme-gen | implementor | Implement FFmpeg video stitching | - |
| SME-029 | sme-gen | implementor | Implement governed GPU connector (NIM, local) | policy-no-render-without-provenance |
| SME-030 | sme-gen | implementor | Implement SME-GEN-IFC with AuthorityGrant check | authority.chain-valid |
| SME-031 | sme-log | builder | Scaffold sme-log with SQLite/Postgres store | - |
| SME-032 | sme-log | implementor | Implement evidence store + Merkle indexing | evidence.*, provenance.* |
| SME-033 | sme-log | implementor | Implement replay index + ReplayService | replay.* |
| SME-034 | sme-log | implementor | Implement audit log (append-only, signed) | audit.* |
| SME-035 | sdk/python | builder | Scaffold Python SDK with Pydantic models | - |
| SME-036 | sdk/python | implementor | Implement async client + retry/backoff | - |
| SME-037 | deploy | builder | Create Dockerfiles + docker-compose for local dev | - |
| SME-038 | deploy | builder | Create K8s base + overlays (dev/staging/prod) | - |
| SME-039 | test/conformance | architect | Design conformance test harness for 21 checks | All 21 checks |
| SME-040 | test/conformance | implementor | Implement conformance test runner | All 21 checks |
| SME-041 | test/integration | implementor | Write integration tests for full pipeline | timeline.*, binding.* |
| SME-042 | test/replay | implementor | Write deterministic replay verification tests | replay.* |
| SME-043 | docs | architect | Write API docs, architecture docs, runbooks | - |

---

### 21. Appendix F: Quick-start (developer)
```bash
# 1. Clone
git clone https://github.com/your-org/sme.git
cd sme

# 2. Install dev tools
make dev-setup  # installs llama.cpp, ONNXRuntime, whisper.cpp, rust, node, python deps

# 3. Pull models (pinned versions)
make pull-models  # downloads to ./models/ via git-lfs or artifact registry

# 4. Quantize (if needed)
make quantize  # runs quantization for CPU targets

# 5. Run locally (docker-compose)
docker-compose -f deploy/docker/docker-compose.yml up -d

# 6. Health check
curl http://localhost:8080/v1/health/ready

# 7. Submit intent
curl -X POST http://localhost:8080/v1/intent \
  -H "Content-Type: application/json" \
  -d '{
    "intentId": "550e8400-e29b-41d4-a716-446655440000",
    "modality": ["text", "image"],
    "goal": "Describe this image",
    "constraints": {"maxTokens": 256}
  }' \
  -F 'image=@test.jpg'

# 8. Poll result
curl http://localhost:8080/v1/intent/550e8400-e29b-41d4-a716-446655440000/result

# 9. Run tests
make test              # unit + integration
make test-conformance  # 21 conformance checks
make test-replay       # deterministic replay verification
```

---

### 22. Appendix G: Governance checklist (per change)
Before any PR merge, the Director Agent verifies:
- [ ] Intent declared with issue/reference
- [ ] File manifest lists all modified files
- [ ] Agent assignment matches contract (architect/builder/implementor/inspector/reviewer)
- [ ] Conformance checks identified (which of 21 affected)
- [ ] Test plan: unit, integration, conformance, replay
- [ ] Evidence produced: test logs, conformance output, replay verification
- [ ] No protected paths modified without authorization (constitution/, engine/constitution/, engine/governance/policies/, engine/conformance/, AGENTS.md)
- [ ] Status tags accurate (enforced/partial/declared/skeleton)
- [ ] Constitutional trace included in PR description
- [ ] Human approval obtained for constitutional changes

---

---

### 23. Appendix H: CPU‑Bound Mathematical Constraints (v1.1 Revision)
**Version:** 1.1  
**Classification:** Mathematical Invariant — Binding on all implementations

---

#### 0. CPU Reality: Three Hard Ceilings
A CPU‑first multimodal engine is governed by three mathematical ceilings that no software optimization can circumvent.

##### 0.1 FLOP Budget
| CPU Type | Sustained GFLOP/s (per core) |
|----------|------------------------------|
| AVX2 | 30–60 |
| AVX‑512 | 100–200 |

**Transformer FLOP Formula:**
```
FLOPs ≈ 2 · N_params · L_tokens
```

**Example — 1B params, 128 tokens:**
```
2 · 10^9 · 128 = 256 × 10^9 FLOPs
```

**Latency on 100 GFLOP/s core:**
```
256 GFLOPs / 100 GFLOP/s = 2.56 seconds
```

**Invariant — Model Size Ceiling:**
```
300M ≤ N_params ≤ 600M
```
This range ensures:
- <1s/token latency on AVX2/AVX‑512
- Fits in 200–350MB at Q4/Q5 quantization
- Avoids memory bandwidth saturation

**Quantization Contract:**
```
All tensors ∈ {Q4_0, Q4_1, Q5_0, Q5_1, INT8}
```

**Mathematical Invariant (per-token):**
```
FLOP_per_token ≤ 2 · N_params
```
SME‑TXT must publish its FLOP/token budget.

---

##### 0.2 Memory Bandwidth
| Memory | Bandwidth |
|--------|-----------|
| DDR4 | 20–30 GB/s |
| DDR5 | 40–60 GB/s |

**Model Size at INT8:**
```
1B params × 1 byte = 1 GB
```
A single forward pass touches most weights → bandwidth is the bottleneck.

**Quantization Sweet Spots:**
| Quant | Bytes/Param | 1B Model Size |
|-------|-------------|---------------|
| Q4 | 0.5 | 500 MB |
| Q3 | 0.375 | 375 MB |
| Q2 | 0.25 | 250 MB |

**Invariant:** Q4 (0.5 bytes/param) is the practical optimum for CPU inference.

---

##### 0.3 Cache Locality
```
L3 cache ≈ 20–64 MB
```
Model does not fit in cache. **Tensor tiling + blockwise quantization is mandatory.**

---

#### 1. Revised Module Constraints (Mathematically Grounded)

##### 1.1 SME‑TXT (Text Core)
| Constraint | Value | Derivation |
|------------|-------|------------|
| Parameter range | 300M–600M | FLOP budget + bandwidth |
| Quantization | Q4/Q5/INT8 | Bandwidth ceiling |
| FLOP/token budget | ≤ 2 · N_params | Transformer math |
| Context window | ≤ 4096 tokens | KV cache fits in RAM |

**Sweet-spot models:** SmolLM-360M, Qwen2.5-0.5B, Phi-3-mini (pruned to 600M)

---

##### 1.2 SME‑VIS (Vision Encoder)
| Constraint | Value | Derivation |
|------------|-------|------------|
| Parameter ceiling | ≤ 50M | Must leave budget for LLM |
| Embedding dimension | 512 | Fits in L2 cache; fast projection |
| Projection matrix | W_proj ∈ ℝ^{d_LLM × 512}, Q4 | Minimizes fusion cost |

**Projection Math:**
```
VIS_TOKEN = W_proj · VIS_EMBED
```

---

##### 1.3 SME‑AUD (Audio Encoder)
| Constraint | Value | Derivation |
|------------|-------|------------|
| Parameter ceiling | ≤ 30M | Whisper-tiny class |
| Transcript latency | 0.5–1.5s per 10s audio | whisper.cpp CPU benchmarks |
| Embedding dimension | 256 | Half of VIS; sufficient for fusion |

---

##### 1.4 SME‑VID (Video Encoder)
**Frame Sampling:**
```
k = ⌈F · r⌉
```
Where:
- F = total frames
- r = sampling ratio (CPU-safe: 0.03–0.05)
- k = key frames sampled

**Example — 30s @ 30 FPS:**
```
F = 900, k = 27–45
```

**Temporal Aggregation (Intentional Simplicity):**
```
VID_EMBED = (1/k) · Σ VIS_EMBED_i
```
No learned temporal model — avoids CPU explosion.

---

##### 1.5 SME‑GEN (Generative Module) — Hard Truths
**Diffusion FLOP Formula:**
```
FLOPs ≈ 2 · N_params · T_steps
```

**Example — 100M params, 20 steps:**
```
2 · 100M · 20 = 4B FLOPs
```

**Latency on 100 GFLOP/s CPU:**
```
4B / 100B = 40 seconds
```

| Modality | CPU Feasibility | Notes |
|----------|-----------------|-------|
| Image (512², SD 1.5 pruned) | Possible, slow | ~30–60s |
| Image (SDXL Turbo, 1-step) | Borderline | ~10–15s |
| Audio (Piper TTS) | Feasible | <1s realtime factor |
| Video (neural) | **Impossible** | 40s/frame minimum |

**Invariant:** Neural video generation is mathematically excluded from CPU-only SME. Use FFmpeg stitching.

---

#### 2. Constitutional Runtime — Mathematical Upgrade

##### 2.1 Authority Engine: Compute Authority
```
Allowed_FLOPs ≤ CPU_Budget
CPU_Budget = C_cores · GFLOP/s_per_core · t_max
```

**Example — 8-core AVX‑512, 2s max latency:**
```
CPU_Budget = 8 · 150 · 2 = 2400 GFLOPs
```
Every request must fit inside this budget. SME-AUTH rejects intents exceeding budget.

---

##### 2.2 Validation Engine: Bandwidth Validation
```
Model_Size ≤ RAM_Bandwidth · t_max
```

**Example — DDR5 @ 50 GB/s, 2s:**
```
Max_Model_Size = 100 GB (theoretical)
Practical_Limit ≈ 1 GB (multiple passes + KV cache)
```
Q4 500M model (500 MB) fits comfortably.

---

##### 2.3 Fusion Engine: Token Budget Math
```
Total_Tokens = T_text + T_vis + T_aud + T_vid
```
Where:
```
T_vis = dim(VIS_EMBED) / d_LLM
T_aud = dim(AUD_EMBED) / d_LLM
T_vid = k · T_vis
```

**Invariant:**
```
T_total ≤ T_max (LLM context window)
```
Fusion enforces this; truncation strategy recorded in Evidence.

---

#### 3. Improved Honest Bottom Line (Mathematically Verified)

**✅ Mathematically Possible on CPU:**
- Text reasoning (300M–600M models, Q4/Q5)
- Image understanding (≤50M models, INT8)
- Audio transcription (≤30M models, INT8)
- Video understanding via key-frame sampling (r=0.03–0.05)
- Image generation (slow, 30–60s at 512²)
- Audio generation (moderate, <1s realtime factor)

**❌ Mathematically Impossible on CPU:**
- High‑resolution image generation (>512², multi-step diffusion)
- Any modern video generation (neural)
- Any multimodal model >1B params
- Any diffusion model >200M params with T>10 steps
- Real-time video inference (>5 FPS neural)

**The Right Mental Model:**
> "Small, quantized encoders + a compact LLM + classic media tooling, all governed by your constitutional runtime — with hard FLOP, bandwidth, and cache budgets enforced at every chain step."

---

### 24. Appendix I: Resource Budget Specification (Per-Request)
This appendix defines the quantitative resource budgets that SME-AUTH and SME-VAL enforce.

| Resource | Budget (Default) | Configurable | Enforcement Point |
|----------|------------------|--------------|-------------------|
| **Compute (GFLOPs)** | 2400 | `cpu_budget_gflops` | SME-AUTH (pre-flight), SME-VAL (runtime) |
| **Model RAM (GB)** | 4 | `max_model_ram_gb` | SME-VAL (model load) |
| **KV Cache (GB)** | 2 | `max_kv_cache_gb` | SME-TXT (allocation) |
| **Context Tokens** | 4096 | `max_context_tokens` | SME-FUSE (truncation) |
| **Video Frames Sampled** | 45 | `max_video_frames` | SME-VID (sampler) |
| **Audio Duration (s)** | 300 | `max_audio_seconds` | SME-AUD (whisper.cpp) |
| **Generation Steps** | 20 | `max_gen_steps` | SME-GEN (diffusion) |
| **Wall-clock Latency (s)** | 30 | `max_latency_seconds` | SME-VAL (timeout) |

**Budget Enforcement Flow:**
```
USER_INTENT
    │
    ▼
SME-AUTH: Static budget check (model sizes + estimated FLOPs)
    │
    ▼
SME-VAL: Dynamic quotas (per-request CPU seconds, RAM)
    │
    ▼
SME-FUSE: Token budget enforcement (truncation + evidence)
    │
    ▼
SME-DEC: Generation budget (steps, resolution, fallback)
    │
    ▼
GOVERNED_RESPONSE (or BUDGET_EXCEEDED error with Evidence)
```

**Budget Exceeded Error Schema:**
```json
{
  "error": "BUDGET_EXCEEDED",
  "budget": "compute_gflops",
  "requested": 3200,
  "limit": 2400,
  "evidenceId": "ev-budget-550e8400",
  "suggestion": "Reduce context, use smaller model, or enable GPU offload"
}
```

---

---

### 25. Appendix J: Sovereign Kernel Interface (SKI) v0.11
**Classification:** Constitutional Kernel Layer — Binding on all substrate implementations  
**Scope:** Hardware-neutral primitives for LLM and multimodal workloads with CPU and legacy GPU implementations.

#### 25.1 Goal
Provide a hardware-neutral, constitutional kernel layer for LLM and multimodal workloads, with implementations on CPU and legacy GPUs (CUDA 10/11).

#### 25.2 Core Primitives

| Primitive | Purpose |
|-----------|---------|
| `SKI_MATMUL` | Dense matrix multiplication |
| `SKI_ATTENTION` | Single-layer self-attention block |
| `SKI_LAYER_NORM` | Layer normalization |
| `SKI_EMBED` | Token/feature embedding lookup + projection |
| `SKI_CONV` | Convolution for vision/audio modules |

---

#### 25.3 SKI Primitive Specifications

##### 25.3.1 SKI_MATMUL
**Signature:**
```
Input:
  A: [M × K]
  B: [K × N]
  Config: {dtype, quantization_format, transpose_flags}

Output:
  C: [M × N]
```

**Contract:**
- **Determinism:** Same inputs + config → same outputs.
- **Quantization:** Must support FP32, FP16, INT8, Q4/Q5 (blockwise).
- **Replay:** All calls logged with `KernelCallId`, shapes, dtypes, and seeds (if any).

---

##### 25.3.2 SKI_ATTENTION
**Signature:**
```
Input:
  Q: [B × T × D]
  K: [B × T × D]
  V: [B × T × D]
  KVCacheHandle (optional)
  Config: {heads, scaling, masking}

Output:
  O: [B × T × D]
```

**Contract:**
- **Masking:** Must support causal and arbitrary masks.
- **KV Cache:** If `KVCacheHandle` provided, must append and reuse keys/values.
- **Determinism:** Given same cache state + inputs → identical outputs.

---

##### 25.3.3 SKI_LAYER_NORM
**Signature:**
```
Input:
  X: [B × T × D]
  gamma: [D]
  beta: [D]
  epsilon: scalar

Output:
  Y: [B × T × D]
```

**Contract:**
- Must be numerically stable for FP16/INT8 inputs.
- Must record `epsilon` and `dtype` in evidence.

---

##### 25.3.4 SKI_EMBED
**Signature:**
```
Input:
  ids: [B × T]
  EmbeddingTable: [V × D]
  Config: {positional_encoding, RoPE, etc.}

Output:
  E: [B × T × D]
```

**Contract:**
- Must support static + rotary positional encodings.
- Must log `EmbeddingTableVersion` and encoding type.

---

##### 25.3.5 SKI_CONV
**Signature:**
```
Input:
  X: [B × C × H × W]
  W: [C_out × C × kH × kW]
  Config: {stride, padding, dilation}

Output:
  Y: [B × C_out × H_out × W_out]
```

**Contract:**
- Must support INT8/Q4/Q5 weights.
- Must log kernel shape and stride/padding in evidence.

---

### 26. Appendix K: Sovereign LLM Architecture v0.1
**Classification:** Mathematical Architecture — Binding on SME-TXT implementation

#### 26.1 Parameter Ranges (Mathematically Derived from Appendix H)

| Parameter | Range | Derivation |
|-----------|-------|------------|
| Total params (N_params) | 150M–400M | FLOP budget + bandwidth ceiling (Appendix H §0.1, §0.2) |
| Hidden dimension (D) | 768–1024 | Fits in L2/L3 cache for blockwise matmul |
| Heads (H) | 8–12 | D divisible by H; head dim 64–128 |
| Layers (L) | 16–24 | Depth/width trade-off for 150M–400M total |

**Invariant:** Any configuration outside these ranges violates the CPU mathematical ceilings.

---

#### 26.2 Layer Shape (Per Transformer Block)
```
Input: X_l: [B × T × D]

Block:
  X_ln     = SKI_LAYER_NORM(X_l)
  Q, K, V  = SKI_MATMUL(X_ln, W_qkv) reshaped to heads
  A        = SKI_ATTENTION(Q, K, V, KVCacheHandle)
  X_att    = X_l + SKI_MATMUL(A, W_o)
  X_mln    = SKI_LAYER_NORM(X_att)
  X_ff     = SKI_MATMUL(X_mln, W_ff1) → nonlinearity → SKI_MATMUL(·, W_ff2)
  X_{l+1}  = X_att + X_ff
```

**Weight Shapes:**
- `W_qkv`: [D × 3D] (Q4 quantized)
- `W_o`: [D × D] (Q4 quantized)
- `W_ff1`: [D × 4D] (Q4 quantized)
- `W_ff2`: [4D × D] (Q4 quantized)

---

#### 26.3 Attention Type
- **Type:** Standard multi-head self-attention
- **Scaling:** 1/√(D/H)
- **Masking:** Causal mask for text; optional custom masks for multimodal fusion
- **KV Cache:** Per layer, per head (see §26.4)

---

#### 26.4 KV Cache Format
```
Per layer, per head:
  K_cache: [B × T_max × D/H]
  V_cache: [B × T_max × D/H]

Storage:
  Blockwise quantized (Q4/Q5) with per-block scales.
```

**Contract:**
- Cache operations must be append-only with explicit `CacheVersion`.
- Cache state must be serializable for replay (SME-EVR integration).

---

### 27. Appendix L: Substrate Adapter Contract v0.1
**Classification:** Runtime Governance — Binding on SME-Core substrate selection

#### 27.1 Role
The Substrate Adapter exposes SKI primitives and binds them to concrete implementations on:
- **CPU substrate** (AVX2, AVX-512, NEON, SVE)
- **Legacy GPU substrate** (CUDA 10.x/11.x, cuDNN 7/8)

The constitutional runtime calls SKI; the adapter decides which substrate executes each primitive.

---

#### 27.2 Registration
Each substrate implementation registers a `SubstrateProfile`:

```json
{
  "SubstrateId": "CPU_AVX2" | "GPU_CUDA_10",
  "Primitives": ["SKI_MATMUL", "SKI_ATTENTION", "SKI_LAYER_NORM", "SKI_EMBED", "SKI_CONV"],
  "Dtypes": ["FP32", "FP16", "INT8", "Q4", "Q5"],
  "Limits": {
    "max_tensor_size": 1073741824,
    "max_batch": 32
  },
  "PerfProfile": {
    "matmul_gflops_per_s": 150,
    "attention_latency_us_per_token": 200,
    "conv_gflops_per_s": 100
  }
}
```

---

#### 27.3 Selection by Constitutional Runtime
For each SKI call, the runtime (SME-Core):

1. **Computes cost estimate per substrate:**
   ```
   EstimatedLatency = f(shape, PerfProfile)
   EstimatedFLOPs   = g(shape)
   ```

2. **Checks governance constraints:**
   - Max FLOP budget (Appendix I)
   - Energy/resource limits
   - Determinism requirements

3. **Chooses substrate:**
   - **Prefer CPU for:** small batch, autoregressive loops, strict determinism
   - **Prefer GPU for:** large matmuls, batched convs, vision/audio encoders

4. **Logs decision (Evidence):**
   ```json
   {
     "KernelCallId": "ski-call-550e8400",
     "ChosenSubstrateId": "CPU_AVX2",
     "Reason": "CPU for determinism",
     "EstimatedFLOPs": 1200000000,
     "EstimatedLatencyMs": 15
   }
   ```

---

#### 27.4 Adapter Guarantees
| Guarantee | Description |
|-----------|-------------|
| **Uniform API** | SKI signatures identical regardless of substrate |
| **Determinism Flag** | Runtime can request deterministic mode; adapter must honor or reject explicitly |
| **Replayability** | All substrate calls reconstructible from logs: inputs, shapes, dtypes, seeds, substrate choice |

---

### 28. Appendix M: Capability Planner v1.0
**Classification:** Constitutional Resource Estimation — First Stage of Execution Chain

#### 28.1 Purpose
The Capability Planner is the first stage of the constitutional execution chain. It performs resource estimation, hardware matching, and execution planning before the Authority Engine applies policy.

It transforms a raw user request into a `CapabilityPlan`.

#### 28.2 Inputs
| Input | Description |
|-------|-------------|
| `UserRequest` | Intent, modalities, constraints (latency, local-only, privacy, etc.) |
| `HardwareProfile` | CPU/GPU capabilities, RAM, bandwidth, determinism capabilities, energy/policy constraints |
| `ModelProfile` | SME-TXT (Sovereign LLM v0.2), SME-VIS/AUD/VID, SME-GEN, quantization formats, context windows |
| `PolicyContext` | CIEMS constitutional rules, offload rules, safety/privacy constraints |

#### 28.3 Outputs — CapabilityPlan
| Field | Description |
|-------|-------------|
| `Estimated_FLOPs` | Per module and total |
| `Estimated_RAM` | Peak and steady-state |
| `Estimated_Bandwidth` | Memory + I/O |
| `Estimated_Latency` | Per phase and end-to-end |
| `RequiredModalities` | TXT / VIS / AUD / VID / GEN |
| `ExecutionMode` | LOCAL, DEFER, OFFLOAD, or HYBRID |
| `SubstrateHints` | Preferred CPU/GPU usage per SKI primitive |
| `PlanEvidence` | Full trace of estimates for replay |

#### 28.4 Constitutional Placement
```
USER_REQUEST
      ↓
Capability Planner (resource estimation)
      ↓
Authority Engine (policy)
      ↓
Validation Engine (safety, limits)
      ↓
Execution Engine (SME-CORE)
      ↓
Evidence & Replay Engine
      ↓
Audit & Stewardship
```
This separation keeps policy and resource estimation cleanly divided.

---

### 29. Appendix N: Hardware Profiles v1.0
**Classification:** Constitutional Hardware Abstraction — Binding on Substrate Adapter

#### 29.1 Purpose
Hardware Profiles allow the runtime to adapt execution automatically based on the node's capabilities. They eliminate assumptions and enable dynamic scheduling.

#### 29.2 Canonical Profiles

| Profile | CPU | GPU | RAM | Bandwidth | Use Case |
|---------|-----|-----|-----|-----------|----------|
| `MINI_PC` | 2–4 cores, AVX2, 30–60 GFLOP/s | None or weak integrated | 8–16 GB DDR4 | Low | Edge, embedded, CPU-only |
| `LAPTOP` | 4–8 cores, AVX2/AVX-512, 60–120 GFLOP/s | Integrated or mid-range | 16–32 GB DDR4/5 | Moderate | Developer, mobile workstation |
| `WORKSTATION` | 8–32 cores, AVX-512, 150–300 GFLOP/s | Strong GPU (CUDA 10/11) | 32–128 GB DDR5 | High | Local hybrid execution |
| `GPU_NODE` | Many GPUs, high VRAM, high bandwidth | Multiple high-end GPUs | 64–512 GB | Very High | Governed offload target |

#### 29.3 HardwareProfile Schema
```json
{
  "ProfileId": "MINI_PC" | "LAPTOP" | "WORKSTATION" | "GPU_NODE",
  "CPU": {
    "Cores": 8,
    "ISA": "AVX-512",
    "GFLOPs_per_second": 150
  },
  "GPU": {
    "Count": 1,
    "VRAM_GB": 16,
    "API": "CUDA_11",
    "GFLOPs_per_second": 2000
  },
  "Memory": {
    "RAM_GB": 64,
    "Bandwidth_GBps": 50
  },
  "Storage": {
    "Type": "NVMe",
    "IO_Bandwidth": 3.5
  },
  "DeterminismCapabilities": true,
  "EnergyConstraints": {},
  "OffloadPolicy": {}
}
```

---

### 30. Appendix O: Scheduling Contract v1.0
**Classification:** Constitutional Execution Governance — Binding on SME-Core

#### 30.1 Purpose
Defines how Capability Plans are executed, modified, or denied under constitutional rules.

#### 30.2 Scheduling Phases

**Phase 1 — Planning**
Capability Planner produces:
- Resource estimates
- Execution mode
- Substrate hints

**Phase 2 — Authority**
Authority Engine:
- Approves
- Modifies
- Denies

Based on:
- CIEMS sovereignty stack
- Privacy rules
- Offload rules
- Modality permissions

**Phase 3 — Validation**
Validation Engine:
- Enforces safety
- Enforces resource limits
- Enforces modality constraints

**Phase 4 — Execution**
SME-CORE:
- Uses Substrate Adapter
- Executes SKI primitives
- Applies multimodal fusion
- Runs SME-TXT (Sovereign LLM v0.2)

**Phase 5 — Evidence & Replay**
All decisions logged:
- CapabilityPlan
- Authority decisions
- Substrate choices
- SKI calls
- KV cache states
- Seeds
- Model versions

**Phase 6 — Audit & Stewardship**
Long-term lineage tracking.

---

### 31. Appendix P: SME-CORE Integration Blueprint (Updated)
**Classification:** Constitutional Orchestration Architecture

#### 31.1 Full Constitutional Execution Chain
```
USER_REQUEST
      ↓
Capability Planner
      ↓
Hardware Profile Matching
      ↓
CapabilityPlan
      ↓
Authority Engine (SME-AUTH)
      ↓
Validation Engine (SME-VAL)
      ↓
SME-CORE Execution
      ↓
SKI Layer
      ↓
Substrate Adapter (CPU/GPU)
      ↓
Evidence & Replay
      ↓
Audit & Stewardship
```

#### 31.2 SME-CORE Subsystems
| Subsystem | Role | Authority Contract |
|-----------|------|-------------------|
| SME-AUTH | Policy enforcement | `contract.sme-auth.v1` |
| SME-VAL | Safety & limits | `contract.sme-val.v1` |
| SME-FUSE | Multimodal fusion | `contract.sme-fuse.v1` |
| SME-DEC | Decision engine | `contract.sme-dec.v1` |
| SME-EVR | Evidence & replay | `contract.sme-evr.v1` |
| SME-AUDIT | Audit & stewardship | `contract.sme-audit.v1` |

Now preceded by:
- **Capability Planner**
- **Hardware Profile Matching**

---

### 32. Appendix Q: SKI → SME-TXT Wiring Diagram (Updated)
**Classification:** Kernel-to-Model Binding — Binding on SME-TXT Implementation

```
SME-TXT
  ↓
SKI_LAYER_NORM
  ↓
SKI_MATMUL (QKV)
  ↓
SKI_ATTENTION (KV cache)
  ↓
SKI_MATMUL (output)
  ↓
SKI_LAYER_NORM
  ↓
SKI_MATMUL (FFN)
  ↓
SKI_MATMUL (FFN output)
  ↓
SKI_MATMUL (logits)
```

All SKI calls routed through Substrate Adapter using CapabilityPlan hints.

---

### 33. Appendix R: Legacy GPU Kernel Library Design (Updated)
**Classification:** Substrate Implementation — Binding on GPU Substrate Adapter

| Kernel | Supported Formats | Determinism | Notes |
|--------|-------------------|-------------|-------|
| `GPU_SKI_MATMUL` | FP32/FP16/INT8/Q4/Q5 | Batched GEMM, deterministic mode | For large matmuls |
| `GPU_SKI_ATTENTION` | FP16/INT8/Q4/Q5 | Standard attention, small seq | For autoregressive steps |
| `GPU_SKI_LAYER_NORM` | FP16/INT8/Q4/Q5 | Fused reduction + scale/shift | |
| `GPU_SKI_EMBED` | FP16/INT8/Q4/Q5 | Batched lookup, optional RoPE | |
| `GPU_SKI_CONV` | INT8/Q4/Q5 | Optimized for CUDA 10/11 | For VIS/AUD encoders |

---

### 34. Appendix S: Sovereign LLM v0.2 (Multimodal Fusion)
**Classification:** Model Architecture — Binding on SME-TXT Implementation

#### 34.1 Fusion Tokens
- `<VIS>` tokens: projected vision embeddings
- `<AUD>` tokens: projected audio embeddings
- `<VID>` tokens: projected video embeddings

#### 34.2 Attention Mask
| Modality | Mask Type |
|----------|-----------|
| Text | Causal |
| Vision | Bidirectional (to all prior tokens) |
| Audio | Bidirectional |
| Video | Bidirectional |

Governed by SME-FUSE.

#### 34.3 KV Cache
- Modality tokens included in initial cache
- Text attends to modality tokens
- Cache version logged for replay

---

### 35. Appendix T: Constitutional Execution Environment (CEE) v1.0
**Classification:** Runtime Architecture — Binding on Sovereign OS Runtime

#### 35.1 Runtime Layers
| Layer | Components |
|-------|------------|
| Constitutional | CIEMS sovereignty stack, constitutional rules, policy context, governance invariants |
| Intent | Request parsing, modality extraction, constitutional context binding |
| Capability | Capability Planner, Hardware Profile Matching, CapabilityPlan generation |
| Authority | Policy enforcement, modality authority, compute authority, offload authority |
| Validation | Safety, resource limits, modality constraints, input validation |
| Execution | SME-CORE orchestration, SKI primitives, Substrate Adapter, multimodal modules, Sovereign LLM v0.2 |
| Evidence | Full trace logging, replay state, deterministic reconstruction |
| Audit | Stewardship, lineage, conformance, promotion tracking |

#### 35.2 Runtime Contracts

**Determinism Contract:** Given same inputs, CapabilityPlan, HardwareProfile, model versions, seeds → identical outputs.

**Replay Contract:** All executions reconstructible from SKI logs, substrate logs, KV cache states, seeds, model versions, CapabilityPlan, Authority decisions.

**Modality Neutrality Contract:** No modality bypasses constitutional review.

**Framework Independence Contract:** Hardware frameworks (CUDA/OpenCL/DirectML) are substrations, not authorities.

#### 35.3 Runtime Scheduling
| Mode | Hardware | Characteristics |
|------|----------|-----------------|
| Local | MINI_PC / LAPTOP | CPU-first, GPU optional |
| Hybrid | WORKSTATION | CPU + legacy GPU |
| Offload | GPU_NODE | Governed external execution |
| Deferred | Any | When resource limits or policy forbid immediate execution |

#### 35.4 Runtime Promotion Path (CIEMS-aligned)
```
Substration → Substrate → Conformance → Implementation → Deployment → Stewardship
```

---

### 36. Appendix U: Sovereign Execution Graph v1.0
**Classification:** Canonical Execution Topology — Binding on All Modules

#### 36.1 Top-Level Graph
```
USER_REQUEST
      ↓
Intent Layer
      ↓
Capability Planner
      ↓
Hardware Profile Matching
      ↓
CapabilityPlan
      ↓
Authority Engine (SME-AUTH)
      ↓
Validation Engine (SME-VAL)
      ↓
Execution Engine (SME-CORE)
      ↓
SKI Layer (Kernel Interface)
      ↓
Substrate Adapter (CPU/GPU)
      ↓
Modality Modules (VIS/AUD/VID/GEN)
      ↓
Sovereign LLM v0.2 (SME-TXT)
      ↓
Governed Response Assembly
      ↓
Evidence & Replay Engine (SME-EVR)
      ↓
Audit & Stewardship Engine (SME-AUDIT)
```

#### 36.2 Execution Graph Nodes

| Node | Responsibility | Evidence Produced |
|------|---------------|-------------------|
| Intent Layer | Parse request, extract modality intent, attach constitutional context | `IntentRecord` |
| Capability Planner | Estimate FLOPs/RAM/bandwidth/latency, determine modalities, choose execution mode | `CapabilityPlan` |
| Hardware Profile Matching | Match plan to node capabilities, adjust plan | `HardwareMatchRecord` |
| Authority Engine | Apply CIEMS sovereignty, grant/deny modality+compute authority | `AuthorityRecord` |
| Validation Engine | Enforce safety, resource limits, modality constraints | `ValidationRecord` |
| Execution Engine | Orchestrate multimodal ingestion, fusion, Sovereign LLM v0.2, SME-GEN | `ExecutionRecord` |
| SKI Layer | All numeric ops as SKI primitives, no direct hardware calls | `KernelCallRecord` |
| Substrate Adapter | Choose CPU/GPU per SKI call, log substrate choice | `SubstrateChoiceRecord` |
| Modality Modules | SME-VIS, SME-AUD, SME-VID, SME-GEN | `ModalityRecord` |
| Sovereign LLM v0.2 | Multimodal fusion tokens, governed attention masks, KV cache with modality tokens | `LLMRecord` |
| Evidence & Replay | Log all SKI calls, substrate choices, KV cache states, seeds, model versions | `EvidenceBundle` |
| Audit & Stewardship | Long-term lineage, compliance, promotion tracking | `AuditRecord` |

---

### 37. Appendix V: Sovereign OS Runtime v1.0
**Classification:** Full Constitutional Operating Runtime Specification

#### 37.1 Purpose
Sovereign OS Runtime is the governed execution substrate for all constitutional computing workloads. It integrates CIEMS, SME-CORE, SKI, Capability Planner, Hardware Profiles, and the CEE. It is the operating system for governed intelligence.

#### 37.2 Runtime Layers
(See Appendix T §35.1)

#### 37.3 Runtime Contracts
(See Appendix T §35.2)

#### 37.4 Runtime Scheduling
(See Appendix T §35.3)

#### 37.5 Runtime Promotion Path
(See Appendix T §35.4)

---

### 38. Appendix W: Sovereign OS Kernel v1.0
**Classification:** Constitutional Scheduler + Substrate Manager + Execution Spine

#### 38.1 Purpose
The Sovereign OS Kernel is the governed execution substrate that:
- Schedules constitutional workloads
- Manages CPU/GPU substrates
- Executes SKI primitives
- Enforces CIEMS invariants
- Provides deterministic replay
- Powers SME-CORE and the CEE

#### 38.2 Kernel Subsystems

| Subsystem | Role |
|-----------|------|
| **Scheduler** | Uses CapabilityPlan + HardwareProfile, chooses execution mode (LOCAL/HYBRID/OFFLOAD/DEFER), allocates compute budgets, prioritizes constitutional workloads |
| **Substrate Manager** | Registers CPU/GPU substrates, maintains capabilities, routes SKI primitives, enforces determinism mode |
| **Execution Spine** | Runs SME-CORE, executes SKI primitives, manages KV cache, handles multimodal fusion |
| **Memory & Bandwidth Controller** | Enforces RAM limits, enforces bandwidth budgets, performs tensor tiling + quantization management |
| **Replay Engine** | Records all kernel calls, serializes KV cache, stores seeds, model versions, substrate choices |
| **Constitutional Guard** | Enforces CIEMS invariants, blocks unauthorized modalities/offload, ensures framework independence |

#### 38.3 Kernel Contracts
- **Determinism Contract:** Identical outputs given identical inputs, CapabilityPlan, HardwareProfile, seeds, model versions, substrate choices.
- **Replay Contract:** Kernel serializes SKI calls, KV cache, seeds, substrate choices, CapabilityPlan, Authority decisions.
- **Substrate Neutrality Contract:** CPU/GPU treated as interchangeable substrates.

---

### 39. Appendix X: Sovereign OS Service Contracts v1.0
**Classification:** Governed External Service Integration

#### 39.1 Purpose
Define how external services integrate with Sovereign OS under constitutional governance.

#### 39.2 Service Types
- **Local Services:** Local GPU nodes, local media encoders, local storage, local multimodal modules
- **Remote Services:** Governed GPU offload, governed inference endpoints, governed storage, governed multimodal generators

#### 39.3 Service Contract Schema
```json
{
  "ServiceId": "gpu-node-001",
  "ServiceType": "REMOTE",
  "Capabilities": ["SKI_MATMUL", "SKI_ATTENTION", "SKI_CONV"],
  "ResourceCosts": {
    "FLOPs": 10000000000,
    "RAM_GB": 8,
    "Bandwidth_GBps": 10,
    "Latency_ms": 50
  },
  "DeterminismGuarantees": "replay_artifacts_provided",
  "PrivacyLevel": "restricted",
  "OffloadPolicy": "governed_only",
  "EvidenceRequirements": ["call_logs", "seeds", "model_versions", "substrate_ids"],
  "ReplayRequirements": "full_deterministic_replay_or_artifacts"
}
```

#### 39.4 Constitutional Requirements
1. **Authority Gate:** No service invoked without explicit AuthorityGrant.
2. **Evidence Gate:** All service calls produce call logs, seeds, model versions, substrate identifiers.
3. **Replay Gate:** Remote services must support deterministic replay or provide replay artifacts.
4. **Privacy Gate:** Sensitive data may not be offloaded unless policy allows.

---

### 40. Appendix Y: Sovereign OS Multimodal Shell v1.0
**Classification:** User-Facing Constitutional Interface

#### 40.1 Purpose
The Multimodal Shell is the user interface for Sovereign OS:
- Accepts text, image, audio, video
- Displays governed multimodal responses
- Shows constitutional traces
- Provides interactive multimodal workflows

#### 40.2 Shell Architecture

| Layer | Components |
|-------|------------|
| Input | Text, image upload, audio input, video input, multimodal sequences |
| Intent | Parses modality intent, constraints, privacy requirements, execution preferences |
| Constitutional Display | Shows authority decisions, CapabilityPlan summary, substrate usage, replay trace, modality permissions |
| Multimodal Output | Governed text, images, audio, video, fused responses |
| Interaction | Follow-up questions, intent refinement, modality toggling, privacy mode switching, local/offload selection |

#### 40.3 Shell Contracts
- **Transparency Contract:** Shell must show which modalities used, which substrates executed, which policies applied.
- **Privacy Contract:** Shell must enforce local-only mode, no offload for sensitive data, user-controlled modality permissions.
- **Replay Contract:** Shell must allow replay of previous executions, inspection of constitutional trace.

---

### 41. Appendix Z: Full Sovereign OS Stack (Unified)
**Classification:** Complete Constitutional Computing Stack

```
Sovereign OS Runtime v1.0
    ↓
Sovereign OS Kernel v1.0
    ↓
Capability Planner v1.0
    ↓
Hardware Profiles v1.0
    ↓
Scheduling Contract v1.0
    ↓
SME-CORE
    ↓
SKI Layer
    ↓
Substrate Adapter
    ↓
CPU/GPU Substrates
    ↓
Modality Modules (VIS/AUD/VID/GEN)
    ↓
Sovereign LLM v0.2
    ↓
Evidence & Replay
    ↓
Audit & Stewardship
    ↓
Sovereign OS Multimodal Shell v1.0
    ↓
Sovereign OS Service Contracts v1.0
```

---

*End of Sovereign Multimodal Engine v1.1 Constitutional Technical Specification (Draft)*