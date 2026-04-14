param(
  [switch]$Build,
  [switch]$Fresh,
  [int]$TimeoutSeconds = 900,
  [string]$AdminEmail = "admin.test@coffeeshop.local",
  [string]$AdminPassword = "Admin@123"
)

$ErrorActionPreference = "Stop"

function Test-PortFree {
  param([int]$Port)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Resolve-HostPort {
  param(
    [string]$EnvName,
    [int]$PreferredPort,
    [int[]]$FallbackPorts
  )

  $envItem = Get-Item -Path "Env:$EnvName" -ErrorAction SilentlyContinue
  if ($envItem -and $envItem.Value) {
    return [int]$envItem.Value
  }

  if (Test-PortFree -Port $PreferredPort) {
    return $PreferredPort
  }

  foreach ($candidate in $FallbackPorts) {
    if (Test-PortFree -Port $candidate) {
      Set-Item -Path "Env:$EnvName" -Value ([string]$candidate)
      Write-Host "[prepare] Port $PreferredPort is busy. Using $EnvName=$candidate"
      return $candidate
    }
  }

  throw "No free port available for $EnvName (preferred: $PreferredPort)."
}

function Get-StatusCode {
  param(
    [string]$Url,
    [hashtable]$Headers = @{}
  )

  $args = @("-k", "-s", "-o", "NUL", "-w", "%{http_code}", $Url)
  foreach ($entry in $Headers.GetEnumerator()) {
    $args += @("-H", "$($entry.Key): $($entry.Value)")
  }

  $raw = & curl.exe @args
  if ($LASTEXITCODE -ne 0) {
    return 0
  }

  $trimmed = [string]$raw
  $parsed = 0
  if ([int]::TryParse($trimmed, [ref]$parsed)) {
    return $parsed
  }
  return 0
}

function Get-EnvOrDefault {
  param(
    [string]$Name,
    [string]$DefaultValue
  )
  $item = Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
  if ($item -and $item.Value) {
    return $item.Value
  }
  return $DefaultValue
}

function Wait-HttpOk {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$Expected = @(200),
    [hashtable]$Headers = @{},
    [int]$Timeout = 300
  )

  $started = Get-Date
  while ((Get-Date) -lt $started.AddSeconds($Timeout)) {
    $code = Get-StatusCode -Url $Url -Headers $Headers
    if ($Expected -contains $code) {
      Write-Host "[prepare] OK: $Name ($code)"
      return
    }
    Write-Host "[prepare] Waiting: $Name (got $code, expected $($Expected -join '/'))"
    Start-Sleep -Seconds 5
  }

  throw "Timeout waiting for $Name ($Url)"
}

function Wait-AdminToken {
  param(
    [string]$BaseUrl,
    [string]$Email,
    [string]$Password,
    [int]$Timeout = 300
  )

  $started = Get-Date
  while ((Get-Date) -lt $started.AddSeconds($Timeout)) {
    try {
      $login = Invoke-JsonApi -Method "POST" -Url "$BaseUrl/api/users/login" -Body @{
        email = $Email
        password = $Password
      }
      $token = [string]$login.accessToken
      if (-not [string]::IsNullOrWhiteSpace($token)) {
        return $token
      }
    } catch {
      # keep retrying while services are still warming up
    }
    Start-Sleep -Seconds 5
  }

  throw "Cannot obtain access token with $Email"
}

function Invoke-JsonApi {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    $Body = $null
  )

  $params = @{
    Uri = $Url
    Method = $Method
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $params["Body"] = ($Body | ConvertTo-Json -Depth 20)
    $params["ContentType"] = "application/json"
  }

  return Invoke-RestMethod @params
}

if (-not (Test-Path ".env")) {
  if (-not (Test-Path ".env.example")) {
    throw "Missing both .env and .env.example"
  }
  Copy-Item ".env.example" ".env"
  Write-Host "[prepare] Created .env from .env.example"
}

Resolve-HostPort -EnvName "POSTGRES_HOST_PORT" -PreferredPort 5432 -FallbackPorts @(55432, 56432) | Out-Null
Resolve-HostPort -EnvName "REDIS_HOST_PORT" -PreferredPort 6379 -FallbackPorts @(56379, 57379) | Out-Null
$gatewayPort = Resolve-HostPort -EnvName "API_GATEWAY_HOST_PORT" -PreferredPort 8080 -FallbackPorts @(18080, 28080)
Resolve-HostPort -EnvName "CHAT_SERVICE_HOST_PORT" -PreferredPort 3007 -FallbackPorts @(13007, 23007) | Out-Null
$httpPort = Resolve-HostPort -EnvName "FRONTEND_HTTP_PORT" -PreferredPort 80 -FallbackPorts @(18000, 28000)
$httpsPort = Resolve-HostPort -EnvName "FRONTEND_HTTPS_PORT" -PreferredPort 443 -FallbackPorts @(18443, 28443)

