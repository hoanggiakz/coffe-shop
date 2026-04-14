param(
  [string]$BaseUrl = "",
  [string]$AdminEmail = "admin.test@coffeeshop.local",
  [string]$AdminPassword = "Admin@123"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $contextPath = "reports/tests/service-test-context.json"
  if (Test-Path $contextPath) {
    try {
      $context = Get-Content $contextPath | ConvertFrom-Json
      if ($context.apiBaseUrl) {
        $BaseUrl = [string]$context.apiBaseUrl
      }
    } catch {
      # fallback below
    }
  }
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = "http://127.0.0.1:8080"
}

$env:BASE_URL = $BaseUrl
$env:ADMIN_EMAIL = $AdminEmail
$env:ADMIN_PASSWORD = $AdminPassword

if ($BaseUrl.StartsWith("https://")) {
  $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

Write-Host "[full-test] Running exhaustive API test suite..."
node ops/scripts/test-remaining-apis.mjs

if ($LASTEXITCODE -ne 0) {
  throw "[full-test] test-remaining-apis.mjs failed."
}

Write-Host "[full-test] Completed successfully."
Write-Host "[full-test] Report folder: reports/api-tests"
