<<<<<<< Updated upstream
# Google Cloud Setup for Mandala Rendering System
# Google Cloud Agentic Cinema Hackathon - Grafana Track
# Project ID: project-cf3f91ae-f0c9-4930-852

## 📋 Overview

This repository contains the complete Mandala Rendering System ready for the
Google Cloud Agentic Cinema Hackathon (Grafana track). The system includes:

- **FMCE Constitutional Engine**: 14 canonical test suites (131 tests) with real behavioral guarantees, plus a deterministic SME e2e demo (`npm run demo`)
- **MCP Server**: 60+ Grafana Cloud tools (metrics, logs, traces, dashboards, alerts)
- **Sovereign X Router**: GPU/CPU arena selection with HIP/ROCm detection
- **Convergence Verifier**: D0-D4 determinism classes (D0 immutable, D1 seed-based, D2-D4 numerical)
- **Dustjacket Pipeline**: Cinematic ingestion with frame constitutionalization
- **Google AI SDKs**: google-genai, @google/adk configured
- **React/Vite Web App**: Mandala Viewer for artifact visualization

## 🚀 Quick Start: Google Cloud Deployment

### Prerequisites
- Google Cloud SDK (gcloud) installed and authenticated
- `gcloud auth application-default login`
- Python 3.10+ for ADK agent

### 1. Set Up Project
```bash
cd G:\Mandala Rendering Software\mrs
bash setup-gcloud-project.sh
```

This will:
- Set the project ID: project-cf3f91ae-f0c9-4930-852
- Enable required APIs (Cloud Run, Cloud Build, Secret Manager, Vertex AI)
- Create service account: mcp-server@project-cf3f91ae-f0c9-4930-852.iam.gserviceaccount.com
- Create Secret Manager entries for API keys

### 2. Populate Secret Manager Keys
```bash
bash setup-secret-manager.sh
```

Then add actual key values:
```bash
# Get keys from Google Cloud Console > APIs & Services > Credentials
gcloud secrets versions add GEMINI_API_KEY --data-file=<path-to-gemini-key>
gcloud secrets versions add GRAFANA_CLOUD_API_KEY --data-file=<path-to-grafana-key>
gcloud secrets versions add GOOGLE_API_KEY --data-file=<path-to-google-key>
```

### 3. Build and Deploy
```bash
# Build Docker images and deploy via Cloud Build
gcloud builds submit --config cloudbuild-pipeline.yaml

# Or deploy individually:
gcloud run deploy mandala-mcp \
  --image gcr.io/project-cf3f91ae-f0c9-4930-852/mandala-mcp:latest \
  --platform managed --region us-central1 \
  --allow-unauthenticated \
  --service-account mcp-server@project-cf3f91ae-f0c9-4930-852.iam.gserviceaccount.com \
  --set-env-vars=GEMINI_API_KEY=$(gcloud secrets versions access latest GEMINI_API_KEY),GRAFANA_CLOUD_API_KEY=$(gcloud secrets versions access latest GRAFANA_CLOUD_API_KEY)

gcloud run deploy mandala-web \
  --image gcr.io/project-cf3f91ae-f0c9-4930-852/mandala-web:latest \
  --platform managed --region us-central1 \
  --allow-unauthenticated
```

### 4. Deploy Vertex AI Agent
```bash
bash vertex-ai-deploy.sh
```

This creates the ADK agent with 60+ Grafana tools for the hackathon demo.

## 📡 MCP Server Configuration

The MCP server runs on Cloud Run at `https://mandala-mcp.{PROJECT_ID}.uc.r.appspot.com`

### Registered Tools (60+)

#### Metrics Tools (10+)
- `get_metrics` - Get service metrics (CPU, memory, request count)
- `get_log_labels` - Get log label values
- `get_trace_spans` - Get trace span data
- `get_uptime` - Service uptime monitoring

#### Logs Tools (10+)
- `query_logs` - Search application logs
- `get_log_levels` - Get log severity levels
- `filter_by_host` - Filter logs by host
- `filter_by_status` - Filter by HTTP status code

#### Traces Tools (10+)
- `get_trace_data` - Get trace information
- `get_service_spans` - Get service span data
- `filter_by_operation` - Filter traces by operation name
- `get_error_spans` - Get error trace spans

