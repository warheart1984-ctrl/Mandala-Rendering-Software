#!/bin/bash
# Secret Manager Setup for Mandala Rendering System
# Populates Google Cloud Secrets with API keys for hackathon

set -e

PROJECT_ID="project-cf3f91ae-f0c9-4930-852"
SERVICE_ACCOUNT="mcp-server@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Secret Manager Setup ==="
echo ""
echo "This script creates and updates Secret Manager entries for:"
echo "  1. GEMINI_API_KEY - Google Gemini API key"
echo "  2. GRAFANA_CLOUD_API_KEY - Grafana Cloud API key"
echo "  3. GOOGLE_API_KEY - Google API key for Vertex AI"
echo ""

# Check if secrets exist
echo "Checking existing secrets..."
gcloud secrets list --project $PROJECT_ID 2>/dev/null || echo "No secrets found"

echo ""
echo "=== Creating/Updating Secrets ==="

# Create GEMINI_API_KEY secret if it doesn't exist
echo "Creating GEMINI_API_KEY secret..."
if ! gcloud secrets describe GEMINI_API_KEY --project $PROJECT_ID > /dev/null 2>&1; then
  gcloud secrets create GEMINI_API_KEY \
    --description="Google Gemini API key for Agentic Cinema Hackathon" \
    --project $PROJECT_ID \
    --replication automatic
  echo "   GEMINI_API_KEY secret created."
else
  echo "   GEMINI_API_KEY secret already exists."
fi

# Create GRAFANA_CLOUD_API_KEY secret if it doesn't exist
echo "Creating GRAFANA_CLOUD_API_KEY secret..."
if ! gcloud secrets describe GRAFANA_CLOUD_API_KEY --project $PROJECT_ID > /dev/null 2>&1; then
  gcloud secrets create GRAFANA_CLOUD_API_KEY \
    --description="Grafana Cloud API key for MCP integration" \
    --project $PROJECT_ID \
    --replication automatic
  echo "   GRAFANA_CLOUD_API_KEY secret created."
else
  echo "   GRAFANA_CLOUD_API_KEY secret already exists."
fi

# Create GOOGLE_API_KEY secret if it doesn't exist
echo "Creating GOOGLE_API_KEY secret..."
if ! gcloud secrets describe GOOGLE_API_KEY --project $PROJECT_ID > /dev/null 2>&1; then
  gcloud secrets create GOOGLE_API_KEY \
    --description="Google API key for Vertex AI services" \
    --project $PROJECT_ID \
    --replication automatic
  echo "   GOOGLE_API_KEY secret created."
else
  echo "   GOOGLE_API_KEY secret already exists."
fi

echo ""
echo "=== Setting IAM Permissions for Service Account ==="

# Grant the MCP server service account access to read secrets
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:mcp-server@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project $PROJECT_ID

gcloud secrets add-iam-policy-binding GRAFANA_CLOUD_API_KEY \
  --member="serviceAccount:mcp-server@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project $PROJECT_ID

gcloud secrets add-iam-policy-binding GOOGLE_API_KEY \
  --member="serviceAccount:mcp-server@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project $PROJECT_ID

echo ""
echo "=== Secret Setup Complete ==="
echo ""
echo "To add actual API key values, run:"
echo "  gcloud secrets versions add GEMINI_API_KEY --data-file=<path-to-gemini-key>"
echo "  gcloud secrets versions add GRAFANA_CLOUD_API_KEY --data-file=<path-to-grafana-key>"
echo "  gcloud secrets versions add GOOGLE_API_KEY --data-file=<path-to-google-key>"
echo ""
echo "Hackathon Compliance:"
echo "  - Google AI SDKs (google-genai, @google/adk) will read from these secrets"
echo "  - MCP server reads GEMINI_API_KEY from Secret Manager"
echo "  - Grafana Cloud integration uses GRAFANA_CLOUD_API_KEY"
echo "  - All keys are securely stored, not in source code"