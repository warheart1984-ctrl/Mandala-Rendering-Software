<# 
.SYNOPSIS
  Registers the Jarvis Memory Board as a Windows scheduled task
  that starts at user logon and auto-restarts on failure.

.DESCRIPTION
  Creates a task named "JarvisMemoryBoard" in Task Scheduler.
  Log output goes to $(PROJECT_ROOT)\data\jarvis.log.
  The service runs on port 8001 (set JARVIS_PORT to change).
#>

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
$LogFile = "$ProjectRoot\data\jarvis.log"
$Port = if ($env:JARVIS_PORT) { $env:JARVIS_PORT } else { "8001" }

# Resolve the python from the hermes venv if it exists, else fallback to PATH
$VenvPython = "$env:USERPROFILE\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
$PythonExe = if (Test-Path $VenvPython) { $VenvPython } else { (Get-Command python).Source }

# Ensure log directory exists
New-Item -ItemType Directory -Path "$ProjectRoot\data" -Force | Out-Null

$BatchFile = "$PSScriptRoot\start-jarvis.cmd"
$Action = New-ScheduledTaskAction `
    -Execute $BatchFile `
    -WorkingDirectory $ProjectRoot

$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit 0 `
    -MultipleInstances IgnoreNew`

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel "Limited"

# Remove old task if exists
Unregister-ScheduledTask -TaskName "JarvisMemoryBoard" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName "JarvisMemoryBoard" `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force

Write-Host "[ok] JarvisMemoryBoard task registered."
Write-Host "     Script: $BatchFile"
Write-Host "     Port:   $Port"
Write-Host "     Log:    $LogFile"
Write-Host ""
Write-Host "Start now:    Start-ScheduledTask -TaskName JarvisMemoryBoard"
Write-Host "Check status: Get-ScheduledTask -TaskName JarvisMemoryBoard | Get-ScheduledTaskInfo"
Write-Host "Stop:         Stop-ScheduledTask -TaskName JarvisMemoryBoard"
Write-Host "Uninstall:    Unregister-ScheduledTask -TaskName JarvisMemoryBoard -Confirm:`$false"
