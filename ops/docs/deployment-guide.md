# Deployment Guide (Dev/Prod)

## Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
./seed-database.sh
```

Access:
- Frontend (Next.js): `http://localhost:3000`
- API Gateway: `http://localhost:8080`

## Production

1. Prepare environment variables from `.env.example`.
2. Deploy with production override:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

3. Run smoke integration checks:

```bash
BASE_URL=https://your-domain ./ops/scripts/integration-test.sh
```

Detailed production hardening checklist: see `README_DEPLOY.md`.

## Kubernetes (optional)

Apply baseline manifests:

```bash
kubectl apply -f ops/k8s/configmap.yaml
kubectl apply -f ops/k8s/secret.example.yaml
kubectl apply -f ops/k8s/postgres.yaml
kubectl apply -f ops/k8s/redis.yaml
kubectl apply -f ops/k8s/user-service.yaml
kubectl apply -f ops/k8s/table-service.yaml
kubectl apply -f ops/k8s/order-service.yaml
kubectl apply -f ops/k8s/chat-service.yaml
kubectl apply -f ops/k8s/api-gateway.yaml
kubectl apply -f ops/k8s/frontend.yaml
kubectl apply -f ops/k8s/ingress.yaml
```

Verify rollout:

```bash
kubectl get pods,svc,ingress
kubectl rollout status deployment/api-gateway
kubectl rollout status deployment/frontend
```


