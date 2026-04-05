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
cd coffe-shop
git checkout deverlop
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
- `VIETQR_SECRET` (nếu dùng webhook VietQR)

## 3.2 Tạo file override production

Tạo file `docker-compose.prod.yml` tại thư mục gốc (cùng cấp `docker-compose.yml`):

```yaml
services:
  postgres:
    environment:
      POSTGRES_PASSWORD: "REPLACE_POSTGRES_PASSWORD"

  api-gateway:
    environment:
      JWT_SECRET: "REPLACE_JWT_SECRET"

  user-service:
    environment:
      SPRING_DATASOURCE_PASSWORD: "REPLACE_POSTGRES_PASSWORD"
      JWT_SECRET: "REPLACE_JWT_SECRET"

  table-service:
    environment:
      SPRING_DATASOURCE_PASSWORD: "REPLACE_POSTGRES_PASSWORD"
      APP_BASE_URL: "https://coffee.example.com"

  order-service:
    environment:
      DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/orderdb?schema=public"
      INTERNAL_SERVICE_TOKEN: "REPLACE_INTERNAL_SERVICE_TOKEN"

  chat-service:
    environment:
      DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/chatdb?schema=public"

  inventory-service:
    environment:
      DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/inventorydb?schema=public"
      JWT_SECRET: "REPLACE_JWT_SECRET"
      INTERNAL_SERVICE_TOKEN: "REPLACE_INTERNAL_SERVICE_TOKEN"
      SMTP_HOST: "smtp.your-provider.com"
      SMTP_PORT: 587
      SMTP_USER: "noreply@coffee.example.com"
      SMTP_PASS: "REPLACE_SMTP_PASSWORD"
      SMTP_FROM: "\"Coffee Shop\" <noreply@coffee.example.com>"

  payment-service:
    environment:
      DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/paymentdb?schema=public"
      JWT_SECRET: "REPLACE_JWT_SECRET"
      INTERNAL_SERVICE_TOKEN: "REPLACE_INTERNAL_SERVICE_TOKEN"
      VIETQR_BANK_BIN: "9704xx"
      VIETQR_ACCOUNT_NO: "xxxxxxxxxx"
      VIETQR_ACCOUNT_NAME: "COFFEE SHOP"
      VIETQR_SECRET: "REPLACE_VIETQR_SECRET"
      MOMO_RETURN_URL: "https://coffee.example.com/payment/return"
      ZALOPAY_RETURN_URL: "https://coffee.example.com/payment/return"
      ZALOPAY_APP_ID: "REPLACE_ZALOPAY_APP_ID"
      ZALOPAY_KEY1: "REPLACE_ZALOPAY_KEY1"
      ZALOPAY_KEY2: "REPLACE_ZALOPAY_KEY2"
      # Nếu tích hợp VNPay/MoMo bản chính thức, bổ sung thêm key tương ứng tại đây.

  report-service:
    environment:
      DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/reportdb?schema=public"
      ORDER_DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/orderdb?schema=public"
      INVENTORY_DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/inventorydb?schema=public"
      PAYMENT_DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/paymentdb?schema=public"
      USER_DATABASE_URL: "postgresql://postgres:REPLACE_POSTGRES_PASSWORD@postgres:5432/userdb?schema=public"
      JWT_SECRET: "REPLACE_JWT_SECRET"

  db-backup:
    environment:
      POSTGRES_PASSWORD: "REPLACE_POSTGRES_PASSWORD"
```

## 3.3 SSL certificate thật (khuyến nghị bắt buộc)

Hiện image `frontend` tự tạo self-signed cert khi build. Với production, mount cert thật (Let's Encrypt hoặc cert thương mại).

Thêm vào `docker-compose.prod.yml`:

```yaml
services:
  frontend:
    volumes:
      - /etc/letsencrypt/live/coffee.example.com/fullchain.pem:/etc/nginx/certs/localhost.crt:ro
      - /etc/letsencrypt/live/coffee.example.com/privkey.pem:/etc/nginx/certs/localhost.key:ro
```

## 4. Deploy lần đầu

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Kiểm tra:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
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
git checkout deverlop
git pull --ff-only origin deverlop

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 7. Rollback nhanh

```bash
git log --oneline -n 20
git checkout <COMMIT_OK>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 8. Backup và restore database

## 8.1 Backup

Service `db-backup` tự dump theo chu kỳ vào thư mục host `./backups`.

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
- `APP_BASE_URL`, `MOMO_RETURN_URL`, `ZALOPAY_RETURN_URL` dùng domain production.
- Đã test end-to-end 5 luồng chính:
  - Quét QR -> đặt món
  - Nhân viên nhận và xác nhận đơn
  - KDS cập nhật trạng thái món
  - Tự động trừ kho theo công thức
  - Chat realtime khách - nhân viên
- Đã kiểm tra backup file được sinh đúng lịch.
- Đã cấu hình giám sát log và cảnh báo resource (CPU/RAM/Disk).

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
