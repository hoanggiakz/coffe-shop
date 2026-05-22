# Hệ Thống Quản Lý Quán Cà Phê (Microservices)

Hệ thống phục vụ 3 nhóm người dùng:

- Khách hàng: quét QR bàn, xem menu, đặt món, theo dõi đơn, chat hỗ trợ, thanh toán.
- Nhân viên: nhận đơn, xử lý KDS, quản lý bàn, xác nhận thanh toán tiền mặt, hỗ trợ chat.
- Quản lý/Admin: quản lý nhân sự, menu, kho, khuyến mãi, chi nhánh, báo cáo.

Trang thai du lieu dev hien tai:
- He thong dang duoc don de van hanh 1 chi nhanh duy nhat: `Chi nhanh Riverside`.

## 1. Kiến trúc hiện tại

| Service | Công nghệ runtime | Vai trò |
|---|---|---|
| `frontend` | React + Vite + Nginx | UI + reverse proxy |
| `api-gateway` | NestJS | Proxy tập trung, kiểm soát quyền theo role |
| `user-service` | Spring Boot | Auth/JWT, customer, staff, branches |
| `table-service` | Spring Boot | Quản lý bàn, QR, gọi phục vụ |
| `order-service` | NestJS + Prisma | Menu, đơn hàng, KDS, promotions |
| `chat-service` | NestJS + Socket.IO | Chat realtime theo bàn + staff notifications |
| `inventory-service` | NestJS + Prisma | Kho, nhập/xuất/kiểm kê, đồng bộ menu |
| `payment-service` | NestJS + Prisma | Thanh toán CASH/SePay |
| `report-service` | NestJS + Prisma | Báo cáo doanh thu/kho/nhân sự/dashboard |
| `postgres` | PostgreSQL | Dữ liệu chính |
| `redis` | Redis | Cache/realtime |

## 2. Cấu trúc thư mục

```text
Microservices/
├── apps/
│   ├── backend/
│   │   ├── api-gateway/
│   │   ├── user-service/
│   │   ├── table-service/
│   │   ├── order-service/
│   │   ├── chat-service/
│   │   ├── inventory-service/
│   │   ├── payment-service/
│   │   └── report-service/
│   └── frontend/
├── ops/
│   ├── docs/
│   ├── scripts/
│   └── k8s/
├── docker-compose.yml
├── .env.example
├── deploy.sh
├── seed-database.sh
└── README_DEPLOY.md
```

## 3. Chạy hệ thống

### 3.1 Local demo (khuyen nghi)

```powershell
Copy-Item .env.local-demo.example .env -Force
.\ops\scripts\setup-local-demo.ps1
```

Truy cap:

- FE: `http://localhost`
- API qua gateway: `http://localhost:8080/api/...`
- WebSocket chat: `ws://localhost:3007/chat`

### 3.2 Chạy nhanh mặc định

```powershell
docker compose up -d --build
docker compose ps
```

Truy cap:

- FE: `http://localhost`
- API qua gateway: `http://localhost:8080/api/...`
- WebSocket chat: `ws://localhost:3007/chat`

### 3.3 Chạy dev (phuc vu phat trien frontend nhanh)

```bash
./deploy.sh dev
./seed-database.sh
```

Truy cập:

- FE dev port: `http://localhost:3000`
- API Gateway: `http://localhost:8080`
- Chat WS trực tiếp: `ws://localhost:3007/chat`

### 3.4 Bat stack tuy chon cung 1 compose file

```bash
docker compose --profile monitoring up -d
docker compose --profile logging up -d
```

### 3.5 Chuan bi moi truong test toan bo service

```powershell
.\ops\scripts\prepare-test-env.ps1
.\ops\scripts\run-full-api-test.ps1
```

Chi tiết test tay từng service: `ops/docs/test-services-guide.md`.

## 4. Routing API qua gateway (đúng theo code hiện tại)

Gateway nhận tất cả request `api/*` và proxy theo prefix:

