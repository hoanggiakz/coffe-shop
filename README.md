# Hệ thống Quản lý Quán Cà phê (Microservices)

Hệ thống phục vụ 3 nhóm người dùng:

- Khách hàng: quét QR, xem menu, đặt món, theo dõi đơn, gọi phục vụ, chat, thanh toán.
- Nhân viên: nhận và xử lý đơn, quản lý bàn, KDS, chat với khách, xác nhận thu tiền.
- Quản lý/Admin: quản lý nhân sự, menu, kho, khuyến mãi, chi nhánh, báo cáo.

## 1. Tổng quan kiến trúc

| Service | Công nghệ | Vai trò |
|---|---|---|
| `frontend` | React + Vite + Nginx | Giao diện người dùng |
| `api-gateway` | NestJS | Cổng API tập trung, phân quyền request |
| `user-service` | Spring Boot | Auth/JWT, khách hàng, nhân sự, chi nhánh |
| `table-service` | Spring Boot | Bàn, QR bàn, gọi phục vụ |
| `order-service` | NestJS + Prisma | Menu, đơn hàng, KDS, khuyến mãi |
| `chat-service` | NestJS + Socket.IO | Chat realtime khách - nhân viên |
| `inventory-service` | NestJS + Prisma | Kho nguyên liệu, nhập/xuất, cảnh báo |
| `payment-service` | NestJS + Prisma | Cash, VNPay, MoMo, ZaloPay, VietQR |
| `report-service` | NestJS + Prisma | Dashboard và báo cáo |
| `postgres` | PostgreSQL | CSDL |
| `redis` | Redis | Realtime/cache |

## Cấu trúc thư mục

```text
Microservices/
├── apps/backend/
│   ├── api-gateway/
│   ├── user-service/
│   ├── table-service/
│   ├── order-service/
│   ├── chat-service/
│   ├── inventory-service/
│   ├── payment-service/
│   └── report-service/
├── apps/frontend/
├── ops/docs/
├── ops/scripts/
├── ops/k8s/
├── docker-compose*.yml
└── README.md
```

## 2. Truy cập hệ thống

- FE chính: `https://localhost`
- HTTP: `http://localhost` (redirect sang HTTPS)
- API qua gateway: `https://localhost/api/...`
- WebSocket: dùng cùng domain frontend

Lưu ý:

- Chứng chỉ local là self-signed nên trình duyệt có thể cảnh báo ở lần mở đầu.
- Nếu test bằng điện thoại, điện thoại và máy chủ phải cùng mạng LAN.

## 3. Chạy hệ thống

Xem tài liệu chi tiết:

- Chạy local/dev: [HUONG_DAN_CHAY_BE_FE.md](HUONG_DAN_CHAY_BE_FE.md)
- Deploy production: [README_DEPLOY.md](README_DEPLOY.md)
- Nghiệm thu Section 4 (4.1, 4.2, 4.3): [ops/docs/ACCEPTANCE_GUIDE.md](ops/docs/ACCEPTANCE_GUIDE.md)

Khởi động nhanh:

```powershell
docker compose up -d --build
docker compose ps
```

