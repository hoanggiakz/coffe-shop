#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENC_FILE="${ENC_FILE:-$ROOT_DIR/.env.enc}"
OUT_FILE="${OUT_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENC_FILE" ]]; then
  echo "Missing encrypted file: $ENC_FILE" >&2
  exit 1
fi

if [[ -z "${ENV_PASSPHRASE:-}" ]]; then
  echo "Missing ENV_PASSPHRASE." >&2
  echo "Example: ENV_PASSPHRASE='your-secret' $0" >&2
  exit 1
fi

umask 077
python - "$ENC_FILE" "$OUT_FILE" "$ENV_PASSPHRASE" <<'PY'
import base64
import json
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

src, dst, passphrase = sys.argv[1], sys.argv[2], sys.argv[3].encode()

with open(src, "r", encoding="utf-8") as f:
    payload = json.load(f)

salt = base64.b64decode(payload["salt"])
nonce = base64.b64decode(payload["nonce"])
ciphertext = base64.b64decode(payload["ciphertext"])

kdf = Scrypt(
    salt=salt,
    length=32,
    n=int(payload.get("n", 16384)),
    r=int(payload.get("r", 8)),
    p=int(payload.get("p", 1)),
)
key = kdf.derive(passphrase)
plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)

with open(dst, "wb") as f:
    f.write(plaintext)
PY

echo "Decrypted $ENC_FILE -> $OUT_FILE"
