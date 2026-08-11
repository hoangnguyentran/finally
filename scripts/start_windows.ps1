# Start FinAlly in Docker (Windows PowerShell). Safe to run repeatedly.
#
#   .\scripts\start_windows.ps1              build if the image is missing, then run
#   .\scripts\start_windows.ps1 -Build       force a rebuild
#   .\scripts\start_windows.ps1 -NoBrowser   don't open a browser

[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$NoBrowser,
    [int]$Port = 8000,
    [string]$Image = "finally:latest",
    [string]$Container = "finally",
    [string]$Volume = "finally-data"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed. Install Docker Desktop: https://docker.com/products/docker-desktop"
    exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker is installed but not running. Start Docker Desktop and try again."
    exit 1
}

$EnvFile = Join-Path $RepoRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "No .env found - creating one from .env.example."
    Copy-Item (Join-Path $RepoRoot ".env.example") $EnvFile
    Write-Host "Edit $EnvFile and add your OPENROUTER_API_KEY for AI chat to work."
}

New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "db") | Out-Null

docker image inspect $Image *> $null
if ($Build -or $LASTEXITCODE -ne 0) {
    Write-Host "Building $Image ..."
    docker build -t $Image $RepoRoot
    if ($LASTEXITCODE -ne 0) { Write-Error "Docker build failed."; exit 1 }
}

$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $Container }
if ($existing) {
    Write-Host "Removing existing container '$Container' ..."
    docker rm -f $Container | Out-Null
}

Write-Host "Starting $Container on port $Port ..."
docker run -d `
    --name $Container `
    -p "$($Port):8000" `
    --env-file $EnvFile `
    -e DATABASE_PATH=/app/db/finally.db `
    -v "$($Volume):/app/db" `
    --restart unless-stopped `
    $Image | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start container."; exit 1 }

$Url = "http://localhost:$Port"

Write-Host -NoNewline "Waiting for FinAlly to come up "
for ($i = 0; $i -lt 60; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) { Write-Host " ready."; break }
    } catch {
        $running = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $Container }
        if (-not $running) {
            Write-Host ""
            Write-Host "Container exited during startup. Logs:"
            docker logs $Container
            exit 1
        }
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 1
    }
}
Write-Host ""

Write-Host "FinAlly is running at $Url"
Write-Host "Logs:  docker logs -f $Container"
Write-Host "Stop:  .\scripts\stop_windows.ps1"

if (-not $NoBrowser) {
    Start-Process $Url
}
