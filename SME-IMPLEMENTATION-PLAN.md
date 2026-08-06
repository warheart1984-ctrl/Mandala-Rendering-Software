# Sovereign Multimodal Engine v1.1 — Implementation Plan
**Revision:** CPU-Bound Mathematical Constraints Applied
**Spec Version:** 1.1 (see SME-SPEC.md Appendix H & I)

## Overview
This plan breaks the SME specification into **discrete tasks** across 7 modules, each assigned to a constitutional crew agent with specific file manifests, acceptance criteria, and conformance check mappings. **All model size, quantization, and compute budgets now reflect the mathematical ceilings in SME-SPEC.md §23 (Appendix H).**

**Key Budget Changes from v1.0:**
| Module | v1.0 Ceiling | v1.1 Ceiling (Mathematical) | Rationale |
|--------|--------------|------------------------------|-----------|
| SME-TXT | 100M–1B | **300M–600M** | FLOP budget + bandwidth |
| SME-VIS | Mobile-scale | **≤50M params** | Must leave budget for LLM |
| SME-AUD | Whisper-style | **≤30M params** | Whisper-tiny class |
| SME-VID | Frame-based | **r=0.03–0.05 sampling** | CPU budget for temporal agg |
| SME-GEN | CPU diffusion | **Image only (slow); Video impossible** | 40s/frame minimum for diffusion |

---

## Phase 0: Constitutional Foundation (Week 0)
*Must complete before any module work begins.*

| Task | Agent | Files | Acceptance | Conformance |
|------|-------|-------|------------|-------------|
| **CF-001** | director | `constitution/CHARTER.md`, `engine/constitution/charter.js`, `engine/constitution/contracts.js`, `engine/constitution/sme-contracts.js`, `engine/governance/policies/default.policies.json`, `engine/conformance/default.conformance-profile.json`, `AGENTS.md` | All constitutional artifacts present and valid; CI loads policies; 21 conformance checks defined | All 21 (baseline) |
| **CF-002** | architect | `docs/architecture/00-foundation.md` | Architecture decision record for CPU-first multimodal stack with mathematical budgets | - |
| **CF-003** | builder | `Makefile`, `.github/workflows/ci.yml`, `pyproject.toml`, `Cargo.toml`, `package.json` | `make dev-setup` works; CI passes lint + typecheck | - |
| **CF-004** | architect | `sme-core/src/auth/budget.py`, `sme-core/src/val/budget.py` | Compute & bandwidth budget models implemented per Appendix I | `ckl.modify-param` |

---

## Phase 1: SME-Core — Constitutional Runtime (Weeks 1–2)

### SME-001: Scaffold sme-core
| | |
|---|---|
| **Agent** | builder |
| **Contract** | scaffold |
| **Files** | `sme-core/src/auth/__init__.py`, `sme-core/src/val/__init__.py`, `sme-core/src/fuse/__init__.py`, `sme-core/src/dec/__init__.py`, `sme-core/src/evr/__init__.py`, `sme-core/src/audit/__init__.py`, `sme-core/src/__init__.py`, `sme-core/pyproject.toml`, `sme-core/tests/__init__.py` |
| **Acceptance** | Package imports; empty tests pass; stubs have type hints matching IFCs |
| **Conformance** | `binding.director-contract-exists`, `governance.no-implicit-escalation` |

### SME-002: SME-AUTH — Authority Engine
| | |
|---|---|
| **Agent** | implementor |
| **Contract** | implement |
| **Files** | `sme-core/src/auth/engine.py`, `sme-core/src/auth/contracts.py`, `sme-core/src/auth/policies.py`, `sme-core/src/auth/__init__.py`, `sme-core/tests/test_auth.py` |
| **Acceptance** | Evaluates `UserIntent` against CKL policies; returns `AuthorityRecord` with policyResults; integrates `ConstitutionalKnowledgeLayer` |
| **Conformance** | `ckl.policy-load`, `ckl.deny-without-intent`, `policy-no-authority-without-contract`, `policy-director-contract-required` |

### SME-003: SME-VAL — Validation Engine
| | |
|---|---|
| **Agent** | implementor |
| **Contract** | implement |
| **Files** | `sme-core/src/val/engine.py`, `sme-core/src/val/safety.py`, `sme-core/src/val/quotas.py`, `sme-core/src/val/__init__.py`, `sme-core/tests/test_val.py` |
| **Acceptance** | Validates size/type/safety per modality; enforces resource quotas; returns `ValidationRecord`; integrates CKL `modify_param` for throttling |
| **Conformance** | `ckl.modify-param`, `ckl.attach-provenance`, `policy-no-render-without-provenance` |

