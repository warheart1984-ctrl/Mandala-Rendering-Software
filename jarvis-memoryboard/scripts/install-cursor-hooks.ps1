<#
.SYNOPSIS
  Installs Jarvis Memory Board Cursor hooks + always-apply rule into .cursor/

.DESCRIPTION
  Copies committed artifacts from jarvis-memoryboard/agent-hooks/ into the
  local (gitignored) .cursor/ tree so every chat in this workspace loads and
  persists cross-session memory.
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Src = Join-Path $RepoRoot "jarvis-memoryboard\agent-hooks"
$HooksDir = Join-Path $RepoRoot ".cursor\hooks"
$RulesDir = Join-Path $RepoRoot ".cursor\rules"
$StateDir = Join-Path $HooksDir "state"

New-Item -ItemType Directory -Path $HooksDir -Force | Out-Null
New-Item -ItemType Directory -Path $RulesDir -Force | Out-Null
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

Copy-Item -Force (Join-Path $Src "hooks.json") (Join-Path $RepoRoot ".cursor\hooks.json")
Copy-Item -Force (Join-Path $Src "jarvis-memoryboard.mdc") (Join-Path $RulesDir "jarvis-memoryboard.mdc")

# Keep runnable copies under .cursor/hooks for Hooks UI clarity; commands still
# point at the committed jarvis-memoryboard/agent-hooks paths.
Copy-Item -Force (Join-Path $Src "jarvis_common.py") (Join-Path $HooksDir "jarvis_common.py")
Copy-Item -Force (Join-Path $Src "jarvis_session_start.py") (Join-Path $HooksDir "jarvis_session_start.py")
Copy-Item -Force (Join-Path $Src "jarvis_after_response.py") (Join-Path $HooksDir "jarvis_after_response.py")
Copy-Item -Force (Join-Path $Src "jarvis_session_end.py") (Join-Path $HooksDir "jarvis_session_end.py")

Write-Host "[ok] Installed Jarvis Memory Board Cursor integration"
Write-Host "     hooks:  $($RepoRoot)\.cursor\hooks.json"
Write-Host "     rule:   $($RulesDir)\jarvis-memoryboard.mdc"
Write-Host "     Reload Cursor hooks (Hooks settings) if already open."
Write-Host "     Start service: jarvis-memoryboard\scripts\start-memoryboard.ps1"
