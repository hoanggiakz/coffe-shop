# Phased Output Standards (MVP & Advanced)

Ngày cập nhật: `2026-04-10`

## 1) Giai đoạn MVP (cốt lõi, có thể vận hành)

### 1.1 Backend
- API Gateway:
  - Định tuyến `/api/*` về đúng service.
  - Có kiểm tra JWT và RBAC cho endpoint staff/manager/admin.
  - CORS được bật.
- User Service:
  - Đăng ký/đăng nhập/lấy profile hoạt động.
  - Có phân quyền cơ bản theo role.
- Table Service:
  - CRUD bàn.
  - Sinh QR code base64 cho từng bàn.
  - Cập nhật trạng thái bàn.
- Order Service:
  - Tạo đơn.
  - Lấy đơn theo bàn.
  - Cập nhật trạng thái đơn và trạng thái từng món (KDS).
- Chat Service:
  - Tạo phiên chat.
  - Lưu/lấy tin nhắn.
  - Gửi/nhận realtime qua WebSocket.
- Database:
  - PostgreSQL single instance, multi database (`userdb`, `tabledb`, `orderdb`, `chatdb`, ...).
- Runtime:
  - Chạy full bằng `docker compose up -d --build`.

### 1.2 Frontend (Web App)
- Khách hàng:
  - Xem menu từ API.
  - Giỏ hàng và đặt món.
  - Theo dõi trạng thái đơn.
  - Chatbox gửi/nhận tin nhắn realtime.
- Nhân viên:
  - Đăng nhập.
  - Dashboard.
  - Quản lý bàn dạng grid.
  - KDS cập nhật trạng thái món.
  - Giao diện trả lời chat.

### 1.3 Tích hợp
- QR quét vào đúng URL menu có `tableId`.
- Luồng đơn hàng end-to-end:
  - Khách tạo đơn -> bếp thấy -> bếp cập nhật -> phục vụ.
- Luồng chat end-to-end:
  - Khách nhắn -> nhân viên nhận/trả lời -> khách nhận.

## 2) Giai đoạn nâng cao (sau MVP)

### 2.1 Backend
- Inventory Service:
  - CRUD nguyên liệu, nhập/xuất/điều chỉnh.
  - Tự động trừ kho khi món hoàn thành.
  - Cảnh báo tồn kho thấp.
- Payment Service:
  - Tạo payment online/offline, webhook/return, xác nhận tiền mặt.
  - Provider online: VietQR.
- Report Service:
  - Dashboard tổng hợp, doanh thu, top món, tồn kho, hiệu suất.
  - Export Excel/PDF.
- Khuyến mãi:
  - CRUD mã giảm giá, validate mã, áp dụng theo đơn/món.
- Nhân sự:
  - CRUD nhân sự, phân ca, chấm công, payroll/overview.
- Event:
  - Có module Kafka producer/consumer cho sự kiện chính.

### 2.2 Frontend
- Trang kho, báo cáo, quản lý nhân viên.
- Thanh toán online.
- Hỗ trợ song ngữ.
- PWA (nếu bật trong phase này).

### 2.3 Vận hành
- Đa chi nhánh (branch scope + tổng hợp).
- Kubernetes manifests (Deployment/Service/Ingress/ConfigMap/Secret).
- Monitoring/logging tập trung.
- CI/CD tự động build/test/deploy.

## 3) Cách nghiệm thu nhanh theo phase

- MVP check script: `node ops/scripts/check-mvp-phase.mjs`
- Advanced check script: `node ops/scripts/check-advanced-phase.mjs`
- Acceptance criteria check script: `node ops/scripts/check-acceptance-criteria.mjs`
- Integration smoke: `./ops/scripts/integration-test.sh`
- Perf 100 concurrent: `node ops/scripts/perf-100-users.mjs`

## 4) Ghi chú hiện trạng repo

- Bộ tính năng MVP đã có đầy đủ ở nhánh frontend chính (`frontend`, Vite).
- `frontend` (Vite) là frontend chính đang dùng trong stack mặc định.
- PWA manifest baseline, monitoring config (Prometheus/Grafana), và logging stack baseline (ELK) đã được bổ sung trong gói bàn giao.