### SME-004: SME-FUSE — Fusion Engine
| | |
|---|---|
| **Agent** | implementor |
| **Contract** | implement |
| **Files** | `sme-core/src/fuse/engine.py`, `sme-core/src/fuse/projection.py`, `sme-core/src/fuse/binding.py`, `sme-core/src/fuse/__init__.py`, `sme-core/tests/test_fuse.py` |
| **Acceptance** | Concatenates modality embeddings → projection to fused dim; `BindingResolver` maps track bindings; returns `FusionRecord` with evidenceId |
| **Conformance** | `binding.resolver-exists`, `binding.all-tracks-resolved`, `provenance.frame-fields` |

### SME-005: SME-DEC — Decision Engine
| | |
|---|---|
| **Agent** | implementor |
| **Contract** | implement |
| **Files** | `sme-core/src/dec/engine.py`, `sme-core/src/dec/governance.py`, `sme-core/src/dec/__init__.py`, `sme-core/tests/test_dec.py` |
| **Acceptance** | Coordinates SME-TXT + SME-GEN via `GovernanceKernel`; produces `DecisionRecord`; enforces authority chain; no cross-layer mutation |
| **Conformance** | `authority.chain-valid`, `governance.no-implicit-escalation`, `execution.no-cross-layer-mutation` |

### SME-006: SME-EVR — Evidence & Replay Engine
| | |
|---|---|
| **Agent** | implementor |
| **Contract** | implement |
| **Files** | `sme-core/src/evr/recorder.py`, `sme-core/src/evr/replay.py`, `sme-core/src/evr/models.py`, `sme-core/src/evr/__init__.py`, `sme-core/tests/test_evr.py` |
| **Acceptance** | `ProvenanceRecorder` captures all frame fields; `ReplayService` accepts frames+target; deterministic parameter restoration verified |
| **Conformance** | `provenance.recorder-exists`, `provenance.frame-fields`, `provenance.frame-recorded-during-play`, `replay.service-exists`, `replay.deterministic-params` |

### SME-007: SME-AUDIT — Audit & Stewardship Engine
| | |
|---|---|
| **Agent** | implementor |
| **Contract** | implement |
| **Files** | `sme-core/src/audit/engine.py`, `sme-core/src/audit/merkle.py`, `sme-core/src/audit/__init__.py`, `sme-core/tests/test_audit.py` |
| **Acceptance** | Append-only audit log with Merkle tree; `EvidenceBundle` with id/worldId/timelineId; dual-evidence CKL integration |
| **Conformance** | `evidence.bundle-fields`, `evidence.dual-require`, `ckl.attach-provenance` |

---

## Phase 2: SME-TXT — Text Reasoning Core (Weeks 2–3)
**Mathematical Constraints (Appendix H §1.1):**
- **Parameters:** 300M–600M (not 100M–1B)
- **Quantization:** Q4_0, Q4_1, Q5_0, Q5_1, INT8 only
- **FLOP/token budget:** ≤ 2 · N_params (must publish)
- **Context window:** ≤ 4096 tokens

### SME-008: Scaffold sme-txt
| | |
|---|---|
| **Agent** | builder |
| **Files** | `sme-txt/src/runtime/__init__.py`, `sme-txt/src/tokenizer/__init__.py`, `sme-txt/src/models/__init__.py`, `sme-txt/src/ifc/__init__.py`, `sme-txt/pyproject.toml`, `sme-txt/tests/__init__.py` |

### SME-009: Model Loader + Quantization
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-txt/src/models/loader.py`, `sme-txt/src/models/quantization.py`, `sme-txt/src/models/gguf.py`, `sme-txt/src/models/safetensors.py`, `sme-txt/tests/test_loader.py` |
| **Acceptance** | Loads GGUF (llama.cpp) and Safetensors (ORT); supports **Q4_K_M/Q5_K_M/INT8 only**; rejects FP16/Q8; reports model metadata + FLOP/token budget |
| **Conformance** | `provenance.frame-fields` (model version, quantization, FLOP budget in evidence) |

### SME-010: Tokenizer + Chat Template
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-txt/src/tokenizer/hf_tokenizer.py`, `sme-txt/src/tokenizer/chat_template.py`, `sme-txt/tests/test_tokenizer.py` |
| **Acceptance** | Compatible with SmolLM-360M, Qwen2.5-0.5B, Phi-3-mini (pruned) tokenizers; applies chat templates; returns token counts; enforces 4096 token ceiling |

