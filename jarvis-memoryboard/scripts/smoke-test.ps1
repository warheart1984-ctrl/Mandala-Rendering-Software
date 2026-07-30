<#
.SYNOPSIS
  Smoke-test Continuity Ledger GET/POST against a live server.
#>

$ErrorActionPreference = "Stop"
$Base = if ($env:JARVIS_MEMORYBOARD_URL) { $env:JARVIS_MEMORYBOARD_URL.TrimEnd("/") } else { "http://127.0.0.1:8001" }

Write-Host "=== Continuity Ledger smoke test ==="
Write-Host "Base: $Base"

$health = Invoke-RestMethod -Uri "$Base/health" -Method GET -TimeoutSec 5
if ($health.status -ne "ok") { throw "health failed: $($health | ConvertTo-Json -Compress)" }
Write-Host "[ok] GET /health status=$($health.status) schema=$($health.schema) memories=$($health.memory_count)"

$board = Invoke-RestMethod -Uri "$Base/api/jarvis/memory/board" -Method GET -TimeoutSec 5
Write-Host "[ok] GET /api/jarvis/memory/board id=$($board.memory_board.board_id)"

$live = Invoke-RestMethod -Uri "$Base/api/jarvis/memory/retrieve?truth_scope=live&limit=5" -Method GET -TimeoutSec 5
Write-Host "[ok] GET retrieve live_count=$($live.memories.Count) selections=$($live.selections.Count)"

$body = @{
  content = "Smoke test Continuity Ledger entry at $(Get-Date -Format o)"
  source_agent = "smoke-test.ps1"
  session_id = "smoke-session"
  type = "fact"
  confidence = 0.4
  status = "draft"
  subject = "smoke-test"
  evidence = @(@{ kind = "script"; ref = "scripts/smoke-test.ps1"; note = "automated smoke" })
  tags = @("smoke-test", "jarvis-memoryboard")
} | ConvertTo-Json -Depth 5

$created = Invoke-RestMethod -Uri "$Base/api/jarvis/memory" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
Write-Host "[ok] POST /api/jarvis/memory id=$($created.memory.id) sha=$($created.memory.content_sha256.Substring(0,12))..."

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Hook = Join-Path $RepoRoot "jarvis-memoryboard\agent-hooks\jarvis_session_start.py"
$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $Python) { $Python = "G:\.runtime\python-3.13.14\python.exe" }
$stdin = '{"session_id":"smoke-session","composer_mode":"agent","is_background_agent":false}'
$out = $stdin | & $Python -X utf8 $Hook
$parsed = $out | ConvertFrom-Json
if (-not $parsed.additional_context) { throw "sessionStart hook did not emit additional_context" }
$ctx = Join-Path $RepoRoot ".cursor\hooks\state\jarvis-live-context.md"
if (-not (Test-Path $ctx)) { throw "missing context file: $ctx" }
Write-Host "[ok] sessionStart hook emitted context ($($parsed.additional_context.Length) chars)"
Write-Host "=== ALL SMOKE CHECKS PASSED ==="
