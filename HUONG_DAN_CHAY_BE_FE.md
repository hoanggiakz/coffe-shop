# Hướng Dẫn Chạy Backend (BE) Và Frontend (FE)

## 1) Kết quả rà soát nhanh (ngày 05/04/2026)

- `docker-compose.yml` hợp lệ (`docker compose config -q` chạy thành công).
- Frontend build thành công (`npm --prefix frontend run build`).
- Tại thời điểm rà soát, Docker daemon trên máy đang tắt nên không kiểm tra được trạng thái container runtime (`docker compose ps` báo không kết nối daemon).

## 2) Cách chạy khuyến nghị: Docker toàn bộ hệ thống

### Bước 1: bật Docker Desktop

- Mở Docker Desktop và chờ trạng thái `Engine running`.

### Bước 2: chạy toàn bộ stack

```powershell
docker compose up -d --build
```

### Bước 3: kiểm tra trạng thái service

```powershell
docker compose ps
```

Kỳ vọng các service chính đều `Up (healthy)`:

- `frontend`
- `api-gateway`
- `user-service`
- `table-service`
- `order-service`
- `chat-service`
- `inventory-service`
- `payment-service`
- `report-service`
- `postgres`
- `redis`

### Bước 4: truy cập hệ thống

- FE chính: `https://localhost`
- Bản HTTP: `http://localhost` (được chuyển hướng sang HTTPS).
- API qua reverse proxy: `https://localhost/api/...`

## 3) Chạy FE local để phát triển UI (BE vẫn chạy bằng Docker)

Mode này dùng khi bạn muốn hot-reload giao diện nhanh.

### Bước 1: chạy BE + reverse proxy bằng Docker

```powershell
docker compose up -d postgres redis user-service table-service order-service chat-service inventory-service payment-service report-service api-gateway frontend
```

### Bước 2: chạy FE local

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Mở: `http://localhost:5173`

Ghi chú:

- `frontend/vite.config.ts` đã được chỉnh proxy `/api` sang `http://localhost` (cổng 80 hiện tại).
- `frontend/.env.example` đã dùng `VITE_WS_URL=https://localhost`.

## 4) Health check nhanh từng BE service

- `GET /api/users/health`
- `GET /api/tables/health`
- `GET /api/orders/health`
- `GET /api/chats/health`
- `GET /api/v1/ingredients/health`
- `GET /api/v1/payments/health`
- `GET /api/reports/health`

Ví dụ:

```powershell
curl.exe -k https://localhost/api/users/health
curl.exe -k https://localhost/api/tables/health
```

## 5) Dừng và dọn môi trường

```powershell
docker compose down
```

Xóa cả volume dữ liệu (cẩn thận vì sẽ mất DB local):

```powershell
docker compose down -v
```

## 6) Lỗi thường gặp

### `docker compose ps` báo không kết nối daemon

- Nguyên nhân: Docker Desktop chưa chạy.
- Cách xử lý: bật Docker Desktop rồi chạy lại lệnh.

### Trình duyệt cảnh báo chứng chỉ HTTPS

- Đây là chứng chỉ tự ký ở môi trường local.
- Chấp nhận cảnh báo để tiếp tục test.

### Quét QR trên điện thoại nhưng không mở được

- Đảm bảo điện thoại và máy chạy Docker cùng mạng LAN.
- Đảm bảo QR được tạo lại theo host/IP hiện tại trước khi in.
