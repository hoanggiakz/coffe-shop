#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to deploy the stack. Please install Docker Desktop or Docker Engine + Docker Compose."
  exit 1
fi

COMPOSE=("docker" "compose" "-f" "$ROOT_DIR/docker-compose.yml")

echo "🔨 Building and starting Coffee Shop stack with Docker Compose..."
"${COMPOSE[@]}" up -d --build

echo
echo "✅ Current container status:"
"${COMPOSE[@]}" ps

echo
echo "Frontend will be available at: https://localhost:3443 (self-signed TLS certificate)"
