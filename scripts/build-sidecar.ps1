#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Build the axiome-api PyInstaller sidecar and place it where Tauri expects.
.DESCRIPTION
  1. Activates the Python venv
  2. Runs PyInstaller with the spec file
  3. Copies the output folder to UI/src-tauri/binaries/
  
  Tauri expects the sidecar at:
    src-tauri/binaries/axiome-api-x86_64-pc-windows-msvc.exe  (Windows)
    src-tauri/binaries/axiome-api-x86_64-apple-darwin          (macOS)
    src-tauri/binaries/axiome-api-x86_64-unknown-linux-gnu     (Linux)
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$Root\API")) { $Root = Split-Path -Parent $PSScriptRoot }

Write-Host "=== Building Axiome API Sidecar ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

# Determine target triple – use rustc if available, else fall back to env var
$triple = $null
try {
    $triple = (rustc -vV 2>$null | Select-String 'host:').ToString().Split(':')[1].Trim()
} catch {}
if (-not $triple) {
    $procArch = $env:PROCESSOR_ARCHITECTURE   # AMD64 | ARM64 | x86
    $triple = switch ($true) {
        ($env:OS -eq "Windows_NT") {
            if ($procArch -eq "AMD64") { "x86_64-pc-windows-msvc" } else { "aarch64-pc-windows-msvc" }
        }
        default { "x86_64-pc-windows-msvc" }
    }
}
Write-Host "Target triple: $triple"

# Activate venv
Push-Location "$Root\API"
if (Test-Path "venv310\Scripts\Activate.ps1") {
    . .\venv310\Scripts\Activate.ps1
} elseif (Test-Path "venv\Scripts\Activate.ps1") {
    . .\venv\Scripts\Activate.ps1
} elseif (Test-Path ".venv\Scripts\Activate.ps1") {
    . .\.venv\Scripts\Activate.ps1
} else {
    Write-Error "No Python venv found in API/. Run: python -m venv venv310 && pip install -r requirements.txt"
}

# Run PyInstaller
Write-Host "`n=== Running PyInstaller ===" -ForegroundColor Cyan
pyinstaller axiome_api.spec --noconfirm --clean
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }

# Copy to Tauri binaries
$binDir = "$Root\UI\src-tauri\binaries"
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# Copy sidecar to Tauri binaries directory
# The spec uses onefile mode → output is dist/axiome-api.exe
$onefileExe = "dist\axiome-api.exe"
$onefolderExe = "dist\axiome-api\axiome-api.exe"
$destExe = "$binDir\axiome-api-$triple.exe"

if (Test-Path $onefileExe) {
    Copy-Item $onefileExe $destExe -Force
    Write-Host "`nOnefile sidecar copied to: $destExe" -ForegroundColor Green
} elseif (Test-Path $onefolderExe) {
    Copy-Item $onefolderExe $destExe -Force
    Write-Host "`nOnefolder sidecar exe copied to: $destExe" -ForegroundColor Green
} else {
    throw "PyInstaller output not found. Expected $onefileExe or $onefolderExe"
}

Pop-Location
Write-Host "`n=== Sidecar build complete ===" -ForegroundColor Green
