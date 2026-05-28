# AI Governance & Model Approval

## Team tối thiểu
- 1 Backend engineer
- 1 Data/ML engineer
- 1 Frontend engineer
- 1 DevOps (part-time)

## Quy trình model approval (staging 10% -> production)
1. Train model mới và log metric vào MLflow.
2. So sánh metric với active model:
   - Forecast: `MAPE` phải tốt hơn hoặc bằng baseline.
   - Recommendation: `Precision@K` cải thiện.
3. Promote model vào trạng thái `staging`.
4. Cấu hình rollout `AI_ROLLOUT_PERCENT=10`.
5. Theo dõi 3 nhóm metric trong 3-7 ngày:
   - latency/error (`ai_requests_total`, `ai_request_latency_seconds`)
   - quality (`ai_prediction_error_mape`)
   - business proxy (CTR recommendation, số anomaly false-positive)
6. Nếu metric ổn định:
   - set `AI_ACTIVE_MODEL_VERSION` = model mới.
   - tăng rollout dần 25% -> 50% -> 100%.
7. Nếu metric xấu:
   - rollback về model cũ.
   - set rollout về 0-10%.

## Guardrail vận hành
- Chatbot chỉ cho phép SQL `SELECT`.
- Chặn mọi lệnh ghi/xóa/sửa schema.
- Set timeout query (`AI_CHATBOT_SQL_TIMEOUT_MS`) và row limit (`AI_CHATBOT_MAX_ROWS`).
- Ghi audit log và chatbot query log cho mọi truy vấn.

## Retention policy
- `sales_forecast`: 180 ngày (`AI_RETENTION_FORECAST_DAYS`)
- `anomaly_alert`: 365 ngày (`AI_RETENTION_ANOMALY_DAYS`)
- `chatbot_query_log`: 90 ngày (`AI_RETENTION_CHATLOG_DAYS`)
