# Inventory Service

NestJS service quản lý nguyên liệu và biến động kho.

## Runtime

- Port container: `3005`
- Global prefix: `/api`
- URI versioning: `v1`
- Base path qua gateway: `/api/v1/ingredients`

## API chính

- `GET /api/v1/ingredients/health`
- `GET /api/v1/ingredients`
- `POST /api/v1/ingredients`
- `PATCH /api/v1/ingredients/:id`
- `DELETE /api/v1/ingredients/:id`
- `POST /api/v1/ingredients/stock/import`
- `POST /api/v1/ingredients/stock/receipts`
- `POST /api/v1/ingredients/stock/adjust`
- `POST /api/v1/ingredients/stock/export-bulk`
- `GET /api/v1/ingredients/stock/movements`
- `POST /api/v1/ingredients/sync-menu`

`InventoryController` dùng `JwtAuthGuard`, vì vậy endpoint nghiệp vụ yêu cầu Bearer token.

## Kafka

- Có consumer topic `ItemCompleted` để đồng bộ trừ kho tự động theo payload công thức nguyên liệu từ `order-service`.
- Nếu `KAFKA_BROKERS` rỗng, service vẫn chạy nhưng bỏ qua luồng Kafka.

## Chạy trong hệ thống

Từ thư mục `Microservices/`:

```bash
docker compose up -d --build inventory-service
```

Hoặc chạy toàn hệ thống theo `README.md`.
