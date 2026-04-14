# Apps Layout

`apps/` chứa toàn bộ mã ứng dụng chạy chính, tách biệt phần vận hành ở `ops/`.

## Cấu trúc

- `apps/frontend`: React + Vite.
- `apps/backend/api-gateway`: NestJS gateway/proxy.
- `apps/backend/user-service`: Spring Boot (auth, staff, branch, customer).
- `apps/backend/table-service`: Spring Boot (tables/QR/call-staff).
- `apps/backend/order-service`: NestJS + Prisma (menu/orders/KDS/promotions).
- `apps/backend/chat-service`: NestJS + Socket.IO (REST + realtime chat).
- `apps/backend/inventory-service`: NestJS + Prisma (ingredients/stock).
- `apps/backend/payment-service`: NestJS + Prisma (cash/online payment).
- `apps/backend/report-service`: NestJS + Prisma (analytics reports).

## Ghi chú

- Docker Compose root build trực tiếp từ các đường dẫn `./apps/backend/<service>` và `./apps/frontend`.
- API public đi qua `api-gateway` với prefix `/api/*`.