### SME-011: SME-TXT-IFC Implementation
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-txt/src/ifc/txt_ifc.py`, `sme-txt/src/ifc/generate.py`, `sme-txt/src/ifc/embed.py`, `sme-txt/src/ifc/decision.py`, `sme-txt/tests/test_ifc.py` |
| **Acceptance** | `generate(prompt, embeddings) → TXT_RESPONSE + DECISION_RECORD`; `embed(text) → embeddings`; deterministic with seed; publishes FLOP/token budget; produces provenance fields |
| **Conformance** | `provenance.frame-fields`, `evidence.bundle-fields`, `normalization.brdf-energy` (if rt4d used) |

### SME-012: SME-TXT Tests
| | |
|---|---|
| **Agent** | inspector |
| **Files** | `sme-txt/tests/test_generate.py`, `sme-txt/tests/test_determinism.py`, `sme-txt/tests/test_embeddings.py`, `sme-txt/tests/test_flop_budget.py`, `sme-txt/tests/fixtures/` |
| **Acceptance** | Unit >90% coverage; integration test with golden fixtures; determinism verified across 10 seeds; replay verification passes; **FLOP/token budget test passes** |

---

## Phase 3: SME-VIS — Vision Module (Week 3)
**Mathematical Constraints (Appendix H §1.2):**
- **Parameters:** ≤ 50M
- **Embedding dimension:** 512 (fixed)
- **Projection:** W_proj ∈ ℝ^{d_LLM × 512}, Q4 quantized
- **Models:** MobileViT-XXS (1.3M), ViT-Tiny (5M), EfficientNet-B0 (5.3M)

### SME-013: Scaffold sme-vis
| | |
|---|---|
| **Agent** | builder |
| **Files** | `sme-vis/src/encoder/__init__.py`, `sme-vis/src/preprocess/__init__.py`, `sme-vis/src/ifc/__init__.py`, `sme-vis/pyproject.toml`, `sme-vis/tests/__init__.py` |

### SME-014: Vision Encoder + INT8 Quantization
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-vis/src/encoder/onnx_encoder.py`, `sme-vis/src/encoder/mobilevit.py`, `sme-vis/src/encoder/vit_tiny.py`, `sme-vis/src/encoder/quantize.py`, `sme-vis/tests/test_encoder.py` |
| **Acceptance** | Loads **MobileViT-XXS (1.3M) and ViT-Tiny (5M)** ONNX models; static INT8 quantization via ORT calibration; outputs **512-dim embeddings**; reports model metadata + parameter count (must be ≤50M) |

### SME-015: Preprocessing Pipeline
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-vis/src/preprocess/pipeline.py`, `sme-vis/src/preprocess/resize.py`, `sme-vis/src/preprocess/normalize.py`, `sme-vis/tests/test_preprocess.py` |
| **Acceptance** | Resize to 224×224, normalize (ImageNet mean/std), convert to CHW tensor; handles PNG/JPEG/WebP; batch support |

### SME-016: SME-VIS-IFC Implementation
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-vis/src/ifc/vis_ifc.py`, `sme-vis/src/ifc/encode.py`, `sme-vis/src/ifc/features.py`, `sme-vis/src/ifc/evidence.py`, `sme-vis/tests/test_ifc.py` |
| **Acceptance** | `encode(image) → VIS_EMBED (512) + VIS_FEATURES + VIS_EVIDENCE`; safety classifier hook; evidenceId links to raw image; **computes VIS_TOKEN = W_proj · VIS_EMBED** |
| **Conformance** | `provenance.frame-fields`, `evidence.bundle-fields` |

---

## Phase 4: SME-AUD — Audio Module (Week 4)
**Mathematical Constraints (Appendix H §1.3):**
- **Parameters:** ≤ 30M (Whisper-tiny class)
- **Transcript latency:** 0.5–1.5s per 10s audio
- **Embedding dimension:** 256 (fixed)

