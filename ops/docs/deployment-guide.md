# Deployment Guide (Bản Gộp)

Tài liệu này là bản tóm tắt để tránh trùng lặp với `README.md` và `README_DEPLOY.md`.

## Docker Compose

### Development

```bash
./deploy.sh dev
./seed-database.sh
```

Access:

- Frontend: `http://localhost:3000`
- API Gateway: `http://localhost:8080`

### Production

```bash
docker compose config -q
docker compose up -d --build
docker compose ps
```

Chi tiết hardening production xem: `README_DEPLOY.md`.

### Optional profiles

```bash
docker compose --profile monitoring up -d
docker compose --profile logging up -d
```

## Kubernetes

```bash
kubectl apply -f ops/k8s/configmap.yaml
kubectl apply -f ops/k8s/secret.example.yaml
kubectl apply -f ops/k8s/postgres.yaml
kubectl apply -f ops/k8s/redis.yaml
kubectl apply -f ops/k8s/user-service.yaml
kubectl apply -f ops/k8s/table-service.yaml
kubectl apply -f ops/k8s/order-service.yaml
kubectl apply -f ops/k8s/chat-service.yaml
kubectl apply -f ops/k8s/inventory-service.yaml
kubectl apply -f ops/k8s/payment-service.yaml
kubectl apply -f ops/k8s/report-service.yaml
kubectl apply -f ops/k8s/api-gateway.yaml
kubectl apply -f ops/k8s/frontend.yaml
kubectl apply -f ops/k8s/ingress.yaml
```
