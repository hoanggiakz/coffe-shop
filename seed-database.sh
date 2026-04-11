#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)

echo "[seed] Starting required services..."
docker compose "${COMPOSE_FILES[@]}" up -d postgres redis user-service table-service order-service chat-service inventory-service api-gateway

echo "[seed] Waiting a few seconds for services to initialize..."
sleep 10

echo "[seed] Seeding inventory-service..."
docker compose "${COMPOSE_FILES[@]}" exec -T inventory-service sh -lc "npx prisma db push && npm run seed"

echo "[seed] Seeding order-service (menu + promotions + recipes)..."
docker compose "${COMPOSE_FILES[@]}" exec -T order-service sh -lc "npx prisma db push --accept-data-loss && npm run seed"

echo "[seed] Database seed completed."
echo "[seed] Default users are auto-seeded by user-service (TestAccountSeeder)."
echo "[seed] Default tables are auto-seeded by table-service (TableDataSeeder)."