### SME-017: Scaffold sme-aud
| | |
|---|---|
| **Agent** | builder |
| **Files** | `sme-aud/src/whisper/__init__.py`, `sme-aud/src/embed/__init__.py`, `sme-aud/src/ifc/__init__.py`, `sme-aud/pyproject.toml`, `sme-aud/tests/__init__.py` |

### SME-018: Whisper.cpp Wrapper
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-aud/src/whisper/wrapper.py`, `sme-aud/src/whisper/transcribe.py`, `sme-aud/src/whisper/timestamps.py`, `sme-aud/tests/test_whisper.py` |
| **Acceptance** | Loads **whisper.cpp Q5_1 tiny (39M) only**; base (74M) rejected as over budget; transcribes with word-level timestamps; reproducible given seed; supports WAV/OGG/MP3 via ffmpeg decode |

### SME-019: Audio Embedding Extraction
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-aud/src/embed/extractor.py`, `sme-aud/src/embed/pooling.py`, `sme-aud/tests/test_embed.py` |
| **Acceptance** | Extracts encoder embeddings from Whisper-tiny; mean/attention pooling to **fixed 256 dim**; deterministic |

### SME-020: SME-AUD-IFC Implementation
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-aud/src/ifc/aud_ifc.py`, `sme-aud/src/ifc/transcribe.py`, `sme-aud/src/ifc/embed.py`, `sme-aud/src/ifc/evidence.py`, `sme-aud/tests/test_ifc.py` |
| **Acceptance** | `transcribe(audio) → AUD_TRANSCRIPT + AUD_TIMECODES`; `embed(audio) → AUD_EMBED (256)`; evidenceId links to raw audio; **latency test: <1.5s per 10s audio** |
| **Conformance** | `provenance.frame-fields`, `evidence.bundle-fields` |

---

## Phase 5: SME-VID — Video Module (Week 4–5)
**Mathematical Constraints (Appendix H §1.4):**
- **Sampling ratio:** r = 0.03–0.05 (CPU-safe)
- **Max frames:** 45 (for 30s @ 30 FPS)
- **Temporal aggregation:** Simple mean pooling only (no learned temporal model)
- **Reuses SME-VIS encoder** — no separate video model

### SME-021: Scaffold sme-vid
| | |
|---|---|
| **Agent** | builder |
| **Files** | `sme-vid/src/sampler/__init__.py`, `sme-vid/src/temporal/__init__.py`, `sme-vid/src/ifc/__init__.py`, `sme-vid/pyproject.toml`, `sme-vid/tests/__init__.py` |

### SME-022: Frame Sampling Strategies
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-vid/src/sampler/uniform.py`, `sme-vid/src/sampler/keyframe.py`, `sme-vid/src/sampler/scene_detect.py`, `sme-vid/src/sampler/__init__.py`, `sme-vid/tests/test_sampler.py` |
| **Acceptance** | Uniform (FPS = 0.9–1.5 → k=27–45 for 30s), keyframe (ffprobe), scene-detect (PySceneDetect); **enforces r ≤ 0.05, k ≤ 45**; records sampling strategy + r in evidence |

### SME-023: Temporal Aggregation
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-vid/src/temporal/mean.py`, `sme-vid/src/temporal/__init__.py`, `sme-vid/tests/test_temporal.py` |
| **Acceptance** | **Mean pooling only**: `VID_EMBED = (1/k) · Σ VIS_EMBED_i`; no attention/TSM (over budget); outputs global VID_EMBED (512) + per-frame VID_FRAME_EMBEDS; traces to timestamps |

### SME-024: SME-VID-IFC Implementation
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-vid/src/ifc/vid_ifc.py`, `sme-vid/src/ifc/encode.py`, `sme-vid/src/ifc/events.py`, `sme-vid/src/ifc/evidence.py`, `sme-vid/tests/test_ifc.py` |
| **Acceptance** | `encode(video) → VID_EMBED (512) + VID_FRAME_EMBEDS + VID_EVENTS`; sampling transparency (r, k recorded); **resource bounds: r≤0.05, k≤45 enforced** |
| **Conformance** | `provenance.frame-fields`, `evidence.bundle-fields` |

---

## Phase 6: SME-GEN — Generative Media Module (Weeks 5–6)
**Mathematical Constraints (Appendix H §1.5):**
- **Image generation:** Possible but slow (30–60s at 512²); SD 1.5 pruned or SDXL Turbo (1-step)
- **Audio generation:** Feasible (Piper TTS <1s realtime factor)
- **Video generation:** **IMPOSSIBLE** on CPU — use FFmpeg stitching only
- **Diffusion params:** ≤ 200M for any CPU attempt