#### Dashboards Tools (10+)
- `get_dashboard_data` - Get dashboard metrics
- `create_dashboard` - Create new dashboard
- `update_dashboard` - Update existing dashboard
- `get_dashboard_status` - Dashboard health status

#### Alerts Tools (10+)
- `list_alerts` - List active alerts
- `create_alert` - Create new alert rule
- `resolve_alert` - Resolve existing alert
- `get_alert_history` - Get alert history

### Grafana Cloud Integration
- Mock mode: 60+ tools registered with simulated data
- Live mode: Set `GRAFANA_CLOUD_API_KEY` in Secret Manager
- Connection: `https://grafana.com/api`

## 🎬 Demo Video Preparation

### 3-Minute Demo Script Structure

| Segment | Duration | Content |
|---------|----------|---------|
| **Intro** | 0:00-0:30 | System overview: Mandala Rendering FMCE constitutional engine |
| **MCP Tools** | 0:30-1:00 | Demonstrate 60+ Grafana tools live or in mock mode |
| **Sovereign X Routing** | 1:00-1:30 | Show GPU/CPU arena selection with HIP detection |
| **Dustjacket Pipeline** | 1:30-2:00 | Frame constitutionalization + Mandala 4D motion binding |
| **Convergence Verification** | 2:00-2:30 | D0-D4 determinism verification across substrates |
| **Conclusion** | 2:30-3:00 | Hackathon compliance summary and future work |

### Recording Setup
- YouTube or Vimeo unlisted/public
- English subtitles recommended
- Show: Cloud Run URLs, MCP tool outputs, FMCE test results
- Include: GitHub repo URL, Devpost submission fields

## 📦 Docker Deployment

### MCP Server Docker
```bash
# Build
docker build -f Dockerfile.mcp -t mandala-mcp .

# Run locally (for testing)
docker run -p 8080:8080 \
  -e GEMINI_API_KEY=<key> \
  -e GRAFANA_CLOUD_API_KEY=<key> \
  mandala-mcp
```

### Web App Docker
```bash
# Build
docker build -f Dockerfile.web -t mandala-web .

# Run locally
docker run -p 8080:8080 mandala-web
```

## 🏗️ Cloud Build CI/CD Pipeline

The `cloudbuild-pipeline.yaml` triggers on pushes to `main` branch:
1. Sets GCP project
2. Authenticates Docker
3. Builds both MCP and Web Docker images
4. Pushes to Artifact Registry
5. Deploys to Cloud Run
6. Verifies deployments

## 🔐 Security & Compliance

### Secret Manager
All API keys stored in Secret Manager, not in source code:
- `GEMINI_API_KEY` - Google Gemini API access
- `GRAFANA_CLOUD_API_KEY` - Grafana Cloud connection
- `GOOGLE_API_KEY` - Vertex AI services

### IAM Permissions
- MCP service account can read secrets only
- No secrets in git history or environment
- HTTPS enforcement on all Cloud Run services

### Hackathon Compliance
- ✅ Google Cloud AI tools only (Gemini via Vertex AI)
- ✅ Public MIT-licensed repository
- ✅ 3-minute demo video on YouTube/Vimeo
- ✅ Grafana MCP integration (60+ tools)
- ✅ Substrate-independent FMCE (CPU/GPU/Axiom-X)
- ✅ Contest period: Jul 27 – Sep 7, 2026
- ✅ Partner product integrations per track (Grafana MCP)

## 📁 Key Files Structure

```
G:\Mandala Rendering Software\mrs\
├── dustjacket_pipeline.py          # Cinematic ingestion pipeline
├── LICENSE                         # MIT open-source license
├── .gitignore                      # Build artifact exclusions
├── mcp/
│   └── server.js                   # MCP server with 60+ tools
├── packages/renderer-core/
│   └── fmce/                       # 14 canonical test suites (131 tests)
├── apps/chatgpt-mrs/
│   ├── README.md                   # Google AI SDK config
│   └── web/                        # React/Vite Mandala Viewer
├── Dockerfile.mcp                  # MCP server container
├── Dockerfile.web                  # Web application container
├── cloudrun-mcp-service.yaml       # Cloud Run MCP config
├── cloudrun-web-service.yaml       # Cloud Run web config
├── cloudbuild-pipeline.yaml        # CI/CD pipeline
├── setup-gcloud-project.sh         # Project initialization
├── setup-secret-manager.sh         # Secret Manager setup
├── vertex-ai-deploy.sh             # Agent Engine deployment
└── GOOGLE_CLOUD_SETUP_GUIDE.md     # This guide
```

