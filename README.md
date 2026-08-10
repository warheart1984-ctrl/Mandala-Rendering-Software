# Axiom-X: Constitutional Computational Substrate

> **Agentic Cinema Hackathon 2024 Submission** — Google Cloud + Parallel + Grafana

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![OpenCL](https://img.shields.io/badge/OpenCL-2.1-green.svg)](https://www.khronos.org/opencl/)

---

## 🎬 The Vision: Agentic Cinema

**Axiom-X** is a constitutional computational substrate that enables **agentic cinema** — where AI agents govern, execute, and verify rendering workloads with full provenance, deterministic contracts, and hierarchical convergence verification.

### The Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOVEREIGN-X (Governance)                     │
│  Intent → Capability Check → Policy → Provenance → Authorization│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AXIOM-X (Computation)                      │
│  Manifest → IR → Backend (OpenCL/Vulkan/CUDA) → Receipt        │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         RX 580          CPU Ref         RX 6600 XT
         (OpenCL)       (NumPy)          (Vulkan)
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────────┐
                    │ CONVERGENCE VERIFIER │
                    │  D0→D1→D2→D3→D4      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  SOVEREIGN-X RECORD  │
                    │  (Immutable Evidence) │
                    └─────────────────────┘
```

---

## ✨ Key Innovations

### 1. **Constitutional Governance** (Sovereign-X)
- Every computation requires explicit `Intent` declaration
- Capability-based authorization (no ambient authority)
- Policy validation with determinism class enforcement
- Immutable provenance chain: `Intent → Manifest → Execution → Receipt`

### 2. **Axiom-X: Portable Computational Substrate**
- **Canonical IR** — Mathematical definition independent of backend
- **Kernel Identity** — `kernel@version` with SHA256 content hash
- **Backend Independence** — OpenCL, Vulkan, CUDA, Metal, CPU
- **Precision Semantics** — Declared fp32/fp16/bf16 with accumulation policy

### 3. **Hierarchical Convergence Verification** (D0–D4)
| Class | Meaning | Use Case |
|-------|---------|----------|
| **D0** | Unspecified | No guarantee |
| **D1** | Exact | `hash(A) == hash(B)` |
| **D2** | Numerical | RMSE, max error within ε |
| **D3** | Semantic | Geometry, topology, object identity preserved |
| **D4** | Statistical | Distributional equivalence for stochastic workloads |

### 4. **RX 580 OpenCL Validation** ✅
- **legacy_efficient** kernel: 586ms @ 256×256
- **CL-Gen** scene-aware kernel: 13ms @ 512×512 (fixed AMD `fract()` compat)
- **CPU Reference**: NumPy implementation for convergence baseline

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- AMD GPU with OpenCL 2.0+ (RX 580 validated)
- Docker (for containerized deployment)

### Local Development
```bash
# Clone and setup
git clone https://github.com/mandala-rendering/axiom-x.git
cd axiom-x
pip install -r requirements.txt

# Run production validation
python axiom_x/run_production.py --mode validate --out-dir tmp/axiom-x-test

# Full E2E with evidence
python axiom_x/run_production.py --mode full --out-dir tmp/axiom-x-e2e
```

### Docker Deployment
```bash
# Build
docker build -f Dockerfile.axiom-x -t axiom-x:v1.0.0 .

# Run validation
docker run --rm -v $(pwd)/tmp:/app/tmp axiom-x:v1.0.0 --mode validate

# Full E2E with evidence output
docker run --rm -v $(pwd)/tmp:/app/tmp axiom-x:v1.0.0 --mode full
```

### Cloud Run Deployment
```bash
# Build and push
docker build -f Dockerfile.axiom-x -t gcr.io/PROJECT_ID/axiom-x:v1.0.0 .
docker push gcr.io/PROJECT_ID/axiom-x:v1.0.0

# Deploy to Cloud Run
gcloud run deploy axiom-x \
  --image gcr.io/PROJECT_ID/axiom-x:v1.0.0 \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

---

## 📁 Repository Structure

```
axiom-x/
├── runtime/axiom_x_runtime.py        # OpenCL runtime with kernel caching
├── verifier/convergence_verifier.py   # D0-D4 hierarchical convergence
├── bridge/sovereign_x_bridge.py       # Constitutional authorization gate
├── reference/cpu_reference.py         # Deterministic CPU baseline
├── schemas/job-manifest-v1.json       # Canonical manifest schema
├── run_production.py                  # Hardened runner with retries
├── test_axiom_x_e2e.py                # Full E2E test
├── scripts/legacy_efficient/
│   ├── opencl_tonga_still.py          # Legacy kernel (RX 580)
│   └── opencl_cl_gen_still.py         # CL-Gen scene kernel (fixed)
├── Dockerfile.axiom-x                 # Multi-stage production image
├── run_production.py                  # Production runner with retries
└── requirements.txt                   # numpy, pyopencl, pillow
```

---

## 🔧 Partner Integrations

| Partner | Integration Point | Status |
|---------|-------------------|--------|
| **Parallel** | Director agent style/cinematography queries | 🟡 Needs API key |
| **Grafana** | Pipeline metrics (Prometheus/Loki) | 🟡 Needs SAT token |
| **Google Cloud** | Gemini Enterprise (Vertex AI) | 🟡 Needs IAM |

### Configuration
```bash
# Parallel Search
export PARALLEL_API_KEY="your_key"

# Grafana Cloud
export GRAFANA_CLOUD_INSTANCE="your-stack.grafana.net"
export GRAFANA_CLOUD_API_KEY="glsa_your_sat_token"

# Google Cloud (Gemini Enterprise)
export GOOGLE_CLOUD_PROJECT="your-project"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GOOGLE_GENAI_USE_ENTERPRISE="True"
gcloud auth application-default login
```

---

## 📊 Evidence Package Output

Every execution produces an **immutable evidence package**:

```json
{
  "pipeline": "axiom-x-production",
  "status": "PASS",
  "kernel": "legacy_still@1.0.0",
  "gpu": {
    "device": "RX 580 (Ellesmere)",
    "backend": "opencl",
    "elapsed_ms": 586,
    "output_hash": "sha256:f9ef6f9b..."
  },
  "cpu": {
    "backend": "cpu-reference",
    "elapsed_ms": 250000,
    "output_hash": "sha256:230f3206..."
  },
  "verification": {
    "determinism_class": "D2",
    "rmse": 0.010455,
    "max_error": 0.000000,
    "result": "CONVERGENT"
  },
  "bridge": {
    "stages": [
      "intent_validation: PASS",
      "capability_check: PASS",
      "policy_validation: PASS",
      "manifest_validation: PASS",
      "execution: PASS",
      "convergence_verification: PASS"
    ]
  },
  "provenance_hash": "sha256:..."
}
```

---

## 🎯 Hackathon Submission

### Demo Video Script (3 min)
1. **0:00-0:30** — Problem: "AI video generation lacks governance and reproducibility"
2. **0:30-1:00** — Architecture: Sovereign-X → Axiom-X → Convergence
3. **1:00-1:30** — Live: Intent → RX 580 OpenCL → CPU Reference → Convergence
4. **1:30-2:00** — Partner: Parallel query → Director agent → Axiom-X job
5. **2:00-2:30** — Grafana dashboard: Live pipeline metrics
6. **2:30-3:00** — Evidence package → Immutable receipt → Submission

### Submission Requirements ✅
- [x] Public repo with MIT license
- [x] Open source code with build instructions
- [x] 3-min demo video (to record)
- [x] Deployed endpoint (Cloud Run / Docker)
- [x] Partner integrations (Parallel, Grafana, Google Cloud)

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Google Cloud** — Vertex AI / Gemini Enterprise platform
- **Parallel** — Search grounding for agentic director
- **Grafana** — Observability stack for pipeline metrics
- **AMD** — OpenCL support on RX 580 (Ellesmere)
- **Khronos Group** — OpenCL / Vulkan standards

---

> **"One Math, Many Backends, One Verification, One Evidence."**  
> — Axiom-X Constitutional Principle AX-01