## 4. Tài khoản mặc định để test

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin.test@coffeeshop.local` | `Admin@123` |
| Quản lý | `manager.central@coffeeshop.local` | `Manager@123` |
| Quản lý | `manager.riverside@coffeeshop.local` | `Manager@123` |
| Phục vụ | `waiter.test@coffeeshop.local` | `Waiter@123` |
| Pha chế | `barista.test@coffeeshop.local` | `Barista@123` |
| Nhân viên | `staff.test@coffeeshop.local` | `Staff@123` |
| Khách hàng | `customer.test@coffeeshop.local` | `Customer@123` |

Phân quyền chính:

- Chỉ `ADMIN`/`MANAGER` được tạo tài khoản nhân viên.
- Nhân viên thường chỉ có quyền xem hoặc thao tác nghiệp vụ theo role, không có quyền quản trị nhân sự toàn phần.

## 5. Hướng dẫn sử dụng chi tiết theo vai trò

## 5.1 Khách hàng (Customer)

### Bước 1: vào menu bằng QR

1. Quét mã QR dán tại bàn.
2. Hệ thống mở trang `/menu?tableId=...&tableNumber=...&branchId=...`.
3. Nếu QR hợp lệ, header sẽ hiển thị đúng số bàn.

### Bước 2: chọn món và tùy chỉnh

1. Tìm món theo danh mục/từ khóa.
2. Chọn size/topping/ghi chú nếu món hỗ trợ.
3. Thêm món vào giỏ.

### Bước 3: đặt đơn

1. Chọn hình thức:
   - `Trả sau` (post-pay): gửi đơn trước, thanh toán sau.
   - `Trả trước` (prepay): tạo đơn và chuyển sang cổng thanh toán.
2. (Tuỳ chọn) nhập mã khuyến mãi.
3. Bấm đặt món.

### Bước 4: theo dõi đơn và thanh toán

1. Xem trạng thái đơn theo thời gian thực.
2. Nếu prepay:
   - `VNPay`, `MoMo`, `ZaloPay`: mở link cổng thanh toán.
   - `VietQR`: quét mã chuyển khoản hiển thị trên màn hình.
3. Có thể bấm “Thanh toán tiền mặt” để gửi yêu cầu đến nhân viên.

### Bước 5: gọi phục vụ và chat

1. Bấm `Gọi phục vụ`, chọn lý do.
2. Mở `Chat hỗ trợ` để nhắn tin trực tiếp với nhân viên.

## 5.2 Nhân viên (Staff)

### Đăng nhập

1. Vào `https://localhost/login`.
2. Đăng nhập bằng tài khoản role tương ứng.

### Dashboard

- Xem số bàn đang dùng, đơn chờ xử lý, doanh thu tạm tính.
- Nhận thông báo realtime khi có đơn mới/gọi phục vụ/chat.

### Quản lý bàn (S-05/S-06/S-07)

1. Vào trang `Bàn`.
2. Theo dõi trạng thái bàn theo màu.
3. Thực hiện:
   - tạo đơn hộ khách,
   - chuyển bàn,
   - ghép bàn.

### Quản lý đơn (S-08/S-09/S-10/S-11)

1. Vào `Đơn hàng/POS`.
2. Lọc theo trạng thái, bàn, thời gian.
3. Xác nhận đơn hoặc cập nhật món (theo quyền).
4. Xác nhận thanh toán tiền mặt khi khách trả tại quầy.

### KDS cho bếp (S-12/S-13/S-14/S-15)

1. Vào `Bếp/KDS`.
2. Xử lý theo luồng:
   - bắt đầu làm,
   - hoàn thành món,
   - hoàn thành đơn.
3. Màn hình tự cập nhật realtime.

### Chat với khách (S-16/S-17/S-18)

1. Vào `Chat`.
2. Chọn phiên chat theo bàn.
3. Trả lời và đóng chat khi kết thúc.

### Chấm công và ca làm

- Nhân viên có thể vào ca/ra ca bằng mã nhân viên hoặc QR cá nhân.
- Xem lịch sử chấm công của chính mình.

## 5.3 Quản lý / Admin

### Nhân sự (M-01/M-02/M-03)

1. Vào `Quản lý nhân sự`.
2. Tạo/sửa/xóa tài khoản nhân viên (theo quyền).
3. Phân ca, xem ca làm, theo dõi chấm công.
4. In thẻ nhân viên có mã QR cá nhân.

### Menu (M-04/M-05/M-06)

1. Tạo danh mục món.
2. Tạo món: tên, mô tả, giá, ảnh.
3. Cấu hình size/topping và công thức nguyên liệu cho món.

### Kho (M-07 đến M-13)

1. Tạo nguyên liệu và định mức tồn tối thiểu.
2. Lập phiếu nhập kho.
3. Kiểm kê/điều chỉnh tồn.
4. Khi món hoàn thành ở KDS, hệ thống tự trừ kho theo công thức.

### Bàn và QR (M-14/M-15/M-16)

1. Tạo bàn mới.
2. Sinh QR cho từng bàn.
3. Tải hoặc in hàng loạt QR.

### Khuyến mãi (M-17/M-18)

1. Tạo mã giảm giá theo `%` hoặc số tiền.
2. Cấu hình thời gian hiệu lực, giới hạn lượt dùng, phạm vi áp dụng.
3. Bật/tắt chương trình.

### Báo cáo (M-19 đến M-23)

