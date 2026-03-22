# Report Service TODO

## Setup ✅
- [x] `cd report-service &amp;&amp; npm install`
- [ ] `prisma generate`
- [ ] `prisma db push`
- [ ] Start service: `npm run start:dev`
- [ ] Test Kafka consumption: Create paid order
- [ ] Test APIs: GET /reports/revenue etc.

## Future
- [ ] Add JWT auth/roles
- [ ] Prisma migrate prod
- [ ] Docker integration
- [ ] Tests
- [ ] Redis cache

- [ ] Test Kafka consumption: Create paid order in order-service/payment-service
- [ ] Test APIs: GET /reports/revenue, /reports/top-items, /reports/daily-stats

## Future
- [ ] Add authentication (JWT + roles)
- [ ] Prisma migrations for prod
- [ ] Docker compose integration with postgres/kafka
- [ ] Unit/Integration tests
- [ ] Cache results with Redis
- [ ] Export CSV/PDF reports
- [ ] More granular stats (hourly, per table)

