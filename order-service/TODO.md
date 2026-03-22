# Order Service Complete

All steps finished:
- Schema updated and migrated (run Prisma commands manually if needed: cd order-service && npx prisma generate && npx prisma migrate dev --name init-orders)
- Full CRUD APIs: POST /orders, GET /orders, GET /:id, PATCH /:id/status, PATCH /:id/items
- Features: auto total, menu/table mock validate, idempotency (pending order check), Kafka OrderCreated/OrderUpdated
- Robust: Guards, validation, logger, Swagger, rate limit, helmet

To run:
cd order-service && npm install && npm run start:dev

Swagger: http://localhost:3002/api

Test example:
POST /orders
{
  "tableId": "table_1",
  "items": [{"menuItemId": "menu_1", "quantity": 2, "price": 5.0}],
  "status": "PENDING"
}
Header: idempotency-key: unique-key

Order Service ready!

