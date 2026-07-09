<#
    One-shot bootstrapper for the QA Management Application.

    It will:
      1. Install Node.js (if missing) using winget/choco.
      2. Install npm dependencies.
      3. Create backend\.env if missing.
      4. Generate Prisma client.
      5. Push database schema.
      6. Seed demo data (optional).
      7. Build backend/frontend.
      8. Run tests (optional).
      9. Start the application.

    Usage:

      powershell -ExecutionPolicy Bypass -File .\setup-and-run.ps1

      $env:SKIP_SEED='1'
      .\setup-and-run.ps1

      $env:SKIP_TESTS='1'
      .\setup-and-run.ps1

      $env:NO_RUN='1'
      .\setup-and-run.ps1

      $env:PORT='8080'
      .\setup-and-run.ps1
#>

#Requires -Version 5.1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$MinimumNodeMajor = 18
$DesiredNodeMajor = if ($env:NODE_VERSION) { $env:NODE_VERSION } else { "20" }

function Info($msg) {
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Success($msg) {
    Write-Host "OK: $msg" -ForegroundColor Green
}

function Warn($msg) {
    Write-Host "WARN: $msg" -ForegroundColor Yellow
}

function Fail($msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

function Invoke-Step {
    param(
        [string]$Exe,
        [string[]]$Arguments,
        [string]$WorkingDir
    )

    if ($WorkingDir) {
        Push-Location $WorkingDir
    }

    try {
        Write-Host ">> $Exe $($Arguments -join ' ')" -ForegroundColor DarkCyan
        & $Exe @Arguments

        if ($LASTEXITCODE -ne 0) {
            throw "$Exe failed."
        }
    }
    finally {
        if ($WorkingDir) {
            Pop-Location
        }
    }
}

#########################################################
# Node Installation
#########################################################

function Get-NodeMajor {

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        return $null
    }

    $version = node -v
    return [int](($version.TrimStart("v")).Split(".")[0])
}

function Ensure-Node {

    $major = Get-NodeMajor

    if ($major -and $major -ge $MinimumNodeMajor) {
        Success "Using Node $(node -v) / npm $(npm -v)"
        return
    }

    Warn "Node.js $MinimumNodeMajor+ not found."

    if (Get-Command winget -ErrorAction SilentlyContinue) {

        Info "Installing Node.js using winget..."

        winget install `
            OpenJS.NodeJS.LTS `
            --accept-package-agreements `
            --accept-source-agreements `
            --silent

    }
    elseif (Get-Command choco -ErrorAction SilentlyContinue) {

        Info "Installing Node.js using Chocolatey..."

        choco install nodejs-lts -y

    }
    else {

        Fail @"
Unable to install Node automatically.

Please install Node.js $MinimumNodeMajor+ from:

https://nodejs.org

Then rerun this script.
"@
    }

    $nodeExe = Get-ChildItem `
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" `
        -Recurse `
        -Filter node.exe `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($nodeExe) {

        $env:PATH =
            (Split-Path $nodeExe.FullName) + ";" +
            "$env:LOCALAPPDATA\Microsoft\WinGet\Links;" +
            $env:PATH
    }

    $major = Get-NodeMajor

    if (-not $major -or $major -lt $MinimumNodeMajor) {

        Fail "Node installation failed."
    }

    Success "Installed Node $(node -v) / npm $(npm -v)"
}

#########################################################
# Start
#########################################################

Ensure-Node

#########################################################
# Install Dependencies
#########################################################

Info "Installing root dependencies..."
Invoke-Step npm @("install")

Info "Installing backend dependencies..."
Invoke-Step npm @("install") "backend"

Info "Installing frontend dependencies..."
Invoke-Step npm @("install") "frontend"

#########################################################
# Create backend\.env
#########################################################

$envFile = Join-Path $PSScriptRoot "backend\.env"

if (!(Test-Path $envFile)) {

    Info "Creating backend\.env"

@'
DATABASE_URL="file:./dev.db"
PORT=4000
'@ | Set-Content $envFile
}

#########################################################
# Prisma
#########################################################

Info "Generating Prisma Client..."
Invoke-Step npm @("run","db:generate") "backend"

Info "Applying Database Schema..."
Invoke-Step npm @("run","db:push") "backend"

if ($env:SKIP_SEED -ne "1") {

    Info "Seeding demo data..."
    Invoke-Step npm @("run","seed") "backend"
}
else {

    Warn "Skipping demo data."
}

#########################################################
# Build
#########################################################

Info "Building backend..."
Invoke-Step npm @("run","build") "backend"

Info "Building frontend..."
Invoke-Step npm @("run","build") "frontend"

#########################################################
# Tests
#########################################################

if ($env:SKIP_TESTS -ne "1") {

    Info "Running tests..."
    Invoke-Step npm @("test") "backend"
}
else {

    Warn "Skipping tests."
}

#########################################################
# Run
#########################################################

if ($env:NO_RUN -eq "1") {

    Success "Setup complete. NO_RUN=1 set. Exiting."
    exit 0
}

$port = if ($env:PORT) { $env:PORT } else { "4000" }

$env:PORT = $port

Write-Host ""
Info "Starting QA Application on http://localhost:$port"
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

Push-Location backend

try {

    npm start

}
finally {

    Pop-Location
}
