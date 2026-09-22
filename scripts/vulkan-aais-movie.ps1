# AAIS Vulkan slice movie on the drive that holds the repo and the RX 580.
# Do not set VK_DRIVER_FILES. The AMD Windows driver enumerates the 580.
# Lavapipe / RADV ICD paths are Linux-only and would hide that card.
$ErrorActionPreference = "Stop"

$Repo = if ($env:MRS_ROOT) { $env:MRS_ROOT } else { "G:\Mandala Rendering Software" }
if (-not (Test-Path (Join-Path $Repo "mandala\proto\vulkan-movie.mjs"))) {
  Write-Error "Repo not found at $Repo"
}

Set-Location $Repo

if (-not $env:VULKAN_SDK) {
  foreach ($root in @("C:\VulkanSDK", "G:\VulkanSDK")) {
    if (-not (Test-Path $root)) { continue }
    $hit = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      Select-Object -First 1
    if ($hit) {
      $env:VULKAN_SDK = $hit.FullName
      break
    }
  }
}

if ($env:VULKAN_SDK) {
  $sdkBin = Join-Path $env:VULKAN_SDK "Bin"
  if (Test-Path $sdkBin) {
    $env:PATH = "$sdkBin;$env:PATH"
  }
  Write-Host "VULKAN_SDK=$env:VULKAN_SDK"
} else {
  Write-Error "VULKAN_SDK is not set and no SDK was found under C:\VulkanSDK or G:\VulkanSDK"
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Get-Command cl -ErrorAction SilentlyContinue) -and (Test-Path $vswhere)) {
  $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  $vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
  if (Test-Path $vcvars) {
    cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
      if ($_ -match "^(.*?)=(.*)$") {
        Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
      }
    }
    Write-Host "MSVC environment imported"
  }
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  $bundled = Join-Path $Repo "runtime\toolchain\ffmpeg\usr\bin\ffmpeg.exe"
  if (Test-Path $bundled) { $env:MRS_FFMPEG = $bundled }
}

$out = Join-Path $Repo "output\mandala-vulkan-movie"
Write-Host "Rendering AAIS Vulkan movie -> $out"
node (Join-Path $Repo "mandala\proto\vulkan-movie.mjs") --frames 16 --width 160 --height 96 --fps 8 --out $out
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$receiptPath = Join-Path $out "receipt.json"
$receipt = Get-Content $receiptPath -Raw | ConvertFrom-Json
Write-Host ("device={0} type={1}" -f $receipt.device, $receipt.deviceType)
Write-Host ("mp4={0}" -f $receipt.mp4)
if ($receipt.deviceType -ne "discrete") {
  Write-Host "Expected deviceType discrete for the RX 580. AMD Vulkan ICD did not win enumeration."
  exit 2
}
