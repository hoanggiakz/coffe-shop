#!/usr/bin/env bash
set -euo pipefail

# Quick diagnostics for Socket.IO stack behind reverse proxy / Cloudflare.
# Usage:
#   bash ops/scripts/check-socket-stack.sh https://app.httpscoffee-demo.buzz

BASE_URL="${1:-https://app.httpscoffee-demo.buzz}"
SOCKET_URL="${BASE_URL%/}/socket.io/?EIO=4&transport=polling"

echo "== Socket Stack Diagnostics =="
echo "Base URL: ${BASE_URL}"
echo

echo "[1/6] Frontend reachability"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "${BASE_URL}/"

echo "[2/6] Kitchen route reachability"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "${BASE_URL}/kitchen"

echo "[3/6] Socket polling handshake (expect 200)"
curl -sS -D /tmp/socket_headers.txt -o /tmp/socket_body.txt "${SOCKET_URL}" || true
head -n 1 /tmp/socket_headers.txt || true
grep -Eo 'HTTP/[0-9.]+ [0-9]+' /tmp/socket_headers.txt | tail -n 1 || true

echo "[4/6] Socket payload preview (expect sid/upgrades/pingInterval)"
head -c 300 /tmp/socket_body.txt || true
echo

echo "[5/6] Response headers of interest"
grep -Ei 'server:|cf-ray:|cf-cache-status:|upgrade:|connection:' /tmp/socket_headers.txt || true

echo "[6/6] Hints"
if grep -q 'HTTP/.* 400' /tmp/socket_headers.txt; then
  echo "- Socket polling returned 400. Check nginx socket location and chat-service logs."
fi
if grep -q 'HTTP/.* 502' /tmp/socket_headers.txt; then
  echo "- Upstream unavailable. Check frontend/nginx upstream and chat-service container status."
fi
if ! grep -q '"sid"' /tmp/socket_body.txt; then
  echo "- Handshake missing sid; likely proxy/cloudflare/socket path mismatch."
fi

echo
echo "Next commands on VM:"
echo "  docker compose ps"
echo "  docker compose logs --tail=200 chat-service frontend"
echo "  sudo nginx -t && sudo systemctl status nginx"
