# AI Analytics Roadmap (S1-S6)

Tai lieu nay chuyen checklist AI Analytics thanh ke hoach sprint co the bat tay lam ngay tren codebase hien tai.

## Pham vi va nguyen tac
- Khong pha vo luong nghiep vu hien tai.
- AI la lop bo sung: neu AI fail thi fallback ve rule-based.
- Di theo huong incremental: xong S2 da co gia tri business dau tien.

## Tien de truoc S1 (0.5 sprint)
- Chot owner: `backend`, `data/ml`, `frontend`, `devops`.
- Chot env va secrets:
  - `AI_SERVICE_URL`
  - `OPENAI_API_KEY` hoac provider LLM duoc chon
  - DB URL cho AI/reporting
- Tao nhanh board task va issue labels: `ai`, `mlops`, `data-pipeline`, `security`.

---

## S1 - Nen tang tich hop AI (2 tuan)
Muc tieu: co `ai-service` va route `/api/ai/*` di qua gateway, co health check, co CI co ban cho Python.

### Backend tasks
- Tao service moi: `apps/backend/ai-service` (FastAPI).
- Them endpoint:
  - `GET /api/ai/health`
  - `GET /api/ai/recommend/popular` (rule-based placeholder)
- Gateway:
  - Them route `/api/ai` trong `apps/backend/api-gateway/src/proxy/interfaces/service-route.interface.ts`
  - Them authorize rule role cho nhom endpoint manager/admin trong `proxy.controller.ts`
- Compose:
  - Them service `ai-service` trong `docker-compose.yml`
  - Cap nhat env `AI_SERVICE_URL` cho gateway

### CI/CD tasks
- Update `.github/workflows/deno.yml`:
  - Them matrix build/test cho `apps/backend/ai-service`
  - Check lint + unit test Python

### Frontend tasks
- Tao API client stub cho `/api/ai/*` (chua bat UI chinh thuc).

### Done criteria
- `docker compose up -d --build` chay du voi `ai-service`.
- `GET /api/ai/health` qua gateway tra `200`.
- CI xanh cho ai-service.

---

## S2 - Forecast + Anomaly MVP (2 tuan)
Muc tieu: co gia tri quan ly ngay tren dashboard voi du bao doanh thu va canh bao bat thuong co ban.

### Data/Schema tasks
- Mo rong schema report DB:
  - `sales_forecast`
  - `anomaly_alert`
- Tao migration tai service dung DB report (uu tien `report-service`).

### AI service tasks
- Them endpoint:
  - `GET /api/ai/forecast/revenue`
  - `GET /api/ai/anomalies`
  - `PUT /api/ai/anomalies/:id/resolve`
- MVP logic:
  - Forecast baseline: rolling average + seasonality nhe.
  - Anomaly rule-based: discount cao, bien dong doanh thu/so don dot bien.

### Report/Frontend tasks
- Frontend (`apps/frontend/src/pages/Reports.tsx`):
  - Widget du bao 7 ngay.
  - Bang canh bao anomaly + thao tac resolve.

### Done criteria
- Manager xem duoc du bao + anomaly tren UI.
- Co log audit khi resolve anomaly.
- API co test contract co ban.

---

## S3 - Pipeline du lieu va Feature batch (2 tuan)
Muc tieu: co du lieu batch on dinh cho model thay vi query truc tiep manh vao OLTP.

### Infra tasks
- Them profile compose cho `airflow` + `mlflow` (toi thieu local/dev).
- Tao folder pipeline:
  - `ops/airflow/dags/ai_pipeline.py`
  - `ops/airflow/jobs/*.py`

### Data tasks
- Tao bang feature trung gian:
  - `branch_daily_features`
  - `item_hourly_features`
- Job batch moi gio:
  - Lay du lieu tu `orders`, `payments`, `stock_movements`
  - Upsert feature tables

### Backend tasks
- `ai-service` doc du lieu tu feature tables thay vi query truc tiep da nguon.

### Done criteria
- DAG chay local theo lich.
- Feature tables duoc cap nhat dung tan suat.
- Do tre pipeline < 15 phut (dev benchmark).

---

## S4 - Recommendation ML + fallback chuan (2 tuan)
Muc tieu: nang cap tu rule-based sang ML recommendation nhung van co fallback an toan.

### ML tasks
- Model recommendation v1 (LightFM hoac alternative don gian).
- Training script + evaluate metric (`Precision@K`, `Recall@K`).
- Dang ky model version (MLflow local).

### AI serving tasks
- Endpoint:
  - `GET /api/ai/recommend`
  - `POST /api/ai/recommend/feedback`
- Logic fallback:
  - Neu model timeout/fail => dung top popular theo branch (tai su dung logic dang co tu `order-service`).

### Frontend tasks
- Tich hop goi y mon vao `CustomerMenu` theo feature flag.
- Thu click/skip feedback gui ve endpoint feedback.

### Done criteria
- Recommendation endpoint co p95 latency trong muc cho phep.
- Co telemetry click-through rate.
- Fallback duoc test bang fault injection.

---

## S5 - Sentiment + Chatbot an toan (2 tuan)
Muc tieu: co AI insights nang cao cho manager nhung dam bao an toan du lieu.

### Sentiment tasks
- Bang `sentiment_analysis`.
- Endpoint:
  - `GET /api/ai/sentiment/summary`
  - `GET /api/ai/sentiment/trend`
  - `POST /api/ai/sentiment/analyze`

### Chatbot tasks
- Endpoint:
  - `POST /api/ai/chat`
  - `GET /api/ai/chat/history`
- SQL safety layer:
  - Read-only queries
  - Whitelist table/column
  - Timeout + row limit
  - Log day du vao `chatbot_query_log`

### Done criteria
- Chatbot tra loi duoc 20+ cau hoi mau thuong gap.
- Khong co truy van ghi/sua/xoa qua chatbot.
- Co dashboard usage + latency + error rate.

---

## S6 - Hardening, governance, rollout production (2 tuan)
Muc tieu: san sang production voi quan tri model, bao mat, va van hanh on dinh.

### Reliability/ops tasks
- Canh bao monitoring:
  - AI API latency/error
  - Data freshness
  - Drift/quality canh bao co ban
- Runbook su co va rollback.

### Security/governance tasks
- Anonymization pipeline truoc training.
- Retention jobs cho bang AI.
- RBAC ra soat lai `/api/ai/*` theo role.

### Release tasks
- A/B rollout:
  - Bat 10-20% branch truoc
  - Theo doi metric business
  - Mo rong dan

### Done criteria
- Qua checklist acceptance AI.
- Co tai lieu van hanh + dashboard monitor + rollback plan.

---

## Mapping task -> repo (thuc thi nhanh)
- Gateway route/role: `apps/backend/api-gateway/src/proxy/*`
- Report data and queries: `apps/backend/report-service/src/modules/reports/*`
- Existing recommendation fallback: `apps/backend/order-service/src/modules/order/*`
- Frontend reports/menu: `apps/frontend/src/pages/Reports.tsx`, `apps/frontend/src/pages/CustomerMenu.tsx`
- Compose/infra: `docker-compose.yml`, `logging/*`, `monitoring/*`
- CI: `.github/workflows/deno.yml`
- Docs: `README.md`, `ops/docs/*`, `docs/*`

## KPI de theo doi xuyen suot S1-S6
- AI endpoint p95 latency
- Error rate `/api/ai/*`
- Forecast MAPE
- Recommendation CTR / attach rate
- So anomaly dung (precision) sau khi manager review
- Tyle su dung chatbot va ty le tra loi huu ich
