# Inventory Service

Production-ready NestJS microservice for managing coffee shop ingredients stock.

## Features
- CRUD ingredients (name, unit, stock, minStock)
- Stock import/export with history tracking
- Automatic stock deduction on `ItemCompleted` Kafka events from order-service
- JWT auth, Swagger docs, Winston logging
- Prisma + PostgreSQL

## Quick Start
```bash
cd inventory-service
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

## APIs (localhost:3005/api/v1)
- `POST /ingredients` - Create ingredient
- `GET /ingredients` - List ingredients  
- `POST /ingredients/stock/import` - Import stock

**Auth**: Bearer JWT (get from user-service)

## Kafka
Consumes `ItemCompleted` from order-service → auto deduct stock.

## Docker
```bash
docker-compose up --build
```

## Env
```
DATABASE_URL="postgresql://..."
KAFKA_BROKERS="localhost:9092"
JWT_SECRET="your-secret"
PORT=3005
```

