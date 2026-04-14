#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-prod}"

if [[ "${ENVIRONMENT}" == "dev" ]]; then
  echo "[deploy] Deploying development stack..."
  NODE_ENV=development \
  FRONTEND_HTTP_PORT="${FRONTEND_HTTP_PORT:-3000}" \
  SEED_TABLES_ON_STARTUP="${SEED_TABLES_ON_STARTUP:-true}" \
  docker compose up -d --build
  echo "[deploy] Development deployment completed."
  exit 0
fi

echo "[deploy] Deploying production stack..."
docker compose up -d --build
echo "[deploy] Production deployment completed."
