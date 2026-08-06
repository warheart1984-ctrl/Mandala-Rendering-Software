# Smoke test for ChatGPT Actions REST façade (AWS API Gateway dev stage).
# Requires MRS_API_KEY env var (Bearer value only — no "Bearer " prefix).
# Retrieve key: aws secretsmanager get-secret-value --secret-id mrs-rt4d-dev/api-keys --region us-east-2 --query SecretString --output text
# Parse JSON .keys[0] from the output. Never commit the key.
#
# Usage:
#   $env:MRS_API_KEY = "<key-from-secrets-manager>"
#   .\infra\scripts\chatgpt-actions-smoke.ps1

$ErrorActionPreference = "Stop"
$BaseUrl = "https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev"

function Invoke-MrsGet {
    param([string]$Path)
    $uri = "$BaseUrl$Path"
    Write-Host "GET $uri"
    $resp = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing
    Write-Host "  -> $($resp.StatusCode)"
    return $resp.Content
}

function Invoke-MrsPost {
    param([string]$Path, [hashtable]$Body, [switch]$NoAuth)
    $uri = "$BaseUrl$Path"
    $json = $Body | ConvertTo-Json -Compress -Depth 8
    Write-Host "POST $uri"
    $headers = @{ "Content-Type" = "application/json" }
    if (-not $NoAuth) {
        if (-not $env:MRS_API_KEY) {
            throw "MRS_API_KEY is not set. Export the key from Secrets Manager mrs-rt4d-dev/api-keys (us-east-2)."
        }
        $headers["Authorization"] = "Bearer $($env:MRS_API_KEY)"
    }
    $resp = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $json -UseBasicParsing
    Write-Host "  -> $($resp.StatusCode)"
    return $resp.Content | ConvertFrom-Json
}

Write-Host "=== MRS ChatGPT Actions smoke (dev) ===" -ForegroundColor Cyan

# 1. Public endpoints (no auth)
$openApi = Invoke-MrsGet "/openapi.json"
if ($openApi -notmatch '"openapi"\s*:\s*"3\.1\.0"') {
    throw "openapi.json missing OpenAPI 3.1.0 marker"
}
Write-Host "  openapi.json OK" -ForegroundColor Green

$health = Invoke-MrsGet "/health" | ConvertFrom-Json
if (-not $health.ok) { throw "health check failed" }
Write-Host "  health OK ($($health.name) v$($health.version))" -ForegroundColor Green

# 2. Fail-closed without auth
try {
    Invoke-MrsPost -Path "/v1/render-prompt" -Body @{ prompt = "unauth probe"; width = 64; height = 64 } -NoAuth
    throw "Expected 401 without auth"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw }
    Write-Host "  unauthenticated POST -> 401 (fail-closed OK)" -ForegroundColor Green
}

# 3. Authenticated one-shot render
$result = Invoke-MrsPost -Path "/v1/render-prompt" -Body @{
    prompt = "smoke test trefoil knot at dusk"
    mode   = "cinematic"
    width  = 64
    height = 64
}
if (-not $result.ok) {
    Write-Host ($result | ConvertTo-Json -Depth 6)
    throw "render-prompt returned ok=false"
}
Write-Host "  sceneId: $($result.data.sceneId)" -ForegroundColor Green
Write-Host "  sha256:  $($result.data.sha256)" -ForegroundColor Green
if ($result.data.previewUrl) {
    $img = Invoke-WebRequest -Uri $result.data.previewUrl -Method HEAD -UseBasicParsing
    Write-Host "  previewUrl HEAD -> $($img.StatusCode)" -ForegroundColor Green
}

Write-Host "`n=== All smoke checks passed ===" -ForegroundColor Cyan
