<#
.SYNOPSIS
  Start Jarvis Memory Board on port 8001 (idempotent).

.DESCRIPTION
  If health check already succeeds, exits 0. Otherwise starts uvicorn in a
  new minimized window and waits briefly for /health.
#>

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Port = if ($env:JARVIS_PORT) { $env:JARVIS_PORT } else { "8001" }
$HostBind = if ($env:JARVIS_HOST) { $env:JARVIS_HOST } else { "127.0.0.1" }
$Base = if ($env:JARVIS_MEMORYBOARD_URL) { $env:JARVIS_MEMORYBOARD_URL.TrimEnd("/") } else { "http://127.0.0.1:$Port" }
$LogDir = Join-Path $Root "data"
$LogFile = Join-Path $LogDir "jarvis.log"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Test-Healthy {
  try {
    $r = Invoke-RestMethod -Uri "$Base/health" -Method GET -TimeoutSec 2
    return ($r.status -eq "ok")
  } catch {
    return $false
  }
}

if (Test-Healthy) {
  Write-Host "[ok] Jarvis Memory Board already running at $Base"
  exit 0
}

$Candidates = @(
  "$env:USERPROFILE\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe",
  "G:\.runtime\python-3.13.14\python.exe",
  (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
) | Where-Object { $_ -and (Test-Path $_) }

$Python = $Candidates | Select-Object -First 1
if (-not $Python) {
  Write-Error "No Python found. Install Python 3.11+ or set PATH."
  exit 1
}

Push-Location $Root
try {
  & $Python -c "import fastapi, uvicorn" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[info] Installing jarvis-memoryboard package (editable)..."
    & $Python -m pip install -e ".[dev]" --quiet
  }
} finally {
  Pop-Location
}

$ArgList = "-m uvicorn app.main:app --host $HostBind --port $Port --log-level warning"
$ErrLog = Join-Path $LogDir "jarvis.err.log"
Write-Host "[info] Starting Jarvis Memory Board with $Python"
$proc = Start-Process -FilePath $Python `
  -ArgumentList $ArgList `
  -WorkingDirectory $Root `
  -WindowStyle Minimized `
  -RedirectStandardOutput $LogFile `
  -RedirectStandardError $ErrLog `
  -PassThru

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  if (Test-Healthy) {
    Write-Host "[ok] Jarvis Memory Board live at $Base (pid $($proc.Id))"
    exit 0
  }
  Start-Sleep -Milliseconds 400
}

Write-Error "Service did not become healthy within 20s. Check $LogFile"
exit 1