- `/api/users` -> `user-service`
- `/api/tables` -> `table-service`
- `/api/orders` -> `order-service`
- `/api/chats` -> `chat-service`
- `/api/v1/ingredients` -> `inventory-service`
- `/api/v1/payments` -> `payment-service`
- `/api/reports` -> `report-service`

Một số quy tắc quyền chính ở gateway:

- Public: `POST /api/users/login`, nhóm `/api/users/customer/*`.
- Public cho luồng khách: `GET /api/orders/menu`, `POST /api/orders`, `GET /api/orders/history`, `GET /api/tables`, `GET /api/tables/{id}/qr`.
  - Với `GET /api/orders/menu` ở luồng QR khách: gateway bắt buộc kiểm tra `tableId` với `table-service` trước khi proxy sang `order-service`.
- Chỉ `ADMIN`/`MANAGER`: quản trị staff/branch, menu admin, promotions admin, reports.
- Staff role (`ADMIN|MANAGER|WAITER|BARISTA|STAFF`): profile, attendance, chat staff.
- KDS item status (`PATCH /api/orders/:id/items/:itemId/status`): `ADMIN|MANAGER|BARISTA`.
- Xác nhận cash (`POST /api/v1/payments/:paymentId/confirm-cash`): staff role phù hợp.

## 5. API luồng chính (đang dùng bởi frontend)

Base URL khi qua Nginx: `https://localhost/api`

### 5.1 Auth / user

- `POST /users/login`
- `POST /users/register`
- `GET /users/profile`
- `POST /users/customer/request-otp`
- `POST /users/customer/register-email`
- `POST /users/customer/register-otp`
- `POST /users/customer/login-email`
- `POST /users/customer/login-otp`
- `GET /users/customer/profile`
- `GET /users/customer/offers`
- `POST /users/customer/points/accrual`
- `GET /users/staff`
- `POST /users/staff`
- `PATCH /users/staff/{id}`
- `DELETE /users/staff/{id}`
- `GET /users/staff/schedules`
- `POST /users/staff/schedules`
- `DELETE /users/staff/schedules/{id}`
- `POST /users/staff/attendance/check-in`
- `POST /users/staff/attendance/check-out`
- `GET /users/staff/attendance`
- `GET /users/staff/shift-overview`
- `GET /users/staff/payroll`
- `GET /users/admin/branches`
- `GET /users/admin/branches/{id}`
- `POST /users/admin/branches`
- `PATCH /users/admin/branches/{id}`
- `DELETE /users/admin/branches/{id}`

### 5.2 Tables + QR + gọi phục vụ

- `GET /tables`
- `GET /tables/{id}`
- `POST /tables`
- `PATCH /tables/{id}`
- `DELETE /tables/{id}`
- `PATCH /tables/{id}/status`
- `GET /tables/{id}/qr`
- `POST /tables/qr/batch`
- `POST /tables/{id}/call-staff`

### 5.3 Orders / menu / KDS / promotions

- `GET /orders/menu`
- `POST /orders`
- `GET /orders`
- `GET /orders/history`
- `GET /orders/promotions/validate`
- `GET /orders/{id}`
- `PATCH /orders/{id}/status`
- `PATCH /orders/{id}/items`
- `PATCH /orders/{id}/customer-items`
- `PATCH /orders/{id}/items/{itemId}/status`
  - KDS item status chấp nhận cả `PREPARING` và `READY` (tương thích ngược vẫn nhận `DONE`).
- `POST /orders/table-actions/transfer`
- `GET|POST|PATCH|DELETE /orders/admin/menu/categories*`
- `GET|POST|PATCH|DELETE /orders/admin/menu/options/groups*`
- `POST /orders/admin/menu/options/groups/{groupId}/values`
- `PATCH|DELETE /orders/admin/menu/options/values/{id}`
- `GET|POST|PATCH|DELETE /orders/admin/menu/items*`
- `GET|POST|PATCH /orders/admin/promotions*`
- `POST /orders/admin/promotions/{id}/disable`

### 5.4 Chat

- REST staff:
  - `GET /chats`
  - `POST /chats`
  - `POST /chats/staff-notifications`
  - `POST /chats/{id}/messages`
  - `GET /chats/{id}/messages`
  - `PATCH /chats/{id}/close`
