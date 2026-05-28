# AI Data Foundation - Step 1

Tai lieu nay mo ta phan da trien khai cho buoc 1 de dat full AI module.

## 1) Schema da duoc chuan hoa

Da them 5 bang AI trong `report-service` Prisma schema:
- `sales_forecast`
- `item_recommendation`
- `anomaly_alert`
- `sentiment_analysis`
- `chatbot_query_log`

File:
- `apps/backend/report-service/prisma/schema.prisma`

## 2) Quy uoc data quality (bat buoc)

- `branchId`
  - Khong null, khong blank, khong chua leading/trailing spaces.
- Timezone
  - DB order/payment phai dong nhat timezone.
  - Chuan de nghi: UTC.
- Trang thai
  - Du lieu order `COMPLETED` va payment `PAID` phai co tuong quan on dinh.
  - Nguong canh bao readiness: `paid/completed >= 95%`.

## 3) Kiem tra do san sang du lieu (>= 3 thang)

Da them script readiness check:
- `apps/backend/report-service/scripts/ai-data-readiness-check.mjs`
- Script command:
  - `npm run ai:readiness-check` (tai `apps/backend/report-service`)

Script check:
- Do phu du lieu theo branch (`>= 3 thang` mac dinh)
- Volume moi branch (`>= 1000 orders` mac dinh)
- branchId consistency
- Timezone alignment giua order DB va payment DB
- Ty le status `PAID/COMPLETED`

Co the override nguong:
- `AI_MIN_MONTHS` (default `3`)
- `AI_MIN_ORDERS_PER_BRANCH` (default `1000`)

## 4) Cach chay

```powershell
cd apps/backend/report-service
$env:ORDER_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/orderdb?schema=public"
$env:PAYMENT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/paymentdb?schema=public"
npm run ai:readiness-check
```

## 5) Dinh nghia Done cho Step 1

- Prisma schema co du 5 bang AI + index/unique can thiet.
- Readiness script chay duoc va cho output PASS/FAIL ro rang.
- Team co the dung report readiness de quyet dinh sang Step 2 (ha tang AI va ai-service).
