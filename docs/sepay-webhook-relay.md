# SePay Webhook Relay (Fixed Public Endpoint)

## Muc tieu
- SePay chi goi 1 IPN URL co dinh.
- Moi may local clone repo khong can doi IPN tren SePay.
- Payment local tu keo IPN event tu relay ve de xu ly.

## Endpoint co dinh de dang ky tren SePay
- `POST https://<public-host>/api/v1/payments/webhook/relay`

## Cach hoat dong
1. SePay goi vao endpoint `webhook/relay` (public).
2. Relay luu event vao DB `payment_relay_events` trong `paymentdb`.
3. Moi payment-service local bat puller, goi:
- `GET <relay-source-url>?sinceId=...&limit=...&consumer=...`
4. Local xu ly event nhu webhook binh thuong va map trang thai `PAID`.

## Cau hinh cho instance public (relay host)
Dat trong `.env`:

```env
SEPAY_RELAY_SHARED_SECRET=replace-with-long-random-secret
SEPAY_RELAY_PULL_ENABLED=false
SEPAY_IPN_AUTH_TYPE=none
```

Luu y:
- Relay host khong can pull.
- IPN SePay tro vao relay host, khong tro thang local.

## Cau hinh cho may local clone repo
Dat trong `.env`:

```env
SEPAY_RELAY_SHARED_SECRET=replace-with-long-random-secret
SEPAY_RELAY_PULL_ENABLED=true
SEPAY_RELAY_SOURCE_URL=https://<public-host>/api/v1/payments/webhook/relay/events
SEPAY_RELAY_PULL_INTERVAL_MS=3000
SEPAY_RELAY_CONSUMER_ID=<ten-may-hoac-user>
```

Khuyen nghi:
- Moi may dat `SEPAY_RELAY_CONSUMER_ID` khac nhau de de trace log.
- Giu cung `SEPAY_RELAY_SHARED_SECRET` giua relay host va local.

## Kiem tra nhanh
1. Tao payment `SEPAY` tren local.
2. Chuyen khoan dung noi dung `PAY <ORDER_ID>`.
3. Xem log local payment-service:
- co dong `SePay IPN received...`
- co dong `Updated SEPAY payment ... to PAID`

## Luu tru relay event
- Relay event duoc luu trong bang `payment_relay_events` (paymentdb).
- Kich thuoc duoc gioi han boi `SEPAY_RELAY_BUFFER_SIZE` (se auto xoa event cu hon).
- Khi relay host restart, event van con trong DB.
