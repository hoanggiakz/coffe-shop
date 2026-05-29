#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUT_FILE="${OUT_FILE:-$ROOT_DIR/.env.enc}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${ENV_PASSPHRASE:-}" ]]; then
  echo "Missing ENV_PASSPHRASE." >&2
  echo "Example: ENV_PASSPHRASE='your-secret' $0" >&2
  exit 1
fi

python - "$ENV_FILE" "$OUT_FILE" "$ENV_PASSPHRASE" <<'PY'
import base64
import json
import os
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

src, dst, passphrase = sys.argv[1], sys.argv[2], sys.argv[3].encode()
salt = os.urandom(16)
nonce = os.urandom(12)
kdf = Scrypt(salt=salt, length=32, n=2**14, r=8, p=1)
key = kdf.derive(passphrase)

with open(src, "rb") as f:
    plaintext = f.read()

ct = AESGCM(key).encrypt(nonce, plaintext, None)
payload = {
    "v": 1,
    "kdf": "scrypt",
    "n": 16384,
    "r": 8,
    "p": 1,
    "salt": base64.b64encode(salt).decode(),
    "nonce": base64.b64encode(nonce).decode(),
    "ciphertext": base64.b64encode(ct).decode(),
}
with open(dst, "w", encoding="utf-8") as f:
    json.dump(payload, f, separators=(",", ":"))
PY

echo "Encrypted $ENV_FILE -> $OUT_FILE"
