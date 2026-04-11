#!/usr/bin/env bash
set -euo pipefail

echo "[unit] api-gateway"
npm --prefix apps/backend/api-gateway test -- --runInBand

echo "[unit] order-service"
npm --prefix apps/backend/order-service test -- --runInBand

echo "[unit] chat-service"
npm --prefix apps/backend/chat-service test -- --runInBand

echo "[unit] frontend"
npm --prefix apps/frontend test -- --runInBand

echo "[unit] user-service (Gradle via Docker)"
docker run --rm -v "$(pwd)/apps/backend/user-service:/app" -w /app gradle:8-jdk17-alpine gradle test --no-daemon

echo "[unit] table-service (Gradle via Docker)"
docker run --rm -v "$(pwd)/apps/backend/table-service:/app" -w /app gradle:8-jdk17-alpine gradle test --no-daemon

echo "[unit] All unit test commands completed."