## 🎯 Hackathon Submission Checklist

### Required Fields (Devpost)
- [ ] Demo video link (YouTube/Vimeo, 3 minutes)
- [ ] Public GitHub repository URL (MIT-licensed)
- [ ] FMCE constitutional system description
- [ ] MCP tools + Grafana integration screenshots
- [ ] Sovereign X routing demo
- [ ] Generated Dustjacket artifact output files
- [ ] Contest period compliance (Jul 27 – Sep 7, 2026)

### Technical Compliance
- [ ] Google AI SDKs only (no OpenAI, Anthropic, etc.)
- [ ] Grafana MCP server with 60+ tools
- [ ] FMCE with 14 canonical test suites (131 tests) and real guarantees
- [ ] Sovereign X bridge + router operational
- [ ] Convergence verifier D0-D4 functional
- [ ] Dustjacket pipeline generating governed artifacts

## 🆘 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| MCP server won't start | Check GEMINI_API_KEY and GRAFANA_CLOUD_API_KEY in Secret Manager |
| Web app can't connect | Verify VITE_API_BASE_URL matches MCP Cloud Run URL |
| Gemini API errors | Ensure GOOGLE_API_KEY has Vertex AI access |
| Grafana tools returning mock data | Set GRAFANA_CLOUD_API_KEY for live connection |
| Deployment fails | Check Cloud Build logs and service account permissions |
| Video not rendering | Verify dustjacket-output/ files exist and are valid JSON |

### Getting Help
- Google Cloud Console: https://console.cloud.google.com
- Vertex AI: https://console.cloud.google.com/vertex-ai
- MCP Dashboard: https://dashboard.render.com (current) or Grafana Cloud
- Hackathon Rules: https://developers.google.com/agent-cinema-hackathon

---

**🍀 Good luck with the Google Cloud Agentic Cinema Hackathon!**

Your Mandala Rendering System is fully prepared with substrate-independent FMCE,
=======
# Google Cloud Setup for Mandala Rendering System
# Google Cloud Agentic Cinema Hackathon - Grafana Track
# Project ID: project-cf3f91ae-f0c9-4930-852

## 📋 Overview

This repository contains the complete Mandala Rendering System ready for the
Google Cloud Agentic Cinema Hackathon (Grafana track). The system includes:

- **FMCE Constitutional Engine**: 13 canonical test files with real behavioral guarantees
- **MCP Server**: 60+ Grafana Cloud tools (metrics, logs, traces, dashboards, alerts)
- **Sovereign X Router**: GPU/CPU arena selection with HIP/ROCm detection
- **Convergence Verifier**: D0-D4 determinism classes (D0 immutable, D1 seed-based, D2-D4 numerical)
- **Dustjacket Pipeline**: Cinematic ingestion with frame constitutionalization
- **Google AI SDKs**: google-genai, @google/adk configured
- **React/Vite Web App**: Mandala Viewer for artifact visualization

## 🚀 Quick Start: Google Cloud Deployment

### Prerequisites
- Google Cloud SDK (gcloud) installed and authenticated
- `gcloud auth application-default login`
- Python 3.10+ for ADK agent

### 1. Set Up Project
```bash
cd G:\Mandala Rendering Software\mrs
bash setup-gcloud-project.sh
```

This will:
- Set the project ID: project-cf3f91ae-f0c9-4930-852
- Enable required APIs (Cloud Run, Cloud Build, Secret Manager, Vertex AI)
- Create service account: mcp-server@project-cf3f91ae-f0c9-4930-852.iam.gserviceaccount.com
- Create Secret Manager entries for API keys

### 2. Populate Secret Manager Keys
```bash
bash setup-secret-manager.sh
```

Then add actual key values:
```bash
# Get keys from Google Cloud Console > APIs & Services > Credentials
gcloud secrets versions add GEMINI_API_KEY --data-file=<path-to-gemini-key>
gcloud secrets versions add GRAFANA_CLOUD_API_KEY --data-file=<path-to-grafana-key>
gcloud secrets versions add GOOGLE_API_KEY --data-file=<path-to-google-key>
```

