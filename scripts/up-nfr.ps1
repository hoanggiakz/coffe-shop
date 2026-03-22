param(
  [switch]$Build = $true
)

$ErrorActionPreference = "Stop"

$args = @("compose", "up", "-d", "--remove-orphans")
if ($Build) {
  $args += "--build"
}
$args += @("--scale", "order-service=2", "--scale", "payment-service=2")

Write-Host "Starting NFR phase 1 stack with order-service=2 and payment-service=2..."
docker @args

Write-Host ""
Write-Host "Current containers:"
docker compose ps
