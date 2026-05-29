#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENC_FILE="${ENC_FILE:-.env.enc}"
ENV_FILE="${ENV_FILE:-.env}"
AGE_KEY_FILE="${AGE_KEY_FILE:-$HOME/.config/coffee-shop/age.key}"

if ! command -v age >/dev/null 2>&1; then
  echo "age is required. Ubuntu: sudo apt-get update && sudo apt-get install -y age" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required." >&2
  exit 1
fi

if [[ ! -f "$ENC_FILE" ]]; then
  echo "Missing encrypted env file: $ENC_FILE" >&2
  exit 1
fi

if [[ ! -f "$AGE_KEY_FILE" ]]; then
  echo "Missing key file: $AGE_KEY_FILE" >&2
  exit 1
fi

umask 077
age --decrypt -i "$AGE_KEY_FILE" -o "$ENV_FILE" "$ENC_FILE"
docker compose config -q
docker compose up -d --build
echo "Deploy done."