### SME-025: Scaffold sme-gen
| | |
|---|---|
| **Agent** | builder |
| **Files** | `sme-gen/src/diffusion/__init__.py`, `sme-gen/src/tts/__init__.py`, `sme-gen/src/ffmpeg/__init__.py`, `sme-gen/src/gpu_connector/__init__.py`, `sme-gen/src/ifc/__init__.py`, `sme-gen/pyproject.toml`, `sme-gen/tests/__init__.py` |

### SME-026: CPU Diffusion (Constrained)
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-gen/src/diffusion/onnx_pipeline.py`, `sme-gen/src/diffusion/sd15_pruned.py`, `sme-gen/src/diffusion/sdxl_turbo.py`, `sme-gen/src/diffusion/quantize.py`, `sme-gen/tests/test_diffusion.py` |
| **Acceptance** | Loads **SD 1.5 pruned (≤200M, ONNX, Q4)** and **SDXL Turbo (1-step, ONNX, Q4)**; generates 512×512 in **<60s CPU**; deterministic with seed; safety filter hook; **rejects >200M param models** |

### SME-027: Piper TTS Wrapper
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-gen/src/tts/piper.py`, `sme-gen/src/tts/voices.py`, `sme-gen/tests/test_tts.py` |
| **Acceptance** | Loads Piper voices (ONNX); synthesizes speech < realtime on CPU; supports SSML-lite; deterministic with seed |

### SME-028: FFmpeg Video Stitching
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-gen/src/ffmpeg/stitch.py`, `sme-gen/src/ffmpeg/encode.py`, `sme-gen/tests/test_ffmpeg.py` |
| **Acceptance** | Stitches image sequence + audio → MP4/WebM; configurable framerate, codec, bitrate; deterministic given inputs |

### SME-029: Governed GPU Connector
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-gen/src/gpu_connector/nim.py`, `sme-gen/src/gpu_connector/local.py`, `sme-gen/src/gpu_connector/authority.py`, `sme-gen/tests/test_gpu_connector.py` |
| **Acceptance** | Offloads to NVIDIA NIM or local GPU container; requires `AuthorityGrant` from SME-Core; returns `GEN_TRACE` with provenance; falls back to CPU with alert |

### SME-030: SME-GEN-IFC Implementation
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-gen/src/ifc/gen_ifc.py`, `sme-gen/src/ifc/generate.py`, `sme-gen/src/ifc/evidence.py`, `sme-gen/tests/test_ifc.py` |
| **Acceptance** | `generate(request) → GEN_ARTIFACT + GEN_TRACE`; enforces AuthorityGrant; safety policy; replayability via seeds |
| **Conformance** | `authority.chain-valid`, `policy-no-render-without-provenance`, `evidence.bundle-fields` |

---

## Phase 7: SME-LOG — Evidence, Replay, Audit (Week 6)

### SME-031: Scaffold sme-log
| | |
|---|---|
| **Agent** | builder |
| **Files** | `sme-log/src/store/__init__.py`, `sme-log/src/index/__init__.py`, `sme-log/src/audit/__init__.py`, `sme-log/src/api/__init__.py`, `sme-log/pyproject.toml`, `sme-log/tests/__init__.py` |

### SME-032: Evidence Store + Merkle Indexing
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-log/src/store/sqlite_store.py`, `sme-log/src/store/postgres_store.py`, `sme-log/src/store/models.py`, `sme-log/src/index/merkle.py`, `sme-log/tests/test_store.py` |
| **Acceptance** | SQLite (dev) + PostgreSQL (prod) backends; `EvidenceBundle` CRUD; Merkle tree over evidence IDs; O(1) lookup by evidenceId |

