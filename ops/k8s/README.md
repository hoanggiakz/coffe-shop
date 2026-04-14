# Kubernetes Manifests

Tài liệu deploy Kubernetes đã được gộp vào `ops/docs/deployment-guide.md` để tránh trùng lặp.

## Danh sách manifest

- `configmap.yaml`
- `secret.example.yaml`
- `postgres.yaml`
- `redis.yaml`
- `user-service.yaml`
- `table-service.yaml`
- `order-service.yaml`
- `chat-service.yaml`
- `inventory-service.yaml`
- `payment-service.yaml`
- `report-service.yaml`
- `api-gateway.yaml`
- `frontend.yaml`
- `ingress.yaml`

## Lệnh áp dụng nhanh

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

Nhớ cập nhật image/tag và secret thật trước khi triển khai production.