$publicBaseUrl = if ($httpsPort -eq 443) { "https://localhost" } else { "https://localhost:$httpsPort" }
$apiBaseUrl = "http://127.0.0.1:$gatewayPort"

Write-Host "[prepare] Validating compose..."
docker compose config -q

if ($Fresh) {
  Write-Host "[prepare] Fresh start: docker compose down --remove-orphans"
  docker compose down --remove-orphans
}

$upArgs = @("compose", "up", "-d")
if ($Build) {
  $upArgs += "--build"
}

Write-Host "[prepare] Starting containers..."
docker @upArgs

Write-Host "[prepare] Waiting for public health endpoints..."
Wait-HttpOk -Name "Gateway root" -Url "$apiBaseUrl/" -Timeout $TimeoutSeconds
Wait-HttpOk -Name "User health" -Url "$apiBaseUrl/api/users/health" -Timeout $TimeoutSeconds
Wait-HttpOk -Name "Table health" -Url "$apiBaseUrl/api/tables/health" -Timeout $TimeoutSeconds
Wait-HttpOk -Name "Order health" -Url "$apiBaseUrl/api/orders/health" -Timeout $TimeoutSeconds
Wait-HttpOk -Name "Payment health" -Url "$apiBaseUrl/api/v1/payments/health" -Timeout $TimeoutSeconds

Write-Host "[prepare] Logging in with test admin account..."
$token = Wait-AdminToken -BaseUrl $apiBaseUrl -Email $AdminEmail -Password $AdminPassword -Timeout $TimeoutSeconds

$authHeaders = @{ Authorization = "Bearer $token" }

Write-Host "[prepare] Waiting for protected health endpoints..."
Wait-HttpOk -Name "Chat health" -Url "$apiBaseUrl/api/chats/health" -Headers $authHeaders -Timeout $TimeoutSeconds
Wait-HttpOk -Name "Inventory health" -Url "$apiBaseUrl/api/v1/ingredients/health" -Headers $authHeaders -Timeout $TimeoutSeconds
Wait-HttpOk -Name "Report health" -Url "$apiBaseUrl/api/reports/health" -Headers $authHeaders -Timeout $TimeoutSeconds

Write-Host "[prepare] Preparing reusable test resources (tableId/menuItemId)..."
$tables = Invoke-JsonApi -Method "GET" -Url "$apiBaseUrl/api/tables"
$tableId = ""
if ($tables -and $tables.Count -gt 0) {
  $tableId = [string]$tables[0].id
} else {
  $newTable = Invoke-JsonApi -Method "POST" -Url "$apiBaseUrl/api/tables" -Body @{
    number = (9000 + (Get-Random -Minimum 1 -Maximum 900))
    area = "Test Zone"
    capacity = 4
  }
  $tableId = [string]$newTable.id
}

$menu = Invoke-JsonApi -Method "GET" -Url "$apiBaseUrl/api/orders/menu" -Headers $authHeaders
$menuItemId = ""
if ($menu -and $menu.Count -gt 0) {
  $menuItemId = [string]$menu[0].id
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$reportDir = Join-Path $repoRoot "reports\tests"
if (-not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$contextPath = Join-Path $reportDir "service-test-context.json"
$context = [ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  apiBaseUrl = $apiBaseUrl
  publicBaseUrl = $publicBaseUrl
  ports = @{
    frontendHttp = $httpPort
    frontendHttps = $httpsPort
    postgres = [int](Get-EnvOrDefault -Name "POSTGRES_HOST_PORT" -DefaultValue "5432")
    redis = [int](Get-EnvOrDefault -Name "REDIS_HOST_PORT" -DefaultValue "6379")
    apiGateway = [int](Get-EnvOrDefault -Name "API_GATEWAY_HOST_PORT" -DefaultValue "8080")
    chatService = [int](Get-EnvOrDefault -Name "CHAT_SERVICE_HOST_PORT" -DefaultValue "3007")
  }
  testAccounts = @{
    adminEmail = $AdminEmail
    adminPassword = $AdminPassword
  }
  sampleData = @{
    tableId = $tableId
    menuItemId = $menuItemId
  }
}

$context | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 $contextPath

Write-Host ""
Write-Host "=== TEST ENV READY ==="
Write-Host "API URL:  $apiBaseUrl"
Write-Host "Public:   $publicBaseUrl"
Write-Host "Context:  $contextPath"
Write-Host "Table ID: $tableId"
Write-Host "Menu ID:  $menuItemId"
Write-Host ""
Write-Host "Next:"
Write-Host "  .\ops\scripts\run-full-api-test.ps1 -BaseUrl $apiBaseUrl"
