# README Deploy Production

Tài liệu này hướng dẫn triển khai hệ thống Coffee Shop Microservices lên môi trường production bằng Docker Compose.

## 1. Kiến trúc deploy

- Một host Linux (VM hoặc bare-metal) chạy Docker.
- Toàn bộ service chạy trong cùng `docker-compose`.
- `frontend` publish cổng `80/443`, reverse proxy nội bộ tới `api-gateway` và `chat-service`.
- Backend service chỉ `expose` trong network Docker, không mở public trực tiếp.

## 2. Điều kiện trước khi deploy

## 2.1 Hạ tầng

- Ubuntu 22.04+ hoặc Debian 12+.
- CPU >= 4 vCPU, RAM >= 8GB, SSD >= 80GB.
- Domain đã trỏ DNS A record về IP server, ví dụ: `coffee.example.com`.
- Mở firewall:
  - `80/tcp`
  - `443/tcp`
  - `22/tcp` (SSH, giới hạn IP quản trị nếu có thể)

## 2.2 Cài Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 2.3 Clone mã nguồn

```bash
git clone git@github.com:hoanggiakz/coffe-shop.git
cd coffe-shop/Microservices
git checkout develop
```

## 3. Cấu hình production bắt buộc

Không dùng secret mặc định trong `docker-compose.yml`.

## 3.1 Sinh secret mạnh

```bash
openssl rand -base64 48
```

Tạo tối thiểu:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `INTERNAL_SERVICE_TOKEN`
- `ONLINE_PAYMENT_QR_URL` (optional, ảnh QR chuyển khoản)
- `PAYMENT_WEBHOOK_SECRET` (optional, secret chung webhook)
- `SEPAY_QUERY_URL`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_IPN_API_KEY` (nếu bật SePay IPN)
- `SEPAY_RELAY_SHARED_SECRET` (neu dung relay webhook co dinh)
- `KAFKA_BROKERS` (optional, nếu bật flow event `OrderCreated` -> KDS qua Kafka)

## 3.2 Tạo file `.env` cho production

Từ file mẫu `.env.example`, tạo `.env` và thay toàn bộ secret bằng giá trị thật:

```bash
cp .env.example .env
```

Ví dụ các biến bắt buộc tối thiểu trong `.env`:

```dotenv
POSTGRES_PASSWORD=REPLACE_POSTGRES_PASSWORD
JWT_SECRET=REPLACE_JWT_SECRET
INTERNAL_SERVICE_TOKEN=REPLACE_INTERNAL_SERVICE_TOKEN
APP_BASE_URL=https://coffee.example.com
ALLOWED_ORIGINS=https://coffee.example.com
SMTP_HOST=smtp.your-provider.com
SMTP_USER=noreply@coffee.example.com
SMTP_PASS=REPLACE_SMTP_PASSWORD
ONLINE_PAYMENT_QR_URL=https://img.vietqr.io/image/VCB-1026422235-qr_only.png
SEPAY_QUERY_URL=https://my.sepay.vn/userapi/transactions/list
ONLINE_PAYMENT_TIMEOUT_MINUTES=30
PAYMENT_WEBHOOK_SECRET=REPLACE_WEBHOOK_SECRET
SEPAY_WEBHOOK_SECRET=REPLACE_SEPAY_WEBHOOK_SECRET
SEPAY_IPN_API_KEY=REPLACE_SEPAY_IPN_API_KEY
SEPAY_RELAY_SHARED_SECRET=REPLACE_RELAY_SHARED_SECRET
SEPAY_RELAY_PULL_ENABLED=false
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092
```

## 3.4 Public webhook cho SePay (khuyen nghi relay co dinh)

- Endpoint nhận IPN: `POST https://<domain>/api/v1/payments/webhook/relay`
- Endpoint local pull event: `GET https://<domain>/api/v1/payments/webhook/relay/events`
- Bắt buộc public HTTPS, không dùng localhost/private IP.
- Dat `SEPAY_RELAY_SHARED_SECRET` va gui token qua header `x-relay-token` khi pull event.
- Khuyến nghị thêm WAF/rate-limit cho đường dẫn relay.

## 3.3 SSL certificate thật (khuyến nghị bắt buộc)