- WebSocket namespace:
  - `/chat` với các event `join`, `join-staff`, `send-message`.

### 5.5 Inventory / Payment / Reports

- Inventory (`/v1/ingredients`):
  - `GET /v1/ingredients`
  - `POST /v1/ingredients`
  - `PATCH /v1/ingredients/{id}`
  - `DELETE /v1/ingredients/{id}`
  - `POST /v1/ingredients/stock/import`
  - `POST /v1/ingredients/stock/receipts`
  - `POST /v1/ingredients/stock/adjust`
  - `POST /v1/ingredients/stock/export-bulk`
  - `GET /v1/ingredients/stock/movements`
  - `POST /v1/ingredients/sync-menu`
- Payment (`/v1/payments`):
  - `POST /v1/payments`
  - Provider hỗ trợ: `CASH`, `SEPAY`
  - `GET /v1/payments/orders/{orderId}`
  - `GET /v1/payments/online/qr`
  - `GET /v1/payments/{paymentId}`
  - `POST /v1/payments/{paymentId}/verify` (đối soát giao dịch thật trước khi chốt `PAID`)
  - `POST /v1/payments/webhook`
  - `POST /v1/payments/webhook/relay` (endpoint IPN co dinh cho SePay)
  - `GET /v1/payments/webhook/relay/events` (local pull event relay)
  - `POST /v1/payments/return`
  - `POST /v1/payments/{paymentId}/confirm-cash`
- Reports (`/reports`):
  - `GET /reports/dashboard`
  - `GET /reports/daily-stats`
  - `GET /reports/revenue`
  - `GET /reports/top-items`
  - `GET /reports/inventory`
  - `GET /reports/staff-performance`
  - `GET /reports/export`

### 5.6 Khách hàng (nâng cao: C-16..C-19)

| ID | Tên chức năng | API chính (qua `/api`) | Ghi chú bám code hiện tại |
|---|---|---|---|
| `C-16` | Đăng ký / Đăng nhập | `POST /users/customer/request-otp`, `POST /users/customer/register-otp`, `POST /users/customer/login-otp`, `POST /users/customer/register-email`, `POST /users/customer/login-email` | Hỗ trợ cả OTP số điện thoại và email. |
| `C-17` | Lịch sử đơn hàng | `GET /orders/history?customerId=...` (hoặc `email`/`phone`) | `limit` mặc định `20`, tối đa `50`. Trả về đơn theo thứ tự mới -> cũ. |
| `C-18` | Tích điểm | `GET /users/customer/profile`, `GET /users/customer/offers`, `POST /users/customer/points/accrual` | Rule hiện tại: `1 điểm = 10.000đ` (`floor(amount/10000)`). Khi đơn chuyển `COMPLETED` và có `customerId`, `order-service` gọi accrual tự động. |
| `C-19` | Gợi ý món cá nhân hóa | `GET /orders/recommendations?customerId=...` (hoặc `email`/`phone`) | Xếp hạng món theo lịch sử mua `COMPLETED` (ưu tiên gần đây), tự fallback top món phổ biến theo chi nhánh nếu chưa đủ dữ liệu lịch sử. |

### 5.7 Quản lý / Admin (M-01..M-27)