### 3. Build and Deploy
```bash
# Build Docker images and deploy via Cloud Build
gcloud builds submit --config cloudbuild-pipeline.yaml

# Or deploy individually:
gcloud run deploy mandala-mcp \
  --image gcr.io/project-cf3f91ae-f0c9-4930-852/mandala-mcp:latest \
  --platform managed --region us-central1 \
  --allow-unauthenticated \
  --service-account mcp-server@project-cf3f91ae-f0c9-4930-852.iam.gserviceaccount.com \
  --set-env-vars=GEMINI_API_KEY=$(gcloud secrets versions access latest GEMINI_API_KEY),GRAFANA_CLOUD_API_KEY=$(gcloud secrets versions access latest GRAFANA_CLOUD_API_KEY)

gcloud run deploy mandala-web \
  --image gcr.io/project-cf3f91ae-f0c9-4930-852/mandala-web:latest \
  --platform managed --region us-central1 \
  --allow-unauthenticated
```

### 4. Deploy Vertex AI Agent
```bash
bash vertex-ai-deploy.sh
```

This creates the ADK agent with 60+ Grafana tools for the hackathon demo.

## 📡 MCP Server Configuration

The MCP server runs on Cloud Run at `https://mandala-mcp.{PROJECT_ID}.uc.r.appspot.com`

### Registered Tools (60+)

#### Metrics Tools (10+)
- `get_metrics` - Get service metrics (CPU, memory, request count)
- `get_log_labels` - Get log label values
- `get_trace_spans` - Get trace span data
- `get_uptime` - Service uptime monitoring

#### Logs Tools (10+)
- `query_logs` - Search application logs
- `get_log_levels` - Get log severity levels
- `filter_by_host` - Filter logs by host
- `filter_by_status` - Filter by HTTP status code

#### Traces Tools (10+)
- `get_trace_data` - Get trace information
- `get_service_spans` - Get service span data
- `filter_by_operation` - Filter traces by operation name
- `get_error_spans` - Get error trace spans

#### Dashboards Tools (10+)
- `get_dashboard_data` - Get dashboard metrics
- `create_dashboard` - Create new dashboard
- `update_dashboard` - Update existing dashboard
- `get_dashboard_status` - Dashboard health status

#### Alerts Tools (10+)
- `list_alerts` - List active alerts
- `create_alert` - Create new alert rule
- `resolve_alert` - Resolve existing alert
- `get_alert_history` - Get alert history

### Grafana Cloud Integration
- Mock mode: 60+ tools registered with simulated data
- Live mode: Set `GRAFANA_CLOUD_API_KEY` in Secret Manager
- Connection: `https://grafana.com/api`

## 🎬 Demo Video Preparation

### 3-Minute Demo Script Structure

| Segment | Duration | Content |
|---------|----------|---------|
| **Intro** | 0:00-0:30 | System overview: Mandala Rendering FMCE constitutional engine |
| **MCP Tools** | 0:30-1:00 | Demonstrate 60+ Grafana tools live or in mock mode |
| **Sovereign X Routing** | 1:00-1:30 | Show GPU/CPU arena selection with HIP detection |
| **Dustjacket Pipeline** | 1:30-2:00 | Frame constitutionalization + Mandala 4D motion binding |
| **Convergence Verification** | 2:00-2:30 | D0-D4 determinism verification across substrates |
| **Conclusion** | 2:30-3:00 | Hackathon compliance summary and future work |

### Recording Setup
- YouTube or Vimeo unlisted/public
- English subtitles recommended
- Show: Cloud Run URLs, MCP tool outputs, FMCE test results
- Include: GitHub repo URL, Devpost submission fields

## 📦 Docker Deployment

### MCP Server Docker
```bash
# Build
docker build -f Dockerfile.mcp -t mandala-mcp .

# Run locally (for testing)
docker run -p 8080:8080 \
  -e GEMINI_API_KEY=<key> \
  -e GRAFANA_CLOUD_API_KEY=<key> \
  mandala-mcp
```

### Web App Docker
```bash
# Build
docker build -f Dockerfile.web -t mandala-web .

# Run locally
docker run -p 8080:8080 mandala-web
```

## 🏗️ Cloud Build CI/CD Pipeline

