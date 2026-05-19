# code-ai installer for Windows
# Auto-installs Node.js (via winget) and pnpm (via npm) if missing.
#
# Usage (from PowerShell):
#   .\install.ps1
#
# Requires PowerShell 5.1+ and Windows 10 1709+ (for winget).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = Join-Path $env:USERPROFILE ".local\bin"
$WrapperCmd = Join-Path $InstallDir "code-ai.cmd"
$DistPath   = Join-Path $ScriptDir "dist\index.js"

Write-Host ""
Write-Host "  Installing code-ai CLI..."
Write-Host ""

# ---------------------------------------------------------------------------
# Helper — run a command and check exit code
# ---------------------------------------------------------------------------
function Invoke-Required {
    param([string]$Description, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: $Description failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# ---------------------------------------------------------------------------
# winget  (used to install Node.js if missing)
# ---------------------------------------------------------------------------
$hasWinget = $false
try {
    $null = Get-Command winget -ErrorAction Stop
    $hasWinget = $true
} catch {}

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------
function Install-Node {
    if ($hasWinget) {
        Write-Host "  Installing Node.js 22 LTS via winget..."
        winget install --id OpenJS.NodeJS.LTS --silent `
            --accept-package-agreements --accept-source-agreements
        # winget modifies PATH in the registry; refresh for this session
        $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                    [Environment]::GetEnvironmentVariable("PATH", "User")
    } else {
        Write-Host "  ERROR: winget is not available and Node.js is not installed." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Install Node.js 22 LTS manually from:"
        Write-Host "    https://nodejs.org/en/download"
        Write-Host ""
        Write-Host "  Then re-run this installer."
        exit 1
    }
}

$nodeFound = $false
try { $null = Get-Command node -ErrorAction Stop; $nodeFound = $true } catch {}

if (-not $nodeFound) {
    Install-Node
    try { $null = Get-Command node -ErrorAction Stop; $nodeFound = $true } catch {}
    if (-not $nodeFound) {
        Write-Host "  ERROR: Node.js installation did not succeed." -ForegroundColor Red
        exit 1
    }
}

# Version check
$nodeVersion = & node -e "process.stdout.write(process.versions.node)"
$nodeMajor   = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
    Write-Host "  Node.js v$nodeVersion is too old (need >= 20) — upgrading..."
    Install-Node
    $nodeVersion = & node -e "process.stdout.write(process.versions.node)"
    $nodeMajor   = [int]($nodeVersion.Split(".")[0])
    if ($nodeMajor -lt 20) {
        Write-Host "  ERROR: Upgrade failed. Install Node.js 22+ manually: https://nodejs.org/en/download" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  Node.js v$nodeVersion OK"

# ---------------------------------------------------------------------------
# pnpm
# ---------------------------------------------------------------------------
$pnpmFound = $false
try { $null = Get-Command pnpm -ErrorAction Stop; $pnpmFound = $true } catch {}

if (-not $pnpmFound) {
    Write-Host "  pnpm not found — installing..."
    npm install -g pnpm
    # Refresh PATH so pnpm is visible in this session
    $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("PATH", "User")
    try { $null = Get-Command pnpm -ErrorAction Stop; $pnpmFound = $true } catch {}
    if (-not $pnpmFound) {
        Write-Host "  ERROR: pnpm installation did not succeed." -ForegroundColor Red
        exit 1
    }
}
$pnpmVersion = & pnpm --version
Write-Host "  pnpm v$pnpmVersion OK"
Write-Host ""

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
Write-Host "  Installing dependencies..."
Set-Location $ScriptDir
Invoke-Required "pnpm install" { pnpm install --frozen-lockfile }

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
Write-Host "  Building..."
Invoke-Required "build" { node build.mjs }

# ---------------------------------------------------------------------------
# Install wrapper
# ---------------------------------------------------------------------------
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# .cmd wrapper works in both cmd.exe and PowerShell
$wrapperContent = "@echo off`r`nnode --enable-source-maps `"$DistPath`" %*`r`n"
[System.IO.File]::WriteAllText($WrapperCmd, $wrapperContent, [System.Text.Encoding]::ASCII)

Write-Host ""
Write-Host "  OK  Installed to $WrapperCmd" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# PATH
# ---------------------------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -eq $null) { $userPath = "" }

if ($userPath -notlike "*$InstallDir*") {
    $newPath = "$InstallDir;$userPath".TrimEnd(";")
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    Write-Host "  Added $InstallDir to your user PATH."
    Write-Host "  Restart your terminal, then run: code-ai"
} else {
    Write-Host "  Run it with: code-ai"
}
Write-Host ""

# ---------------------------------------------------------------------------
# First-run hint
# ---------------------------------------------------------------------------
$configPath = Join-Path $env:USERPROFILE ".config\code-ai\config.json"
if (-not (Test-Path $configPath)) {
    Write-Host "  No config found. Run the setup wizard next:"
    Write-Host ""
    Write-Host "    code-ai --setup"
    Write-Host ""
    Write-Host "  Or just run code-ai — setup runs automatically on first launch."
    Write-Host ""
}