| Nhóm | Trạng thái | Bám theo code hiện tại |
|---|---|---|
| `M-01..M-03` Nhân sự / phân ca / chấm công | ✅ | `user-service` + màn `StaffManagement` |
| `M-04..M-06` Danh mục / món / tùy chọn | ✅ | `order-service` admin menu + màn `Menu` |
| `M-07..M-11` Kho / nhập hàng / kiểm kê / cảnh báo / lịch sử | ✅ | `inventory-service` + màn `Inventory` |
| `M-12..M-13` Công thức + tự động trừ kho khi món `READY` | ✅ | `order-service` phát `ItemCompleted`, `inventory-service` consume để trừ kho (fallback gọi API trực tiếp khi Kafka unavailable) |
| `M-14..M-16` Bàn + QR + in QR | ✅ | `table-service` + màn `Tables` (`/tables/{id}/qr`, `/tables/qr/batch`) |
| `M-17` Xóa / vô hiệu hóa bàn | ✅ | API đang dùng trạng thái `MAINTENANCE` (tương đương `UNAVAILABLE`) hoặc xóa cứng khi không có đơn active |
| `M-18..M-19` Khuyến mãi | ✅ | `order-service` promotions admin + màn `Promotions` |
| `M-20..M-24` Báo cáo / top món / tồn kho / hiệu suất / dashboard | ✅ | `report-service` + màn `Reports` |
| `M-25` Thêm chi nhánh | ✅ | `POST /users/admin/branches` + màn `Branches` |
| `M-26` Chuyển đổi chi nhánh | ✅ | Bộ lọc chi nhánh chung ở header (`ADMIN/MANAGER`), áp dụng cho `Dashboard`, `Menu`, `Tables`, `Orders`, `Inventory`, `Reports` |
| `M-27` Cấu hình hệ thống (Admin) | ✅ (UI mức cơ bản) | Màn `Settings` có khối cấu hình SePay/webhook (`APP_BASE_URL`, `SEPAY_ENV`, `SEPAY_QUERY_URL`, `SEPAY_MERCHANT_ID`, `SEPAY_IPN_AUTH_TYPE`) và URL `POST /api/payment/webhook/sepay`. Lưu cấu hình ở localStorage; cấu hình runtime thực tế vẫn qua `.env`/deploy. |

### 5.8 Tích hợp ngoài (I-01..I-04)

| ID | Trạng thái | Ghi chú triển khai hiện tại |
|---|---|---|
| `I-01` SePay | ✅ | `payment-service` nhận provider `SEPAY`, hỗ trợ tạo giao dịch online, `return`/`webhook` và endpoint verify giao dịch thật trước khi set `PAID`. |
| `I-02` MoMo | ❌ (đã loại bỏ) | Hình thức thanh toán MoMo không còn được hỗ trợ trong codebase hiện tại. |
| `I-03` Webhook SePay | ✅ | Ho tro endpoint tuong thich `POST /payment/webhook/sepay` (qua gateway: `/api/payment/webhook/sepay`) va relay co dinh `POST /v1/payments/webhook/relay`; local pull qua `GET /v1/payments/webhook/relay/events`. |
| `I-04` Email thông báo (tùy chọn) | ✅ (mức kho) | `inventory-service` gửi email cảnh báo tồn kho thấp qua SMTP (`LOW_STOCK_ALERT_EMAILS`). |

### 5.9 Luồng Đặt Món Qua QR (Chuẩn Sequence)

```mermaid
sequenceDiagram
    participant Khách
    participant Web (FE)
    participant API Gateway
    participant Table Service
    participant Order Service
    participant Kafka
    participant KDS (Bếp)

    Khách->>Web (FE): Quét QR (URL có tableId)
    Web (FE)->>API Gateway: GET /api/orders/menu?tableId=xxx
    API Gateway->>Table Service: Xác thực bàn theo tableId
    Table Service-->>API Gateway: OK (bàn hợp lệ)
    API Gateway->>Order Service: Lấy menu theo tableId/branch
    Order Service-->>API Gateway: Menu items
    API Gateway-->>Web (FE): Trả menu
    Khách->>Web (FE): Chọn món, gửi đơn
    Web (FE)->>API Gateway: POST /api/orders {tableId, items}
    API Gateway->>Order Service: Tạo order
    Order Service->>Order Service: Lưu order, trạng thái PENDING
    Order Service->>Kafka: Gửi event OrderCreated
    Kafka-->>KDS (Bếp): OrderCreated
    KDS (Bếp)-->>Bếp: Hiển thị đơn mới
    Order Service-->>API Gateway: {orderId, status}
    API Gateway-->>Web (FE): Thành công
    Web (FE)-->>Khách: Hiển thị order info
```

Ghi chú runtime: nếu `KAFKA_BROKERS` chưa cấu hình, hệ thống fallback sang thông báo realtime trực tiếp từ `order-service` qua `chat-service` để không gián đoạn luồng đang chạy.

