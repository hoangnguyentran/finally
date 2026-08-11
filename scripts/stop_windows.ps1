# Stop FinAlly (Windows PowerShell). Safe to run repeatedly.
# The named volume is kept, so the portfolio database survives.

[CmdletBinding()]
param(
    [string]$Container = "finally"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker isn't installed - nothing to stop."
    exit 0
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker isn't running - nothing to stop."
    exit 0
}

$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $Container }
if ($existing) {
    Write-Host "Stopping and removing container '$Container' ..."
    docker rm -f $Container | Out-Null
    Write-Host "Stopped. Your data is preserved in the 'finally-data' volume."
} else {
    Write-Host "Container '$Container' is not running."
}
