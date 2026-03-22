# Inventory Service TODO

## Setup & Development
- [ ] cd inventory-service && npm install
- [ ] npx prisma generate
- [ ] npx prisma db push
- [ ] npm run start:dev
- [ ] Test APIs: POST /api/v1/ingredients, GET /api/v1/ingredients, POST /api/v1/stock/import
- [ ] Verify Kafka: Send mock ItemCompleted event → check stock deduction & StockMovement record
- [ ] docker build -t inventory-service . && docker-compose up

## Future
- [ ] Add stock alerts (email/SMS when stock < minStock)
- [ ] Supplier management
- [ ] Batch import/export
- [ ] Integrate with menu-service for real-time availability
- [ ] Unit/Integration tests
- [ ] RBAC permissions (MANAGER only for import?)