### 5.10 Luồng Tạo Bàn Và Sinh QR

```mermaid
sequenceDiagram
    participant Manager
    participant Staff Web (FE)
    participant API Gateway
    participant Table Service
    participant QRCode Lib
    participant DB

    Manager->>Staff Web (FE): Nhập số bàn, khu vực, sức chứa
    Staff Web (FE)->>API Gateway: POST /api/tables
    API Gateway->>Table Service: Create table
    Table Service->>DB: Insert table (sinh tableId UUID)
    Table Service->>QRCode Lib: Generate QR cho URL /menu?tableId=...
    QRCode Lib-->>Table Service: Ảnh base64
    Table Service->>DB: Update qrCode (base64)
    Table Service-->>API Gateway: Trả table + qrCode
    API Gateway-->>Staff Web (FE): Thành công
    Staff Web (FE)-->>Manager: Xem / tải / in QR
```

Ghi chú bám code:
- `tableId` được sinh từ DB (`UUID`) trong `table-service`.
- QR tạo bằng ZXing và lưu trường `qrCode` dạng `data:image/png;base64,...`.
- FE hỗ trợ `GET /api/tables/{id}/qr`, `POST /api/tables/qr/batch` để tải/in dán.

### 5.11 Luồng Chat Hỗ Trợ

```mermaid
sequenceDiagram
    participant Khách
    participant Customer Web (FE)
    participant Chat Service (WS)
    participant DB
    participant Staff Web (FE)

    Khách->>Customer Web (FE): Mở chat hỗ trợ
    Customer Web (FE)->>Chat Service (WS): emit join {tableId,...}
    Chat Service (WS)->>DB: getOrCreate chat OPEN theo tableId
    Chat Service (WS)-->>Customer Web (FE): joined {chatId, messages}
    Customer Web (FE)->>Chat Service (WS): emit send-message
    Chat Service (WS)->>DB: Lưu message
    Chat Service (WS)-->>Customer Web (FE): new-message (room {tableId})
    Chat Service (WS)-->>Staff Web (FE): new-message (room {tableId})
    Staff Web (FE)->>Chat Service (WS): emit send-message
    Chat Service (WS)->>DB: Lưu message
    Chat Service (WS)-->>Khách: new-message
```

Ghi chú bám code:
- Room chuẩn đang dùng là `{tableId}`.
- Service vẫn join thêm room legacy `table:{tableId}` để tương thích ngược.

## 6. Tài khoản mặc định test

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin.test@coffeeshop.local` | `Admin@123` |
| Manager | `manager.central@coffeeshop.local` | `Manager@123` |
| Manager | `manager.riverside@coffeeshop.local` | `Manager@123` |
| Waiter | `waiter.test@coffeeshop.local` | `Waiter@123` |
| Barista | `barista.test@coffeeshop.local` | `Barista@123` |
| Staff | `staff.test@coffeeshop.local` | `Staff@123` |
| Customer | `customer.test@coffeeshop.local` | `Customer@123` |

## 7. Các URL UI quan trọng

- Login: `https://localhost/login`
- Dashboard: `https://localhost/`
- Tables: `https://localhost/tables`
- Orders: `https://localhost/orders`
- Menu management: `https://localhost/menu-management`
- Inventory: `https://localhost/inventory`
- Promotions: `https://localhost/promotions`
- Reports: `https://localhost/reports`
- Kitchen: `https://localhost/kitchen`
- Staff chat: `https://localhost/chat`
- Staff management: `https://localhost/staff`
- Branches: `https://localhost/branches`
- Customer menu: `https://localhost/menu?tableId=<TABLE_ID>`

## 8. Tài liệu liên quan (đã giảm trùng lặp)

