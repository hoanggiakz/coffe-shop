#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run as a normal user with sudo privileges, not root."
  exit 1
fi

echo "[1/6] Install base packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

echo "[2/6] Install Docker Engine + Compose plugin"
sudo install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
fi
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "[3/6] Enable Docker service"
sudo systemctl enable docker
sudo systemctl start docker

echo "[4/6] Add current user to docker group"
sudo usermod -aG docker "$USER"

echo "[5/6] Prepare project env file"
if [[ ! -f ".env" ]]; then
  cp ops/docs/env.vm.example .env
  echo "Created .env from ops/docs/env.vm.example"
else
  echo ".env already exists, keeping current values"
fi

echo "[6/6] Validate tools"
docker --version || true
docker compose version || true

cat <<'EOF'

Setup completed.
Next steps:
1) Re-login SSH (or run: newgrp docker)
2) Edit .env and replace all CHANGE_ME values
3) Build and start:
   docker compose build --no-cache
   docker compose up -d
EOF