1. Vào `Báo cáo`.
2. Chọn khoảng thời gian.
3. Xem:
   - doanh thu,
   - top món,
   - tồn kho,
   - hiệu suất nhân viên.
4. Xuất file Excel/PDF (nếu endpoint tương ứng được bật).

### Chi nhánh (M-24/M-25)

- Admin tạo chi nhánh, quản lý phạm vi menu/kho/nhân sự theo chi nhánh.

## 6. Danh sách link UI để test nhanh

- Đăng nhập: `https://localhost/login`
- Dashboard: `https://localhost/`
- Bàn: `https://localhost/tables`
- Đơn hàng/POS: `https://localhost/orders`
- Kho: `https://localhost/inventory`
- Khuyến mãi: `https://localhost/promotions`
- Báo cáo: `https://localhost/reports`
- Chat staff: `https://localhost/chat`
- Bếp/KDS: `https://localhost/kitchen`

## 7. API quan trọng để kiểm tra nhanh

Base URL: `https://localhost/api`

- `POST /users/login`
- `GET /users/health`
- `GET /tables`
- `POST /tables/{id}/call-staff`
- `GET /orders`
- `POST /orders`
- `GET /chats`
- `GET /v1/ingredients/health`
- `POST /v1/payments`
- `GET /reports/health`

## 8. NFR phase 1 đã tích hợp

- JWT guard và kiểm soát quyền ở gateway/service.
- Đóng port nội bộ backend, chỉ expose qua reverse proxy.
- TLS reverse proxy tại frontend (Nginx).
- Retry policy cho một số gọi liên service.
- Backup PostgreSQL định kỳ qua `db-backup`.

## 9. Lỗi thường gặp và cách xử lý

### `docker compose ps` báo không kết nối daemon

- Docker Desktop chưa chạy.
- Mở Docker Desktop, chờ `Engine running`, chạy lại.

### Quét QR trên điện thoại bị lỗi

- QR có thể đang trỏ host/IP cũ.
- Tạo/in lại QR mới từ trang `Bàn`.
- Đảm bảo điện thoại cùng mạng LAN với máy chủ.

### `403 Forbidden` trên trang khách

- Thường do xung đột token staff/customer hoặc session cũ.
- Mở tab ẩn danh hoặc xóa site data rồi quét lại QR.

### `429 Too Many Requests`

- Hệ thống có rate-limit bảo vệ API.
- Chờ hết window hoặc giảm tần suất gọi liên tục.

### Lỗi cổng thanh toán

- Kiểm tra biến môi trường cổng thanh toán trong `docker-compose.yml`.
- Kiểm tra `returnUrl` đúng domain/host đang truy cập.

## 10. Ghi chú phát triển

- Repo có tài liệu chạy riêng: [HUONG_DAN_CHAY_BE_FE.md](HUONG_DAN_CHAY_BE_FE.md).
- Cấu hình FE local dev đã chuẩn hóa cho cổng hiện tại (`http://localhost` / `https://localhost`).

## 11. Gói bàn giao

- Checklist bàn giao: [ops/docs/DELIVERABLES.md](ops/docs/DELIVERABLES.md)
- Chuẩn đầu ra theo phase: [ops/docs/PHASED_OUTPUTS.md](ops/docs/PHASED_OUTPUTS.md)
- Tiêu chí nghiệm thu chi tiết: [ops/docs/ACCEPTANCE_CRITERIA.md](ops/docs/ACCEPTANCE_CRITERIA.md)
- Kiến trúc và luồng dữ liệu: [ops/docs/architecture.md](ops/docs/architecture.md)
- Hướng dẫn triển khai dev/prod: [ops/docs/deployment-guide.md](ops/docs/deployment-guide.md)
- API collection (Postman): [ops/docs/api/coffee-shop.postman_collection.json](ops/docs/api/coffee-shop.postman_collection.json)
- Test reports: `reports/tests/`
- Phase readiness reports: `reports/phases/`
- Acceptance report: `reports/acceptance/`
- K8s manifests: `ops/k8s/`

Script bàn giao bắt buộc:

```bash
./build-all.sh
./seed-database.sh
./deploy.sh dev
./deploy.sh prod
node ops/scripts/check-acceptance-criteria.mjs
```



