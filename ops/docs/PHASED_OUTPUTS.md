# Phased Output Standards (MVP / Advanced)

Ngày cập nhật: `2026-04-14`

## 1) MVP (cốt lõi)

### 1.1 Backend

- API Gateway:
  - proxy `/api/*` theo prefix service.
  - kiểm tra JWT/RBAC cho endpoint staff/manager/admin.
- User Service (Spring Boot):
  - login/register/profile/customer flows.
- Table Service (Spring Boot):
  - CRUD bàn, QR base64, gọi phục vụ.
- Order Service (NestJS):
  - menu công khai, tạo đơn, cập nhật trạng thái đơn/KDS.
- Chat Service (NestJS + Socket.IO):
  - REST chat session/messages + WebSocket namespace `/chat`.
- PostgreSQL + Redis chạy trong compose.

### 1.2 Frontend

- Khách:
  - vào menu theo `tableId`, đặt món, theo dõi đơn, chat, thanh toán.
- Nhân viên:
  - dashboard, bàn, orders/POS, kitchen (KDS), chat staff.

### 1.3 Tích hợp luồng

- QR -> mở đúng menu theo bàn.
- Luồng order:
  - tạo đơn -> KDS cập nhật -> trạng thái đồng bộ về UI.
- Luồng chat:
  - khách gửi -> staff nhận -> phản hồi realtime.

## 2) Advanced (nâng cao)

### 2.1 Backend

- Inventory:
  - CRUD nguyên liệu, nhập/xuất/điều chỉnh, lịch sử biến động.
  - consumer Kafka (`ItemCompleted`) khả dụng khi có `KAFKA_BROKERS`.
- Payment:
  - cash confirmation + online flow (`/v1/payments`).
- Reports:
  - dashboard, revenue, top-items, inventory, staff-performance, export.
- Promotions/admin menu:
  - quản trị menu/promotion qua `/api/orders/admin/*`.
- Staff/branch management:
  - `/api/users/staff*`, `/api/users/admin/branches*`.
- Customer advanced (C-16..C-18):
  - OTP/email register-login: `/api/users/customer/*`.
  - Lịch sử đơn: `GET /api/orders/history`.
  - Loyalty points: `1 điểm = 10.000đ`, accrual qua `/api/users/customer/points/accrual`.

### 2.2 Frontend

- Menu management, promotions, inventory, reports, staff, branches.
- Thanh toán online + trang `payment/return`.
- Hỗ trợ realtime staff notifications.
- Khách hàng nâng cao: login OTP/email, xem lịch sử đơn, hiển thị điểm/tier hiện tại.

### 2.3 Vận hành

- Single `docker-compose.yml`.
- Optional profiles: `monitoring`, `logging`.
- Bộ manifest Kubernetes trong `ops/k8s/`.

## 3) Script kiểm tra theo phase

- MVP: `node ops/scripts/check-mvp-phase.mjs`
- Advanced: `node ops/scripts/check-advanced-phase.mjs`
- Acceptance: `node ops/scripts/check-acceptance-criteria.mjs`
- Integration smoke: `./ops/scripts/integration-test.sh`
- Perf: `node ops/scripts/perf-100-users.mjs`

## 4) Tham chiếu chuẩn

- Runtime/API chuẩn: `README.md`
- Production deploy: `README_DEPLOY.md`