- Triển khai production chi tiết: [README_DEPLOY.md](README_DEPLOY.md)
- Deployment tóm tắt (dev/prod + k8s): [ops/docs/deployment-guide.md](ops/docs/deployment-guide.md)
- Nghiệm thu: [ops/docs/ACCEPTANCE_GUIDE.md](ops/docs/ACCEPTANCE_GUIDE.md)
- Hướng dẫn test từng service: [ops/docs/test-services-guide.md](ops/docs/test-services-guide.md)
- Kiến trúc: [ops/docs/architecture.md](ops/docs/architecture.md)
- Checklist bàn giao: [ops/docs/DELIVERABLES.md](ops/docs/DELIVERABLES.md)
- Postman collection: [ops/docs/api/coffee-shop.postman_collection.json](ops/docs/api/coffee-shop.postman_collection.json)
- Reports index: [reports/README.md](reports/README.md)
- NFR readiness (4.1-4.6): [reports/nfr/non-functional-readiness.md](reports/nfr/non-functional-readiness.md)

## 9. Lỗi thường gặp

### `docker compose ps` không kết nối daemon

- Docker Desktop chưa chạy.
- Mở Docker Desktop và chờ `Engine running`.

### Lỗi cert khi mở `https://localhost`

- Chứng chỉ local là self-signed.
- Chấp nhận cảnh báo ở lần truy cập đầu.

### Quét QR trên điện thoại bị lỗi

- Điện thoại và máy host phải cùng mạng LAN.
- QR cần được tạo lại nếu đổi domain/IP.

## 10. Demo Trên Ubuntu VM + Cloudflare Tunnel

Mục này thay cho `README-server.md` cũ, dùng khi demo public từ máy ảo Ubuntu.

### 10.1 Clone và chạy đúng thư mục

```bash
cd ~
git clone -b develop git@github.com:hoanggiakz/coffe-shop.git
cd coffe-shop/Microservices
cp .env.example .env
```

### 10.2 Cấu hình `.env` cho URL public

Thay `<YOUR-TUNNEL-DOMAIN>` bằng URL tunnel thật:

```env
APP_BASE_URL=https://<YOUR-TUNNEL-DOMAIN>
ALLOWED_ORIGINS=https://<YOUR-TUNNEL-DOMAIN>,https://localhost
VITE_WS_URL=https://<YOUR-TUNNEL-DOMAIN>
NEXT_PUBLIC_API_URL=https://<YOUR-TUNNEL-DOMAIN>
NEXT_PUBLIC_WS_URL=https://<YOUR-TUNNEL-DOMAIN>
ONLINE_PAYMENT_QR_URL=https://<YOUR-TUNNEL-DOMAIN>/sepay-qr.png
```

Luu y:
- Khong commit `.env` len git.
- `.env.example` chi de placeholder (`your-public-domain`), khong de URL tunnel that.
- Truoc khi run production, thay toan bo bien `CHANGE_ME_*` trong `.env`.

### 10.3 Build và chạy stack

```bash
docker compose config -q
docker compose up -d --build
docker compose ps
```

### 10.4 Chạy Cloudflare Quick Tunnel

```bash
cloudflared tunnel --url http://localhost
```

Giữ terminal tunnel luôn mở trong lúc demo.

### 10.5 Khi URL tunnel đổi

1. Sửa lại các biến URL trong `.env` như mục 10.2  
2. Rebuild service liên quan:

```bash
docker compose up -d --build frontend api-gateway table-service payment-service
```

3. Regenerate QR bàn:

```bash
curl -k -X POST https://localhost/api/tables/qr/batch -H "Content-Type: application/json" -d "{}"
```

### 10.6 Kiểm tra luồng QR order

Lấy `tableId` thật:

```bash
curl -k https://localhost/api/tables
```

Test menu:

```bash
curl -k "https://localhost/api/orders/menu?tableId=<TABLE_ID>"
curl "https://<YOUR-TUNNEL-DOMAIN>/api/orders/menu?tableId=<TABLE_ID>"
```

Kỳ vọng: cả 2 trả `200` và có danh sách món.

### 10.7 SePay relay endpoint (nếu dùng)

- IPN public cố định: `POST /api/v1/payments/webhook/relay`
- Pull event: `GET /api/v1/payments/webhook/relay/events`

Chi tiết xem thêm: [docs/sepay-webhook-relay.md](docs/sepay-webhook-relay.md)