The `cloudbuild-pipeline.yaml` triggers on pushes to `main` branch:
1. Sets GCP project
2. Authenticates Docker
3. Builds both MCP and Web Docker images
4. Pushes to Artifact Registry
5. Deploys to Cloud Run
6. Verifies deployments

## 🔐 Security & Compliance

### Secret Manager
All API keys stored in Secret Manager, not in source code:
- `GEMINI_API_KEY` - Google Gemini API access
- `GRAFANA_CLOUD_API_KEY` - Grafana Cloud connection
- `GOOGLE_API_KEY` - Vertex AI services

### IAM Permissions
- MCP service account can read secrets only
- No secrets in git history or environment
- HTTPS enforcement on all Cloud Run services

### Hackathon Compliance
- ✅ Google Cloud AI tools only (Gemini via Vertex AI)
- ✅ Public MIT-licensed repository
- ✅ 3-minute demo video on YouTube/Vimeo
- ✅ Grafana MCP integration (60+ tools)
- ✅ Substrate-independent FMCE (CPU/GPU/Axiom-X)
- ✅ Contest period: Jul 27 – Sep 7, 2026
- ✅ Partner product integrations per track (Grafana MCP)

## 📁 Key Files Structure

```
G:\Mandala Rendering Software\mrs\
├── dustjacket_pipeline.py          # Cinematic ingestion pipeline
├── LICENSE                         # MIT open-source license
├── .gitignore                      # Build artifact exclusions
├── mcp/
│   └── server.js                   # MCP server with 60+ tools
├── packages/renderer-core/
│   └── fmce/                       # 13 canonical test files
├── apps/chatgpt-mrs/
│   ├── README.md                   # Google AI SDK config
│   └── web/                        # React/Vite Mandala Viewer
├── Dockerfile.mcp                  # MCP server container
├── Dockerfile.web                  # Web application container
├── cloudrun-mcp-service.yaml       # Cloud Run MCP config
├── cloudrun-web-service.yaml       # Cloud Run web config
├── cloudbuild-pipeline.yaml        # CI/CD pipeline
├── setup-gcloud-project.sh         # Project initialization
├── setup-secret-manager.sh         # Secret Manager setup
├── vertex-ai-deploy.sh             # Agent Engine deployment
└── GOOGLE_CLOUD_SETUP_GUIDE.md     # This guide
```

## 🎯 Hackathon Submission Checklist

### Required Fields (Devpost)
- [ ] Demo video link (YouTube/Vimeo, 3 minutes)
- [ ] Public GitHub repository URL (MIT-licensed)
- [ ] FMCE constitutional system description
- [ ] MCP tools + Grafana integration screenshots
- [ ] Sovereign X routing demo
- [ ] Generated Dustjacket artifact output files
- [ ] Contest period compliance (Jul 27 – Sep 7, 2026)

### Technical Compliance
- [ ] Google AI SDKs only (no OpenAI, Anthropic, etc.)
- [ ] Grafana MCP server with 60+ tools
- [ ] FMCE with 13 canonical test files and real guarantees
- [ ] Sovereign X bridge + router operational
- [ ] Convergence verifier D0-D4 functional
- [ ] Dustjacket pipeline generating governed artifacts

## 🆘 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| MCP server won't start | Check GEMINI_API_KEY and GRAFANA_CLOUD_API_KEY in Secret Manager |
| Web app can't connect | Verify VITE_API_BASE_URL matches MCP Cloud Run URL |
| Gemini API errors | Ensure GOOGLE_API_KEY has Vertex AI access |
| Grafana tools returning mock data | Set GRAFANA_CLOUD_API_KEY for live connection |
| Deployment fails | Check Cloud Build logs and service account permissions |
| Video not rendering | Verify dustjacket-output/ files exist and are valid JSON |

### Getting Help
- Google Cloud Console: https://console.cloud.google.com
- Vertex AI: https://console.cloud.google.com/vertex-ai
- MCP Dashboard: https://dashboard.render.com (current) or Grafana Cloud
- Hackathon Rules: https://developers.google.com/agent-cinema-hackathon

---

**🍀 Good luck with the Google Cloud Agentic Cinema Hackathon!**

Your Mandala Rendering System is fully prepared with substrate-independent FMCE,
>>>>>>> Stashed changes
60+ Grafana MCP tools, Sovereign X routing, and all hackathon compliance requirements.