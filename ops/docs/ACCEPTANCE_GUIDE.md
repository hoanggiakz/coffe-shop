# Hướng Dẫn Nghiệm Thu (Section 4)

Ngày cập nhật: `2026-04-11`

Tài liệu này bao gồm:

- `4.1` Kiểm tra backend bằng Postman
- `4.2` Kiểm tra frontend bằng trình duyệt
- `4.3` Kiểm tra triển khai trên VPS sạch

## 4.1 Kiểm tra backend bằng Postman

### A. Chuẩn bị

1. Khởi động stack:

```powershell
docker compose up -d --build
docker compose ps
```

2. Mở Postman và import collection:
   - File: `ops/docs/api/coffee-shop.postman_collection.json`
3. Đặt biến `baseUrl` trong Postman:
   - Môi trường đang chạy `docker-compose.dev.yml`: `http://localhost:3000`
   - Môi trường mặc định (Nginx TLS): `https://localhost`
4. Nếu dùng `https://localhost`, tắt SSL verification trong Postman (do cert local self-signed).

### B. Chạy test theo thứ tự bắt buộc

1. `POST /api/users/register`
   - Tạo user test mới (role nhân viên hoặc khách theo kịch bản).
   - Kỳ vọng: `201`.
2. `POST /api/users/login`
   - Lấy `accessToken`.
   - Kỳ vọng: `200` và có `accessToken`.
3. `GET /api/users/profile`
   - Header: `Authorization: Bearer <accessToken>`.
   - Kỳ vọng: `200`, thông tin user đúng email vừa đăng nhập.
4. `POST /api/tables`
   - Body ví dụ: `number`, `area`, `capacity`.
   - Kỳ vọng: `201`, trả về `id` bàn.
5. `GET /api/tables/{id}/qr`
   - Dùng `id` từ bước 4.
   - Kỳ vọng: `200`, có chuỗi `qrCode` dạng `data:image/...`.
6. `POST /api/orders`
   - Dùng `tableId` thật và `menuItemId` hợp lệ.
   - Kỳ vọng: `201`, trả về `order.id`.
7. `PATCH /api/orders/{id}/status`
   - Cập nhật ví dụ: `PREPARING` hoặc `COMPLETED`.
   - Kỳ vọng: `200`, trạng thái đơn đổi đúng.
8. `POST /api/chats/{chatId}/messages` (hoặc tạo chat trước bằng `POST /api/chats`)
   - Gửi nội dung: `"Cho hỏi món của tôi khi nào có?"`.
   - Kỳ vọng: `201`, message được lưu thành công.

### C. Tiêu chí pass 4.1

- Tất cả request trên trả mã đúng như kỳ vọng.
- Không có lỗi `5xx`.
- Dữ liệu liên kết đúng chuỗi nghiệp vụ: `tableId -> orderId -> chatId`.

## 4.2 Kiểm tra frontend bằng trình duyệt

### A. Chuẩn bị

1. Đảm bảo stack đang chạy và `frontend` healthy.
2. Dùng `tableId` thật đã tạo từ backend.
3. URL truy cập:
   - Với `docker-compose.dev.yml`: `http://localhost:3000`
   - Với compose mặc định: `https://localhost`

### B. Luồng khách hàng

1. Truy cập:
   - `http://localhost:3000/menu?tableId=<TABLE_ID_THAT>`
   - Hoặc `https://localhost/menu?tableId=<TABLE_ID_THAT>`
2. Chọn món, thêm vào giỏ, đặt hàng.
3. Mở chat popup, gửi:
   - `"Cho hỏi món của tôi khi nào có?"`
4. Theo dõi trạng thái đơn hàng khi nhân viên cập nhật.

Kỳ vọng pass:

- Trang menu tải được và hiển thị món.
- Tạo đơn thành công, không văng lỗi UI.
- Tin nhắn chat hiển thị trong phiên hiện tại.
- Trạng thái đơn tự cập nhật theo thời gian thực hoặc sau refresh.

### C. Luồng nhân viên

1. Đăng nhập bằng tài khoản có role `WAITER` hoặc `BARISTA`.
2. Vào KDS:
   - Thấy đơn mới từ luồng khách.
   - Bấm `Bắt đầu làm` -> bấm `Hoàn thành`.
3. Vào tab Chat:
   - Thấy tin nhắn từ khách.
   - Trả lời được.
4. Vào Quản lý bàn:
   - Chuyển trạng thái bàn từ `occupied` sang `available`.

Kỳ vọng pass:

- KDS thao tác được, trạng thái món/đơn đổi đúng.
- Chat hai chiều khách-nhân viên hoạt động.
- Trạng thái bàn cập nhật đúng và giữ sau reload.

### D. Mẫu checklist nghiệm thu 4.2

- [ ] Khách vào menu bằng `tableId` thật
- [ ] Khách đặt món thành công
- [ ] Khách gửi chat thành công
- [ ] Nhân viên thấy đơn mới ở KDS
- [ ] Nhân viên cập nhật món từ bắt đầu đến hoàn thành
- [ ] Nhân viên trả lời chat được
- [ ] Nhân viên đổi trạng thái bàn về `available` thành công

## 4.3 Kiểm tra triển khai

Mục tiêu: trên VPS sạch `Ubuntu 22.04`, clone dự án, chạy `docker compose up -d`, truy cập được từ trình duyệt bên ngoài Internet.

### A. Chuẩn bị VPS sạch

1. Tạo VPS Ubuntu 22.04 mới.
2. Mở inbound port trên Security Group/Firewall:
   - `22/tcp` (SSH)
   - `80/tcp` (HTTP)
   - `443/tcp` (HTTPS, nếu bật TLS)
3. SSH vào VPS:

```bash
ssh <user>@<public-ip>
```

### B. Cài Docker + Docker Compose plugin

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Kiểm tra:

```bash
docker --version
docker compose version
```

### C. Clone và chạy dự án

1. Clone source:

```bash
git clone <repo-url>
cd Microservices
```

2. Tạo file môi trường:

```bash
cp .env.example .env
```

3. Chạy stack (đúng yêu cầu nghiệm thu):

```bash
docker compose up -d --build
docker compose ps
```

Kỳ vọng: các service chính `Up`/`healthy` (`frontend`, `api-gateway`, `user-service`, `table-service`, `order-service`, `chat-service`, `inventory-service`, `payment-service`, `report-service`, `postgres`, `redis`).

### D. Kiểm tra truy cập từ trình duyệt ngoài

Từ máy khác ngoài VPS (không SSH tunnel), mở:

- `http://<public-ip>` hoặc `https://<public-ip>` (tùy cấu hình)
- Health check nhanh: `http://<public-ip>/api/users/health` (hoặc `https://...`)

Kỳ vọng:

- Trang frontend tải được.
- API health trả `200`.
- Không lỗi `502/504` từ reverse proxy.

### E. Tiêu chí pass 4.3

- VPS sạch vẫn deploy được chỉ với các bước ở trên.
- `docker compose up -d` chạy thành công, service lên ổn định.
- Trình duyệt ngoài Internet truy cập được frontend và ít nhất 1 endpoint health.

### F. Lỗi thường gặp khi nghiệm thu 4.3

- Không truy cập được từ ngoài:
  - Chưa mở port `80/443` ở cloud firewall/security group.
- Service lên nhưng frontend trắng:
  - Chưa build xong image hoặc container restart liên tục (`docker compose logs -f frontend`).
- API trả `5xx`:
  - Sai `.env` hoặc DB chưa healthy (`docker compose ps`, `docker compose logs -f <service>`).



