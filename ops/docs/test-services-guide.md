# Hướng Dẫn Test Từng Service

Ngày cập nhật: `2026-04-14`

Tài liệu này bám đúng API hiện tại trong code và route qua `api-gateway`.

## 1. Chuẩn bị môi trường test

```powershell
# Chạy tại thư mục Microservices
.\ops\scripts\prepare-test-env.ps1
```

Script trên sẽ:

- Dựng lại các container cần thiết bằng `docker compose up -d`.
- Tự xử lý xung đột port phổ biến (`5432`, `6379`, `8080`, `3007`, `80`, `443`) bằng port dự phòng.
- Chờ toàn bộ health endpoint lên `200`.
- Đăng nhập account admin test và tạo sẵn context test.
- Ghi context vào `reports/tests/service-test-context.json`.

## 2. Chạy full regression tự động (tất cả service)

```powershell
.\ops\scripts\run-full-api-test.ps1
```

Kết quả chi tiết lưu trong thư mục `reports/api-tests`.

## 3. Khởi tạo biến dùng chung cho test tay

```powershell
$ctx = Get-Content .\reports\tests\service-test-context.json | ConvertFrom-Json
$BaseUrl = $ctx.apiBaseUrl

$login = Invoke-RestMethod -Uri "$BaseUrl/api/users/login" -Method POST -ContentType "application/json" -Body (@{
  email = $ctx.testAccounts.adminEmail
  password = $ctx.testAccounts.adminPassword
} | ConvertTo-Json)

$Token = $login.accessToken
$Auth = @{ Authorization = "Bearer $Token" }

$TableId = $ctx.sampleData.tableId
$MenuItemId = $ctx.sampleData.menuItemId
```

## 4. Test từng service

### 4.1 API Gateway

```powershell
Invoke-RestMethod -Uri "$BaseUrl/"
```

Kỳ vọng: trả `status: ok`.

### 4.2 User Service (`/api/users`)

```powershell
Invoke-RestMethod -Uri "$BaseUrl/api/users/health"
Invoke-RestMethod -Uri "$BaseUrl/api/users/profile" -Headers $Auth
Invoke-RestMethod -Uri "$BaseUrl/api/users/staff" -Headers $Auth
```

Kỳ vọng: `health = ok`, profile có `role=ADMIN`, danh sách staff trả mảng.

### 4.3 Table Service (`/api/tables`)

```powershell
$newTable = Invoke-RestMethod -Uri "$BaseUrl/api/tables" -Method POST -ContentType "application/json" -Body (@{
  number = (9100 + (Get-Random -Minimum 1 -Maximum 500))
  area = "QA Zone"
  capacity = 4
} | ConvertTo-Json)

$newTableId = $newTable.id
Invoke-RestMethod -Uri "$BaseUrl/api/tables/$newTableId/qr"
Invoke-RestMethod -Uri "$BaseUrl/api/tables/$newTableId/call-staff" -Method POST -ContentType "application/json" -Body '{"reason":"Need water"}'
```

Kỳ vọng: tạo bàn thành công, lấy được `qrCode`, gọi staff trả `200`.

### 4.4 Order Service (`/api/orders`)

```powershell
Invoke-RestMethod -Uri "$BaseUrl/api/orders/menu" -Headers $Auth

$order = Invoke-RestMethod -Uri "$BaseUrl/api/orders" -Method POST -ContentType "application/json" -Body (@{
  tableId = $TableId
  customerName = "QA Customer"
  customerEmail = "qa.order@local.test"
  items = @(@{
    menuItemId = $MenuItemId
    quantity = 1
    note = "less sugar"
  })
} | ConvertTo-Json -Depth 10)

$orderId = $order.id
$itemId = $order.orderItems[0].id

Invoke-RestMethod -Uri "$BaseUrl/api/orders/$orderId/items/$itemId/status" -Method PATCH -Headers $Auth -ContentType "application/json" -Body '{"status":"PREPARING"}'
Invoke-RestMethod -Uri "$BaseUrl/api/orders/$orderId/items/$itemId/status" -Method PATCH -Headers $Auth -ContentType "application/json" -Body '{"status":"READY"}'
Invoke-RestMethod -Uri "$BaseUrl/api/orders/$orderId/status" -Method PATCH -Headers $Auth -ContentType "application/json" -Body '{"status":"COMPLETED"}'
Invoke-RestMethod -Uri "$BaseUrl/api/orders/history?email=qa.order@local.test"
```

