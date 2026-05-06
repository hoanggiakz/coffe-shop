# Hướng Dẫn Nghiệm Thu (Section 4)

Ngày cập nhật: `2026-04-14`

Tài liệu này bao gồm:

- `4.1` Kiểm tra backend bằng Postman/API
- `4.2` Kiểm tra frontend theo luồng nghiệp vụ
- `4.3` Kiểm tra triển khai trên VPS sạch

Chi tiết kiến trúc và API chuẩn tham chiếu tại `README.md`.

## 4.1 Kiểm tra backend bằng Postman

### A. Chuẩn bị

1. Khởi động stack:

```powershell
docker compose config -q
docker compose up -d --build
docker compose ps
```

2. Import Postman collection:
   - `ops/docs/api/coffee-shop.postman_collection.json`
3. Đặt biến `baseUrl`:
   - Dev mode (`./deploy.sh dev`): `http://localhost:8080`
   - Mặc định (Nginx TLS): `https://localhost`
4. Nếu dùng `https://localhost`, tắt SSL verification trong Postman.

### B. Chuỗi request bắt buộc

1. `POST /api/users/login`
   - Kỳ vọng `200`, có `accessToken`.
2. `GET /api/users/profile` (Bearer token)
   - Kỳ vọng `200`.
3. `POST /api/tables`
   - Kỳ vọng `201`, có `id`.
4. `GET /api/tables/{id}/qr`
   - Kỳ vọng `200`, có `qrCode`.
5. `GET /api/orders/menu?tableId=...`
   - Kỳ vọng `200`, có danh sách món.
6. `POST /api/orders`
   - Kỳ vọng `201`, có `order.id`.
7. `PATCH /api/orders/{id}/status`
   - Kỳ vọng `200`.
8. `POST /api/chats` và `POST /api/chats/{chatId}/messages`
   - Kỳ vọng `201`.
9. `GET /api/v1/payments/online/qr`
   - Kỳ vọng `200`.
10. `POST /api/v1/payments/webhook/relay` (mock payload SePay)
   - Kỳ vọng `200`, có `eventId`.
11. `GET /api/v1/payments/webhook/relay/events?sinceId=0&limit=5&consumer=acceptance`
   - Kỳ vọng `200`, có mảng `events`.
12. Health checks:
   - `/api/users/health`
   - `/api/tables/health`
   - `/api/orders/health`
   - `/api/chats/health`
   - `/api/v1/ingredients/health`
   - `/api/v1/payments/health`
   - `/api/reports/health`
13. `POST /api/users/customer/request-otp`
   - Kỳ vọng `200`, nhận `otp` (sandbox) và `expiresInSeconds`.
14. `POST /api/users/customer/register-otp` hoặc `POST /api/users/customer/register-email`
   - Kỳ vọng `201`, có `accessToken`.
15. `GET /api/orders/history?customerId=<customerId>&limit=20`
   - Kỳ vọng `200`, dữ liệu đơn mới -> cũ.
16. `PATCH /api/orders/{id}/status` -> `COMPLETED` với order có `customerId`
   - Kỳ vọng `200`.
17. `GET /api/users/customer/profile` và `GET /api/users/customer/offers` (Bearer customer token)
   - Kỳ vọng `200`, điểm tăng theo rule `floor(amount/10000)` (1 điểm = 10.000đ).

### C. Tiêu chí pass 4.1

- Chuỗi request chính trả đúng status kỳ vọng.
- Không có lỗi `5xx`.
- Liên kết dữ liệu hợp lệ: `tableId -> orderId -> chatId`.
- Bộ `C-16/C-17/C-18` chạy qua API với kết quả hợp lệ (auth customer, order history, loyalty points).

## 4.2 Kiểm tra frontend bằng trình duyệt

### A. Chuẩn bị

1. Đảm bảo `docker compose ps` hiển thị service chính `Up/healthy`.
2. Dùng `tableId` thật có trong hệ thống.
3. URL truy cập:
   - Dev mode: `http://localhost:3000`
   - Mặc định: `https://localhost`

### B. Luồng khách hàng

1. Vào `.../menu?tableId=<TABLE_ID>`.
2. Chọn món và đặt đơn.
3. Mở chat hỗ trợ và gửi tin nhắn.
4. Theo dõi cập nhật trạng thái đơn.
5. Đăng nhập customer bằng OTP hoặc email.
6. Vào màn lịch sử đơn, thấy đơn vừa phát sinh.
7. Kiểm tra điểm/tier hiển thị đúng sau khi đơn hoàn tất.

### C. Luồng nhân viên

1. Đăng nhập role `WAITER` hoặc `BARISTA`.
2. Vào `Kitchen` cập nhật trạng thái món.
3. Vào `Chat` trả lời khách.
4. Vào `Tables` cập nhật trạng thái bàn.

### D. Tiêu chí pass 4.2

- Khách đặt món thành công, không lỗi UI.
- Nhân viên thấy và xử lý đơn trên KDS.
- Chat 2 chiều realtime hoạt động.
- Trạng thái bàn/đơn đồng bộ đúng sau reload.
- Luồng `C-16/C-17/C-18` hiển thị đúng ở UI (auth, lịch sử đơn, điểm tích lũy).

## 4.3 Kiểm tra triển khai trên VPS sạch

### A. Chuẩn bị VPS

1. Ubuntu 22.04 mới.
2. Mở cổng `22`, `80`, `443`.
3. Cài Docker + Compose plugin.

### B. Clone và chạy

```bash
git clone <repo-url>
cd coffe-shop/Microservices
cp .env.example .env
docker compose config -q
docker compose up -d --build
docker compose ps
```

### C. Kiểm tra truy cập ngoài Internet

- Mở `http://<public-ip>` hoặc `https://<public-ip>`.
- Health nhanh: `http(s)://<public-ip>/api/users/health`.

### D. Tiêu chí pass 4.3

- Triển khai được trên VPS sạch không cần sửa code.
- Các service chính chạy ổn định.
- Truy cập được frontend và endpoint health từ bên ngoài.
