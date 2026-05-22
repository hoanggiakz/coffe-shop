param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Set-Location (Resolve-Path "$PSScriptRoot\..\..")

if (-not (Test-Path ".env")) {
  Copy-Item ".env.local-demo.example" ".env"
  Write-Host "Created .env from .env.local-demo.example"
} else {
  Write-Host ".env already exists, keep current values"
}

if ($SkipBuild) {
  docker compose up -d
} else {
  docker compose up -d --build
}

Write-Host "Waiting for key endpoints..."

$checks = @(
  @{ Name = "Frontend"; Url = "http://localhost/" },
  @{ Name = "Gateway"; Url = "http://localhost:8080/" },
  @{ Name = "User"; Url = "http://localhost:8080/api/users/health" },
  @{ Name = "Tables"; Url = "http://localhost:8080/api/tables/health" },
  @{ Name = "Orders"; Url = "http://localhost:8080/api/orders/health" },
  @{ Name = "Chat"; Url = "http://localhost:3007/api/chats/health" },
  @{ Name = "Payments"; Url = "http://localhost:8080/api/v1/payments/health" }
)

foreach ($check in $checks) {
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $status = (Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 4).StatusCode
      if ($status -ge 200 -and $status -lt 500) {
        $ok = $true
        break
      }
    } catch {}
    Start-Sleep -Seconds 2
  }

  if (-not $ok) {
    throw "Health check failed: $($check.Name) ($($check.Url))"
  }

  Write-Host ("[OK] " + $check.Name)
}

Write-Host ""
Write-Host "Local demo is ready:"
Write-Host "  - Frontend: http://localhost"
Write-Host "  - API via gateway: http://localhost:8080/api"