### SME-033: Replay Index + ReplayService
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-log/src/index/replay_index.py`, `sme-log/src/api/replay_service.py`, `sme-log/tests/test_replay.py` |
| **Acceptance** | Indexes frames by (intentId, timelineId, worldId); `ReplayService.replay(frames, target)` restores deterministic params; integrates with SME-EVR |

### SME-034: Audit Log (Append-only, Signed)
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `sme-log/src/audit/logger.py`, `sme-log/src/audit/signer.py`, `sme-log/src/audit/verify.py`, `sme-log/tests/test_audit.py` |
| **Acceptance** | Append-only JSONL with Ed25519 signatures; `AuditRecord` with timestamp, steward, immutable flag; tamper-evident verification |
| **Conformance** | `evidence.*`, `provenance.*`, `audit.*` |

---

## Phase 8: SDKs, Deployment, Tests, Docs (Weeks 6–8)

### SME-035/036: Python SDK
| | |
|---|---|
| **Agent** | builder → implementor |
| **Files** | `sdk/python/sme_sdk/__init__.py`, `sdk/python/sme_sdk/client.py`, `sdk/python/sme_sdk/models.py`, `sdk/python/pyproject.toml`, `sdk/python/tests/` |
| **Acceptance** | Async client with Pydantic models; retry/backoff; `pip install -e sdk/python` works |

### SME-037/038: Deployment Artifacts
| | |
|---|---|
| **Agent** | builder |
| **Files** | `deploy/docker/Dockerfile.sme-core`, `deploy/docker/Dockerfile.sme-txt`, `deploy/docker/Dockerfile.sme-vis`, `deploy/docker/Dockerfile.sme-aud`, `deploy/docker/Dockerfile.sme-vid`, `deploy/docker/Dockerfile.sme-gen`, `deploy/docker/Dockerfile.sme-log`, `deploy/docker/docker-compose.yml`, `deploy/k8s/base/`, `deploy/k8s/overlays/dev/`, `deploy/k8s/overlays/staging/`, `deploy/k8s/overlays/prod/`, `deploy/k8s/helm/sme/` |
| **Acceptance** | `docker-compose up` spins full stack locally; Helm chart deploys to K8s; multi-arch images build |

### SME-039/040: Conformance Test Harness
| | |
|---|---|
| **Agent** | architect → implementor |
| **Files** | `test/conformance/harness.py`, `test/conformance/checks/`, `test/conformance/run_all.py`, `test/conformance/fixtures/` |
| **Acceptance** | Runs all 21 checks; outputs JUnit XML; CI gate passes 21/21 |

### SME-041: Integration Tests
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `test/integration/test_full_pipeline.py`, `test/integration/test_modality_combinations.py`, `test/integration/fixtures/` |
| **Acceptance** | Text-only, text+image, text+audio, text+video, all-modalities; constitutional trace verified |

### SME-042: Replay Verification Tests
| | |
|---|---|
| **Agent** | implementor |
| **Files** | `test/replay/test_determinism.py`, `test/replay/test_replay_service.py`, `test/replay/fixtures/` |
| **Acceptance** | 100 seeded runs → bit-exact replay; parameter restoration verified; evidence bundle match |

### SME-043: Documentation
| | |
|---|---|
| **Agent** | architect |
| **Files** | `docs/architecture/`, `docs/api/openapi.yaml`, `docs/operations/runbooks/`, `docs/development/contributing.md`, `docs/development/architecture.md` |
| **Acceptance** | OpenAPI spec renders; runbooks for SEV-1..4; architecture docs match implementation |

---

## CPU Inference Runtime Setup (Parallel Track)

| Task | Files | Acceptance |
|------|-------|------------|
| **RT-001** llama.cpp build | `scripts/build_llama_cpp.sh`, `sme-txt/src/runtime/llama_cpp.py` | `llama-cli -m model.gguf -p "test"` works; AVX2/AVX-512/NEON detected |
| **RT-002** ONNXRuntime build | `scripts/build_ort.sh`, `sme-txt/src/runtime/ort.py`, `sme-vis/src/encoder/onnx_encoder.py` | ORT 1.17+ with oneDNN; INT8 quantization API works |
| **RT-003** whisper.cpp build | `scripts/build_whisper_cpp.sh`, `sme-aud/src/whisper/wrapper.py` | `whisper-cli -m model.bin -f audio.wav` works; timestamps accurate |
| **RT-004** Quantization pipeline | `scripts/quantize_all.py`, `sme-txt/src/models/quantization.py`, `sme-vis/src/encoder/quantize.py`, `sme-aud/src/whisper/quantize.py` | Converts FP16→Q4_K_M/Q5_K_M/INT8; validates perplexity/WER delta < threshold |
| **RT-005** Model registry | `models/manifest.yaml`, `scripts/pull_models.sh` | Pinned model versions with SHA256; git-lfs or artifact registry download |

---

## Conformance Check Coverage Matrix

| Check ID | Covered By Tasks |
|----------|------------------|
| `provenance.recorder-exists` | SME-006 |
| `provenance.frame-fields` | SME-006, SME-011, SME-016, SME-020, SME-024, SME-030 |
| `provenance.frame-recorded-during-play` | SME-006 |
| `replay.service-exists` | SME-006, SME-033 |
| `replay.deterministic-params` | SME-006, SME-033, SME-042 |
| `binding.resolver-exists` | SME-004 |
| `binding.all-tracks-resolved` | SME-004 |
| `binding.director-contract-exists` | CF-001, SME-001 |
| `timeline.loader-exists` | SME-006 |
| `timeline.clip-application` | SME-006 |
| `timeline.world-required` | SME-002, SME-006 |
| `evidence.bundle-fields` | SME-007, SME-032 |
| `evidence.dual-require` | SME-007, SME-002 |
| `ckl.policy-load` | SME-002 |
| `ckl.deny-without-intent` | SME-002 |
| `ckl.modify-param` | SME-003 |
| `ckl.attach-provenance` | SME-003, SME-006, SME-007 |
| `authority.chain-valid` | SME-005, SME-030 |
| `governance.no-implicit-escalation` | SME-005 |
| `execution.no-cross-layer-mutation` | SME-005 |
| `normalization.brdf-energy` | SME-011 (if rt4d path used) |

---

## Milestones & Gates

| Milestone | Target | Gate Criteria |
|-----------|--------|---------------|
| **M0: Constitutional Foundation** | Day 3 | All 21 conformance checks defined; CI loads policies; Director contract valid |
| **M1: Core Runtime** | Day 14 | SME-Core passes unit tests; Authority→Validation→Fusion→Decision→EVR→Audit chain executes |
| **M2: Text Core** | Day 21 | SME-TXT generates deterministic text; integrates with SME-Core fusion; replay verified |
| **M3: Vision + Audio** | Day 28 | SME-VIS/SME-AUD encode + evidence; multimodal fusion works |
| **M4: Video + Gen** | Day 42 | SME-VID encodes video; SME-GEN generates (CPU + GPU offload); full pipeline E2E |
| **M5: Evidence/Log** | Day 49 | SME-LOG stores/replays/audits; Merkle verification passes |
| **M6: Conformance Gate** | Day 56 | **21/21 conformance checks pass**; integration tests green; replay verified |
| **M7: Production Ready** | Day 70 | Docker/K8s deploy; SDK published; docs complete; runbooks tested |

---

## Agent Coordination Protocol

Per AGENTS.md §IX, the **Director Agent** coordinates:
1. **Dispatch**: Assign tasks to agents via this plan
2. **Collect**: Each agent produces evidence (test logs, conformance output, file manifests)
3. **Validate**: Inspector verifies claims vs implementation
4. **Check Policy**: CKL evaluates each change
5. **Resolve Conflicts**: Director resolves cross-module issues
6. **Request Approval**: Human sign-off for constitutional changes
7. **Publish**: Merge to main after all gates pass

Each task's PR must include:
- Intent declaration (what/why)
- File manifest (all modified files)
- Test plan + results
- Conformance checks affected
- Regression verification

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| llama.cpp/ORT API drift | Medium | High | Pin versions in `manifest.yaml`; vendor `llama.cpp` submodule |
| Quantization quality loss | High | Medium | Golden fixture tests with perplexity/WER thresholds; Q5_K_M default |
| CPU inference too slow | High | High | Profile early; thread pool tuning; batch inference; GPU offload fallback |
| Determinism failures | Medium | Critical | Seed all RNGs; fixed thread counts; replay test on every commit |
| Policy/constitution drift | Low | Critical | CKL loads policies at startup; conformance gate blocks drift |

---

## Success Criteria (Final Gate)
- [ ] **21/21 conformance checks pass** in CI
- [ ] **Full pipeline E2E**: text+image+audio+video → governed response + constitutional trace
- [ ] **Deterministic replay**: 100 seeded runs → bit-exact
- [ ] **CPU-only inference**: <30s for text+image understanding on 8-core AVX2
- [ ] **GPU offload**: SME-GEN routes to NIM/local GPU with AuthorityGrant
- [ ] **Audit trail**: Immutable, signed, Merkle-verified for every request
- [ ] **Documentation**: OpenAPI, runbooks, architecture docs complete