#!/usr/bin/env bash
set -euo pipefail

echo "[build] Building backend services with Docker Compose..."
docker compose build \
  api-gateway \
  user-service \
  table-service \
  order-service \
  chat-service

echo "[build] Building frontend image..."
docker build -t coffee-shop-frontend:local ./apps/frontend

echo "[build] Build completed."

