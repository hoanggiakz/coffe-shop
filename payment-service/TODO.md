# Payment Service TODO

## Setup
- [x] npm install
- [ ] prisma db push
- [ ] Update .env with DATABASE_URL, KAFKA_BROKERS
- [ ] docker-compose up -d

## Implementation Steps (from approved plan)
1. [x] Create all files
2. [x] Add JwtAuthGuard to common/ and use on POST /payments
3. [x] Implement strategy providers (mock impl)
4. Test create payment -> PENDING, webhook -> PAID + Kafka PaymentCompleted
5. Integrate with order-service (consume OrderCreated?)
6. Add health checks @nestjs/terminus
7. Unit/integration tests

## Done
✅ All core files created per plan. Run `cmd /c \"cd payment-service & prisma db push\"` then `npm run start:dev` to test APIs at http://localhost:3004/api-docs
