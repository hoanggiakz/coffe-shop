# SePay Model A Setup (Direct Webhook)

## 1. Muc tieu
- SePay goi truc tiep webhook vao he thong deploy:
  - `POST /api/payment/webhook/sepay`
- Payment status duoc cap nhat ngay tren `payment-service` qua gateway.

## 2. Yeu cau ha tang
- Domain public HTTPS hop le (khong self-signed).
- Reverse proxy cho phep `POST application/json` den `/api/payment/webhook/sepay`.
- VM va SePay deu truy cap duoc endpoint cong khai.

## 3. Bien moi truong can set
Tu file `.env` (tham khao `ops/docs/env.vm.example`):

- `APP_BASE_URL`
- `ONLINE_PAYMENT_QR_ACCOUNT_NAME`
- `ONLINE_PAYMENT_QR_ACCOUNT_NO`
- `ONLINE_PAYMENT_QR_BANK_CODE` (hoac `ONLINE_PAYMENT_QR_BANK_NAME`)
- `SEPAY_ENV=production`
- `SEPAY_IPN_AUTH_TYPE=either` (hoac `apikey` / `secret`)
- `SEPAY_IPN_API_KEY` (neu mode `apikey`/`either`)
- `SEPAY_WEBHOOK_SECRET` hoac `SEPAY_SECRET_KEY` (neu mode `secret`/`either`)
- `SEPAY_RELAY_PULL_ENABLED=false` (Model A khong dung relay)

## 4. Trien khai
```bash
cd ~/coffe-shop
git pull origin develop
docker compose up -d --build payment-service api-gateway frontend
```

## 5. Cau hinh tren SePay dashboard
- Webhook URL: `https://app.httpscoffee-demo.buzz/api/payment/webhook/sepay`
- Method: `POST`
- Content-Type: `application/json`
- Header auth:
  - `Authorization: Apikey <SEPAY_IPN_API_KEY>` (neu dung apikey)
  - hoac `x-secret-key: <SEPAY_WEBHOOK_SECRET>` (neu dung secret)

## 6. Kiem tra sau deploy
```bash
curl -sS https://app.httpscoffee-demo.buzz/api/payment/webhook/sepay | jq
```
Ky vong: endpoint reachable (probe GET), IPN thuc te phai POST.

Theo doi log:
```bash
docker compose logs -f payment-service api-gateway
```
Ky vong khi nhan IPN:
- `SePay IPN received ...`
- `Updated SEPAY payment ... to PAID ...`
