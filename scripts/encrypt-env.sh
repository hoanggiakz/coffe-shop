#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUT_FILE="${OUT_FILE:-$ROOT_DIR/.env.enc}"
RECIPIENT="${1:-${AGE_RECIPIENT:-}}"

if ! command -v age >/dev/null 2>&1; then
  echo "age is required. Install: https://github.com/FiloSottile/age" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ -z "$RECIPIENT" ]]; then
  echo "Usage: $0 <age-public-recipient>  (or set AGE_RECIPIENT)" >&2
  exit 1
fi

age -r "$RECIPIENT" -o "$OUT_FILE" "$ENV_FILE"
echo "Encrypted $ENV_FILE -> $OUT_FILE"