Hiện image `frontend` tự tạo self-signed cert khi build. Với production, mount cert thật (Let's Encrypt hoặc cert thương mại) trực tiếp vào service `frontend` trong `docker-compose.yml`:

```yaml
services:
  frontend:
    volumes:
      - /etc/letsencrypt/live/coffee.example.com/fullchain.pem:/etc/nginx/certs/localhost.crt:ro
      - /etc/letsencrypt/live/coffee.example.com/privkey.pem:/etc/nginx/certs/localhost.key:ro
```

## 4. Deploy lần đầu

```bash
docker compose config -q
docker compose up -d --build
```

Kiểm tra:

```bash
docker compose ps
```

## 5. Health-check sau deploy

```bash
curl -k https://coffee.example.com/api/users/health
curl -k https://coffee.example.com/api/tables/health
curl -k https://coffee.example.com/api/orders/health
curl -k https://coffee.example.com/api/chats/health
curl -k https://coffee.example.com/api/v1/ingredients/health
curl -k https://coffee.example.com/api/v1/payments/health
curl -k https://coffee.example.com/api/reports/health
```

UI:

- `https://coffee.example.com/login`
- `https://coffee.example.com/tables`
- `https://coffee.example.com/orders`

## 6. Update phiên bản (zero-minimal downtime)

```bash
git fetch origin
git checkout develop
git pull --ff-only origin develop

docker compose up -d --build
```

## 7. Rollback nhanh

```bash
git log --oneline -n 20
git checkout <COMMIT_OK>
docker compose up -d --build
```

## 8. Backup và restore database

## 8.1 Backup

Service `db-backup` tự dump theo chu kỳ vào thư mục host `./backups`.
Mặc định giữ backup `30` ngày (`BACKUP_RETENTION_DAYS=30`), có thể chỉnh qua `.env`.

Backup thủ công ngay lập tức:

```bash
docker compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dumpall -U postgres' > backup-manual.sql
```

## 8.2 Restore

```bash
cat backup-manual.sql | docker compose exec -T postgres psql -U postgres
```

## 9. Checklist go-live

- Đã thay toàn bộ secret mặc định.
- Đã dùng SSL certificate thật (không self-signed).
- `APP_BASE_URL` dùng domain production.
- QR phải luôn trỏ về domain public (không trỏ `localhost`/IP LAN). Sau khi đổi domain, vào màn hình `Bàn` và bấm `In QR đã chọn` để sinh/in lại QR mới.
- Đã test end-to-end 10 luồng chính:
  - Quét QR -> đặt món
  - Tạo bàn mới -> sinh QR -> xem/tải/in QR
  - Nhân viên nhận và xác nhận đơn
  - KDS cập nhật trạng thái món (`WAITING -> PREPARING -> READY`)
  - Tự động trừ kho theo công thức
  - Chat realtime khách - nhân viên
  - Khách mở chat và join room theo `tableId`, nhân viên nhận/trả lời realtime
  - Khách đăng ký/đăng nhập bằng OTP hoặc email (`C-16`)
  - Khách xem lịch sử đơn (`C-17`)
  - Khách xem điểm tích lũy sau khi đơn hoàn tất (`C-18`, rule `1 điểm = 10.000đ`)
- Đã kiểm tra luồng event bếp: `ItemCompleted` từ `order-service` được `inventory-service` consume để trừ kho (hoặc fallback API khi Kafka unavailable).
- Luồng đặt món QR phải đi theo chuỗi:
  - FE `GET /api/orders/menu?tableId=...` -> Gateway validate table với `table-service` -> `order-service` trả menu -> `POST /api/orders` -> `OrderCreated` lên Kafka -> KDS nhận đơn mới.
- Đã kiểm tra backup file được sinh đúng lịch.
- Đã cấu hình giám sát log và cảnh báo resource (CPU/RAM/Disk).
- Nếu bật SePay IPN: đã test luồng relay (`webhook/relay`) va local pull (`relay/events`) end-to-end.
- Đã đối chiếu NFR 4.1-4.6 theo code hiện tại tại `reports/nfr/non-functional-readiness.md`.

Nếu cần stack quan sát trong cùng file compose:

```bash
docker compose --profile monitoring up -d
docker compose --profile logging up -d
```

## 10. Lệnh vận hành nhanh

```bash
# Xem log realtime
docker compose logs -f --tail=200 frontend api-gateway order-service payment-service

# Restart 1 service
docker compose restart payment-service

# Recreate 1 service sau khi đổi env
docker compose up -d --force-recreate payment-service

# Dừng toàn bộ
docker compose down
```

## 12. Scale khi tải tăng (không đổi logic nghiệp vụ)

### 12.1 Scale nhanh với Docker Compose

Áp dụng cho service stateless (ưu tiên): `frontend`, `api-gateway`, `order-service`, `chat-service`.

```bash
docker compose up -d --scale frontend=2 --scale api-gateway=2 --scale order-service=3 --scale chat-service=2
docker compose ps
```

Ghi chú:
- Không scale `postgres` theo cách này.
- Sau scale, kiểm tra health endpoint và test lại luồng QR order end-to-end.

### 12.2 Scale với Kubernetes (khuyến nghị production nhiều traffic)

Repo đã có manifest `Deployment` cho microservices và bổ sung HPA tại:
- `ops/k8s/hpa-api-gateway.yaml`
- `ops/k8s/hpa-order-service.yaml`
- `ops/k8s/hpa-chat-service.yaml`

Apply:

```bash
kubectl apply -f ops/k8s/hpa-api-gateway.yaml
kubectl apply -f ops/k8s/hpa-order-service.yaml
kubectl apply -f ops/k8s/hpa-chat-service.yaml
```

## 11. Tham chiếu test service

Để chuẩn bị môi trường test và kiểm thử từng service theo API hiện tại, dùng:

- `ops/scripts/prepare-test-env.ps1`
- `ops/scripts/run-full-api-test.ps1`
- `ops/docs/test-services-guide.md`

