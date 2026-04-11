#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://localhost}"

check() {
  local name="$1"
  local url="$2"
  echo "[integration] Checking ${name}: ${url}"
  curl -k -fsS "${url}" >/dev/null
}

check "users-health" "${BASE_URL}/api/users/health"
check "tables-health" "${BASE_URL}/api/tables/health"
check "orders-health" "${BASE_URL}/api/orders/health"
check "chats-health" "${BASE_URL}/api/chats/health"
check "inventory-health" "${BASE_URL}/api/v1/ingredients/health"
check "payment-health" "${BASE_URL}/api/v1/payments/health"
check "report-health" "${BASE_URL}/api/reports/health"
check "orders-menu" "${BASE_URL}/api/orders/menu"

echo "[integration] All smoke integration checks passed."


