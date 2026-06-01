param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$AdminToken = $env:ADMIN_TOKEN,
  [string]$StaffToken = $env:STAFF_TOKEN,
  [string]$BadRoleToken = $env:BAD_ROLE_TOKEN,
  [string]$TableId = $env:TABLE_ID,
  [string]$OrderId = $env:ORDER_ID,
  [string]$OrderItemId = $env:ORDER_ITEM_ID,
  [string]$PaymentId = $env:PAYMENT_ID
)

$ErrorActionPreference = "Stop"

function Invoke-Route {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [int[]]$Expect,
    [string]$Token = "",
    [object]$Body = $null
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $params = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $headers
    ContentType = "application/json"
  }
  if ($null -ne $Body) {
    $params["Body"] = ($Body | ConvertTo-Json -Depth 8)
  }

  try {
    Invoke-RestMethod @params | Out-Null
    $status = 200
  } catch {
    $status = [int]$_.Exception.Response.StatusCode
  }

  if ($Expect -notcontains $status) {
    throw "[$Name] expected $($Expect -join '/') but got $status for $Method $Path"
  }

  Write-Host "OK [$status] $Name"
}

Invoke-Route "public login reachable" "POST" "/api/users/login" @(200, 400, 401) -Body @{ email = "invalid@example.com"; password = "invalid" }
if ($TableId) {
  Invoke-Route "public table detail" "GET" "/api/tables/$TableId" @(200, 404)
  Invoke-Route "public table qr" "GET" "/api/tables/$TableId/qr" @(200, 404)
  Invoke-Route "public call staff" "POST" "/api/tables/$TableId/call-staff" @(200, 404)
  Invoke-Route "protected table status without token" "PATCH" "/api/tables/$TableId/status" @(401) -Body @{ status = "OCCUPIED" }
}

Invoke-Route "protected orders without token" "GET" "/api/orders" @(401)
if ($StaffToken -and $OrderId) {
  Invoke-Route "staff order status" "PATCH" "/api/orders/$OrderId/status" @(200, 400, 403, 404) -Token $StaffToken -Body @{ status = "PREPARING" }
}
if ($AdminToken -and $OrderId -and $OrderItemId) {
  Invoke-Route "kds item status" "PATCH" "/api/orders/$OrderId/items/$OrderItemId/status" @(200, 400, 404) -Token $AdminToken -Body @{ status = "PREPARING" }
}

Invoke-Route "protected inventory without token" "GET" "/api/v1/ingredients" @(401)
if ($AdminToken) {
  Invoke-Route "admin inventory list" "GET" "/api/v1/ingredients" @(200) -Token $AdminToken
  Invoke-Route "admin reports dashboard" "GET" "/api/reports/dashboard" @(200) -Token $AdminToken
}
if ($BadRoleToken) {
  Invoke-Route "wrong role inventory blocked" "GET" "/api/v1/ingredients" @(403) -Token $BadRoleToken
  Invoke-Route "wrong role reports blocked" "GET" "/api/reports/dashboard" @(403) -Token $BadRoleToken
}

Invoke-Route "protected payment list without token" "GET" "/api/v1/payments" @(401)
if ($StaffToken -and $PaymentId) {
  Invoke-Route "staff confirm cash guarded" "POST" "/api/v1/payments/$PaymentId/confirm-cash" @(200, 400, 404) -Token $StaffToken -Body @{ confirmedBy = "Smoke Test"; amountReceived = 0 }
}

Write-Host "Security route smoke checks completed."
