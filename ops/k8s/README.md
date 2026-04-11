# Kubernetes Manifests

## Included resources

- `configmap.yaml`
- `secret.example.yaml`
- `postgres.yaml`
- `redis.yaml`
- `api-gateway.yaml`
- `user-service.yaml`
- `table-service.yaml`
- `order-service.yaml`
- `chat-service.yaml`
- `inventory-service.yaml`
- `payment-service.yaml`
- `report-service.yaml`
- `frontend.yaml`
- `ingress.yaml`

## Apply order

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

Update image names and secret values before using in production.


