#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-prod}"

if [[ "${ENVIRONMENT}" == "dev" ]]; then
  echo "[deploy] Deploying development stack..."
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
  echo "[deploy] Development deployment completed."
  exit 0
fi

echo "[deploy] Deploying production stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo "[deploy] Production deployment completed."
