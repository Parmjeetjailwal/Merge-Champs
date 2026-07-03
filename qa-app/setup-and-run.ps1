<#
  Installs all dependencies, sets up the database schema (+ demo data),
  builds both apps, and runs the QA Management Application.

  Usage (from the qa-app folder):
    powershell -ExecutionPolicy Bypass -File .\setup-and-run.ps1
    $env:SKIP_SEED = '1'; .\setup-and-run.ps1     # skip demo data
    $env:PORT = '8080'; .\setup-and-run.ps1       # custom port
#>
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# --- Ensure Node is on PATH (auto-detect a winget-installed Node) ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeExe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($nodeExe) {
    $env:Path = (Split-Path $nodeExe.FullName) + ';' +
                "$env:LOCALAPPDATA\Microsoft\WinGet\Links;" + $env:Path
  }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 18+ not found. Install it (e.g. 'winget install OpenJS.NodeJS.LTS') and re-run."
  exit 1
}
Write-Host "Using Node $(node -v) / npm $(npm -v)"

# Runs a command in an optional working directory and stops on failure.
function Invoke-Step {
  param([string]$Exe, [string[]]$Arguments, [string]$WorkingDir)
  if ($WorkingDir) { Push-Location $WorkingDir }
  try {
    Write-Host ">> $Exe $($Arguments -join ' ')" -ForegroundColor Cyan
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Exe $($Arguments -join ' ')" }
  } finally {
    if ($WorkingDir) { Pop-Location }
  }
}

# --- 1. Install dependencies ----------------------------------------------
Write-Host "==> Installing root tooling..."
Invoke-Step npm @('install')
Write-Host "==> Installing backend dependencies..."
Invoke-Step npm @('install') 'backend'
Write-Host "==> Installing frontend dependencies..."
Invoke-Step npm @('install') 'frontend'

# --- 2. Database: Prisma client + schema (+ demo data) --------------------
Write-Host "==> Generating Prisma client and applying the database schema..."
Invoke-Step npm @('run', 'db:generate') 'backend'
Invoke-Step npm @('run', 'db:push') 'backend'
if ($env:SKIP_SEED -ne '1') {
  Write-Host "==> Seeding demo data..."
  Invoke-Step npm @('run', 'seed') 'backend'
}

# --- 3. Build both apps ---------------------------------------------------
Write-Host "==> Building backend..."
Invoke-Step npm @('run', 'build') 'backend'
Write-Host "==> Building frontend..."
Invoke-Step npm @('run', 'build') 'frontend'

# --- 4. Run (single server serves the API + the built UI) -----------------
$port = if ($env:PORT) { $env:PORT } else { '4000' }
Write-Host ""
Write-Host "==> Starting the QA app on http://localhost:$port  (press Ctrl+C to stop)"
$env:PORT = $port
Push-Location backend
try { npm start } finally { Pop-Location }
