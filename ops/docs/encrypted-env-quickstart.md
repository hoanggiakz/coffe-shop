# Encrypted Env Quickstart

## On VM

```bash
git clone -b develop https://github.com/hoanggiakz/coffe-shop.git
cd coffe-shop
python3 -m pip install --user cryptography
chmod +x scripts/decrypt-env-passphrase.sh
ENV_PASSPHRASE='__SET_PASSPHRASE__' ./scripts/decrypt-env-passphrase.sh
docker compose up -d --build
```

## Optional re-encrypt after editing `.env`

```bash
chmod +x scripts/encrypt-env-passphrase.sh
ENV_PASSPHRASE='__SET_PASSPHRASE__' ./scripts/encrypt-env-passphrase.sh
```
