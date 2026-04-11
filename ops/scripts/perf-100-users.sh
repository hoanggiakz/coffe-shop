#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://localhost}"
TARGET_PATH="${TARGET_PATH:-/api/orders/health}"
CONCURRENCY="${CONCURRENCY:-100}"
ROUNDS="${ROUNDS:-5}"

BASE_URL="${BASE_URL}" TARGET_PATH="${TARGET_PATH}" CONCURRENCY="${CONCURRENCY}" ROUNDS="${ROUNDS}" node ops/scripts/perf-100-users.mjs