Kỳ vọng: order tạo được, item đi qua `PREPARING -> READY`, order chuyển `COMPLETED`, history trả đơn vừa tạo.

### 4.5 Chat Service (`/api/chats` + WS `/chat`)

```powershell
$chat = Invoke-RestMethod -Uri "$BaseUrl/api/chats" -Method POST -Headers $Auth -ContentType "application/json" -Body (@{
  tableId = $TableId
  customerName = "QA Chat"
} | ConvertTo-Json)

$chatId = $chat.id

Invoke-RestMethod -Uri "$BaseUrl/api/chats/$chatId/messages" -Method POST -Headers $Auth -ContentType "application/json" -Body (@{
  senderType = "CUSTOMER"
  senderName = "QA Chat"
  content = "Xin chao staff"
} | ConvertTo-Json)

Invoke-RestMethod -Uri "$BaseUrl/api/chats/$chatId/messages" -Headers $Auth
Invoke-RestMethod -Uri "$BaseUrl/api/chats/$chatId/close" -Method PATCH -Headers $Auth
```

Kỳ vọng: tạo chat, gửi/đọc tin nhắn, đóng chat thành công.

### 4.6 Inventory Service (`/api/v1/ingredients`)

```powershell
Invoke-RestMethod -Uri "$BaseUrl/api/v1/ingredients/health" -Headers $Auth

$ingredient = Invoke-RestMethod -Uri "$BaseUrl/api/v1/ingredients" -Method POST -Headers $Auth -ContentType "application/json" -Body (@{
  name = "QA Ingredient"
  unit = "kg"
  stock = 10
  minStock = 2
  importPrice = 90000
} | ConvertTo-Json)

$ingredientId = $ingredient.id

Invoke-RestMethod -Uri "$BaseUrl/api/v1/ingredients/stock/import" -Method POST -Headers $Auth -ContentType "application/json" -Body (@{
  ingredientId = $ingredientId
  type = "IMPORT"
  source = "MANUAL"
  quantity = 2
  unitPrice = 90000
  reason = "QA import"
} | ConvertTo-Json)

Invoke-RestMethod -Uri "$BaseUrl/api/v1/ingredients/stock/movements?ingredientId=$ingredientId&limit=20" -Headers $Auth
Invoke-RestMethod -Uri "$BaseUrl/api/v1/ingredients/$ingredientId" -Method DELETE -Headers $Auth
```

Kỳ vọng: tạo nguyên liệu, nhập kho, thấy movement, xóa mềm thành công.

### 4.7 Payment Service (`/api/v1/payments`)

```powershell
Invoke-RestMethod -Uri "$BaseUrl/api/v1/payments/health"

$cashPayment = Invoke-RestMethod -Uri "$BaseUrl/api/v1/payments" -Method POST -ContentType "application/json" -Body (@{
  orderId = "QA-CASH-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  amount = 120000
  provider = "CASH"
  tableId = $TableId
} | ConvertTo-Json)

$paymentId = $cashPayment.paymentId
Invoke-RestMethod -Uri "$BaseUrl/api/v1/payments/$paymentId/confirm-cash" -Method POST -Headers $Auth -ContentType "application/json" -Body '{"confirmedBy":"QA Staff","amountReceived":150000}'
```

Kỳ vọng: tạo payment CASH trạng thái chờ, confirm cash thành công và chuyển `PAID`.

Đối với payment online, không xác nhận thủ công. Dùng endpoint verify:

```powershell
Invoke-RestMethod -Uri "$BaseUrl/api/v1/payments/$paymentId/verify" -Method POST -ContentType "application/json" -Body '{}'
```

### 4.8 Report Service (`/api/reports`)

```powershell
$today = Get-Date -Format "yyyy-MM-dd"
Invoke-RestMethod -Uri "$BaseUrl/api/reports/health" -Headers $Auth
Invoke-RestMethod -Uri "$BaseUrl/api/reports/dashboard?dateFrom=$today&dateTo=$today&groupBy=day" -Headers $Auth
Invoke-RestMethod -Uri "$BaseUrl/api/reports/revenue?dateFrom=$today&dateTo=$today&groupBy=day" -Headers $Auth
```

Kỳ vọng: endpoint report trả dữ liệu tổng hợp, không lỗi `5xx`.

## 5. Dọn dữ liệu test nhanh (tùy chọn)

```powershell
docker compose down
```

Nếu muốn reset sạch toàn bộ volume database:

```powershell
docker compose down -v
```
