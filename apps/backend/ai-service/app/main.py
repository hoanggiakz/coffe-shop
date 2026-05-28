import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import psycopg
import sqlparse
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel


app = FastAPI(title="coffee-ai-service", version="0.2.0")

REQUEST_COUNT = Counter("ai_requests_total", "Total AI requests", ["endpoint", "status"])
REQUEST_LATENCY = Histogram("ai_request_latency_seconds", "AI request latency", ["endpoint"])
PREDICTION_ERROR_GAUGE = Gauge("ai_prediction_error_mape", "Latest prediction error (MAPE)")
DATA_FRESHNESS_MINUTES = Gauge("ai_data_freshness_minutes", "Latest data freshness in minutes")

REPORT_DATABASE_URL = os.getenv("REPORT_DATABASE_URL", "").strip()
CHATBOT_SQL_TIMEOUT_MS = int(os.getenv("AI_CHATBOT_SQL_TIMEOUT_MS", "2000"))
CHATBOT_MAX_ROWS = int(os.getenv("AI_CHATBOT_MAX_ROWS", "200"))
AI_ROLLOUT_PERCENT = int(os.getenv("AI_ROLLOUT_PERCENT", "10"))
AI_ACTIVE_MODEL_VERSION = os.getenv("AI_ACTIVE_MODEL_VERSION", "baseline_v1")
AI_STAGING_MODEL_VERSION = os.getenv("AI_STAGING_MODEL_VERSION", "baseline_v2_candidate")


class RecommendationFeedback(BaseModel):
    branchId: str
    sourceItemId: str | None = None
    targetItemId: str | None = None
    action: str


class ResolveAnomalyPayload(BaseModel):
    note: str | None = None


class SentimentAnalyzePayload(BaseModel):
    branchId: str
    text: str


class ChatPayload(BaseModel):
    branchId: str | None = None
    question: str


ANOMALIES: list[dict[str, Any]] = [
    {
        "id": "anomaly-seed-1",
        "branchId": "branch-e2e",
        "alertType": "REVENUE",
        "severity": "MEDIUM",
        "description": "Revenue dropped compared to previous 7-day average.",
        "isResolved": False,
        "detectedAt": datetime.now(timezone.utc).isoformat(),
    }
]
CHAT_HISTORY: list[dict[str, Any]] = []


def metric_guard(endpoint: str):
    def decorator(func):
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                REQUEST_COUNT.labels(endpoint=endpoint, status="success").inc()
                return result
            except Exception:
                REQUEST_COUNT.labels(endpoint=endpoint, status="error").inc()
                raise
            finally:
                REQUEST_LATENCY.labels(endpoint=endpoint).observe(time.perf_counter() - start)

        return wrapper

    return decorator


def log_audit(
    endpoint: str,
    action: str,
    success: bool = True,
    branch_id: str | None = None,
    actor_id: str | None = None,
    latency_ms: int | None = None,
    metadata: dict[str, Any] | None = None,
):
    if not REPORT_DATABASE_URL:
        return
    try:
        with psycopg.connect(REPORT_DATABASE_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO ai_audit_log ("branchId", endpoint, action, "actorId", success, "latencyMs", metadata, "createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
                    """,
                    (
                        branch_id,
                        endpoint,
                        action,
                        actor_id,
                        success,
                        latency_ms,
                        "{}" if metadata is None else json_dumps(metadata),
                    ),
                )
    except Exception:
        # Do not break main flow due to audit logging failure.
        return


def json_dumps(obj: dict[str, Any]) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)


def sanitize_sql(sql: str) -> str:
    normalized = sqlparse.format(sql, strip_comments=True).strip().rstrip(";")
    lowered = normalized.lower()
    blocked = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "truncate ", "grant ", "revoke "]
    if any(token in lowered for token in blocked):
        raise HTTPException(status_code=400, detail="Only read-only SQL is allowed")
    if not lowered.startswith("select "):
        raise HTTPException(status_code=400, detail="Only SELECT statements are allowed")
    for table in ["orders", "order_items", "payments", "daily_revenue", "daily_stats", "item_sales", "sales_forecast", "anomaly_alert", "sentiment_analysis"]:
        pass
    return normalized


def map_question_to_sql(question: str, branch_id: str | None) -> str:
    q = question.lower()
    branch_filter = ""
    params = []
    if branch_id:
        branch_filter = 'WHERE "branchId" = %s'
        params.append(branch_id)

    if "doanh thu" in q and "hôm nay" in q:
        return (
            f'SELECT COALESCE(SUM("predictedRevenue"), 0) AS revenue FROM sales_forecast '
            f'{branch_filter} AND "forecastDate"::date = CURRENT_DATE' if branch_filter else
            'SELECT COALESCE(SUM("predictedRevenue"), 0) AS revenue FROM sales_forecast WHERE "forecastDate"::date = CURRENT_DATE'
        )
    if "bất thường" in q or "canh bao" in q or "cảnh báo" in q:
        return (
            f'SELECT id, "alertType", severity, description, "isResolved", "detectedAt" FROM anomaly_alert '
            f'{branch_filter} ORDER BY "detectedAt" DESC LIMIT 20'
        ) if branch_filter else 'SELECT id, "alertType", severity, description, "isResolved", "detectedAt" FROM anomaly_alert ORDER BY "detectedAt" DESC LIMIT 20'
    if "cảm xúc" in q or "cam xuc" in q or "sentiment" in q:
        return (
            f'SELECT label, COUNT(*)::int AS count FROM sentiment_analysis {branch_filter} GROUP BY label ORDER BY label'
        ) if branch_filter else 'SELECT label, COUNT(*)::int AS count FROM sentiment_analysis GROUP BY label ORDER BY label'

    return (
        f'SELECT "forecastDate", "predictedRevenue", "confidenceLow", "confidenceHigh" FROM sales_forecast '
        f'{branch_filter} ORDER BY "forecastDate" DESC LIMIT 7'
    ) if branch_filter else 'SELECT "forecastDate", "predictedRevenue", "confidenceLow", "confidenceHigh" FROM sales_forecast ORDER BY "forecastDate" DESC LIMIT 7'


def execute_readonly_sql(sql: str, branch_id: str | None) -> list[dict[str, Any]]:
    if not REPORT_DATABASE_URL:
        return []
    sanitized = sanitize_sql(sql)
    params = [branch_id] if ("%s" in sanitized and branch_id) else []
    with psycopg.connect(REPORT_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(f"SET LOCAL statement_timeout = '{CHATBOT_SQL_TIMEOUT_MS}ms'")
            cur.execute(sanitized, params)
            rows = cur.fetchmany(CHATBOT_MAX_ROWS)
            cols = [d.name for d in cur.description] if cur.description else []
    result = []
    for row in rows:
        result.append({cols[idx]: row[idx] for idx in range(len(cols))})
    return result


@app.get("/metrics")
def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/ai/health")
@metric_guard("health")
def health() -> dict[str, Any]:
    DATA_FRESHNESS_MINUTES.set(5)
    PREDICTION_ERROR_GAUGE.set(12.5)
    return {
        "status": "ok",
        "service": "ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "activeModel": AI_ACTIVE_MODEL_VERSION,
        "stagingModel": AI_STAGING_MODEL_VERSION,
        "rolloutPercent": AI_ROLLOUT_PERCENT,
    }


@app.get("/api/ai/forecast/revenue")
@metric_guard("forecast_revenue")
def forecast_revenue(branchId: str, days: int = 7, granularity: str = "daily") -> dict[str, Any]:
    days = max(1, min(days, 30))
    now = datetime.now(timezone.utc)
    forecasts: list[dict[str, Any]] = []
    base_value = 4_200_000
    for idx in range(days):
        predicted = base_value + (idx * 120_000)
        forecasts.append(
            {
                "date": (now + timedelta(days=idx)).date().isoformat(),
                "predictedRevenue": predicted,
                "confidenceLow": int(predicted * 0.9),
                "confidenceHigh": int(predicted * 1.1),
                "confidence": 0.8,
            }
        )
    log_audit("/api/ai/forecast/revenue", "predict", True, branchId)
    return {
        "branchId": branchId,
        "generatedAt": now.isoformat(),
        "granularity": granularity,
        "forecasts": forecasts,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
        "mape": 12.5,
    }


@app.get("/api/ai/forecast/revenue/hourly")
@metric_guard("forecast_hourly")
def forecast_revenue_hourly(branchId: str) -> dict[str, Any]:
    points = [{"hour": hour, "predictedRevenue": 120_000 + (hour % 6) * 30_000} for hour in range(24)]
    log_audit("/api/ai/forecast/revenue/hourly", "predict", True, branchId)
    return {
        "branchId": branchId,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "points": points,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
    }


@app.get("/api/ai/forecast/inventory")
@metric_guard("forecast_inventory")
def forecast_inventory(branchId: str, days: int = 7) -> dict[str, Any]:
    log_audit("/api/ai/forecast/inventory", "predict", True, branchId)
    return {
        "branchId": branchId,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "items": [
            {"ingredientId": "milk", "ingredientName": "Milk", "predictedRequired": 18.5, "unit": "L"},
            {"ingredientId": "coffee_beans", "ingredientName": "Coffee Beans", "predictedRequired": 9.2, "unit": "kg"},
        ],
        "horizonDays": max(1, min(days, 30)),
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
    }


@app.get("/api/ai/forecast/staffing")
@metric_guard("forecast_staffing")
def forecast_staffing(branchId: str) -> dict[str, Any]:
    log_audit("/api/ai/forecast/staffing", "predict", True, branchId)
    return {
        "branchId": branchId,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "shifts": [
            {"period": "morning", "recommendedStaff": 3},
            {"period": "afternoon", "recommendedStaff": 4},
            {"period": "evening", "recommendedStaff": 2},
        ],
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
    }


@app.get("/api/ai/recommend")
@metric_guard("recommend")
def recommend(branchId: str, limit: int = 5, customerId: str | None = None) -> dict[str, Any]:
    limit = max(1, min(limit, 10))
    items = [
        {"menuItemId": f"item-{idx}", "name": f"Recommended Item {idx}", "score": round(1 - (idx * 0.08), 2), "reason": "history_preference" if customerId else "popular"}
        for idx in range(1, limit + 1)
    ]
    log_audit("/api/ai/recommend", "recommend", True, branchId, metadata={"limit": limit})
    return {"branchId": branchId, "limit": limit, "items": items, "modelVersion": AI_ACTIVE_MODEL_VERSION}


@app.get("/api/ai/recommend/popular")
@metric_guard("recommend_popular")
def recommend_popular(branchId: str, limit: int = 5) -> dict[str, Any]:
    log_audit("/api/ai/recommend/popular", "recommend", True, branchId, metadata={"limit": limit})
    return {"branchId": branchId, "items": [{"menuItemId": f"popular-{i}", "name": f"Popular Item {i}", "score": round(1 - i * 0.1, 2)} for i in range(1, max(1, min(limit, 10)) + 1)]}


@app.post("/api/ai/recommend/feedback")
@metric_guard("recommend_feedback")
def recommend_feedback(payload: RecommendationFeedback) -> dict[str, Any]:
    log_audit("/api/ai/recommend/feedback", "feedback", True, payload.branchId, metadata={"action": payload.action})
    return {"accepted": True, "branchId": payload.branchId, "action": payload.action, "recordedAt": datetime.now(timezone.utc).isoformat()}


@app.get("/api/ai/anomalies")
@metric_guard("anomalies")
def anomalies(branchId: str, severity: str | None = None) -> dict[str, Any]:
    filtered = [a for a in ANOMALIES if a["branchId"] == branchId]
    if severity:
        filtered = [a for a in filtered if a["severity"] == severity.upper()]
    log_audit("/api/ai/anomalies", "list", True, branchId)
    return {"branchId": branchId, "items": filtered}


@app.put("/api/ai/anomalies/{anomaly_id}/resolve")
@metric_guard("anomaly_resolve")
def resolve_anomaly(anomaly_id: str, payload: ResolveAnomalyPayload) -> dict[str, Any]:
    for item in ANOMALIES:
        if item["id"] == anomaly_id:
            item["isResolved"] = True
            item["resolvedAt"] = datetime.now(timezone.utc).isoformat()
            item["resolutionNote"] = payload.note
            log_audit("/api/ai/anomalies/resolve", "resolve", True, item.get("branchId"))
            return {"success": True, "item": item}
    log_audit("/api/ai/anomalies/resolve", "resolve", False)
    return {"success": False, "message": "Anomaly not found"}


@app.get("/api/ai/anomalies/summary")
@metric_guard("anomaly_summary")
def anomalies_summary(branchId: str) -> dict[str, Any]:
    items = [a for a in ANOMALIES if a["branchId"] == branchId]
    resolved = sum(1 for a in items if a.get("isResolved"))
    log_audit("/api/ai/anomalies/summary", "summary", True, branchId)
    return {"branchId": branchId, "total": len(items), "resolved": resolved, "open": len(items) - resolved}


@app.get("/api/ai/sentiment/summary")
@metric_guard("sentiment_summary")
def sentiment_summary(branchId: str) -> dict[str, Any]:
    log_audit("/api/ai/sentiment/summary", "summary", True, branchId)
    return {"branchId": branchId, "positive": 0.78, "neutral": 0.15, "negative": 0.07, "sampleSize": 120, "modelVersion": AI_ACTIVE_MODEL_VERSION}


@app.get("/api/ai/sentiment/trend")
@metric_guard("sentiment_trend")
def sentiment_trend(branchId: str, days: int = 7) -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    points = []
    for i in range(max(1, min(days, 30))):
        d = today - timedelta(days=i)
        points.append({"date": d.isoformat(), "positive": 0.7 + (i % 3) * 0.03, "neutral": 0.2 - (i % 2) * 0.02, "negative": 0.1 - (i % 2) * 0.01})
    log_audit("/api/ai/sentiment/trend", "trend", True, branchId)
    return {"branchId": branchId, "points": list(reversed(points))}


@app.post("/api/ai/sentiment/analyze")
@metric_guard("sentiment_analyze")
def sentiment_analyze(payload: SentimentAnalyzePayload) -> dict[str, Any]:
    text = payload.text.lower()
    label = "NEUTRAL"
    if "tệ" in text or "bad" in text:
        label = "NEGATIVE"
    elif "tốt" in text or "good" in text:
        label = "POSITIVE"
    log_audit("/api/ai/sentiment/analyze", "analyze", True, payload.branchId, metadata={"label": label})
    return {"branchId": payload.branchId, "label": label, "confidence": 0.82, "reason": "keyword_based_baseline"}


@app.post("/api/ai/chat")
@metric_guard("chat")
def ai_chat(payload: ChatPayload) -> dict[str, Any]:
    start = time.perf_counter()
    question = str(payload.question or "").strip()
    sql = map_question_to_sql(question, payload.branchId)
    success = True
    error_message = None
    sql_result: list[dict[str, Any]] = []
    try:
        sql_result = execute_readonly_sql(sql, payload.branchId)
        answer = f"Found {len(sql_result)} rows for your question."
    except Exception as error:  # pylint: disable=broad-except
        success = False
        error_message = str(error)
        answer = "Query failed by guardrail or execution constraints."

    chat_id = str(uuid4())
    record = {
        "id": chat_id,
        "branchId": payload.branchId,
        "question": question,
        "generatedSql": sql,
        "answer": answer,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    CHAT_HISTORY.append(record)

    latency_ms = int((time.perf_counter() - start) * 1000)
    log_audit("/api/ai/chat", "chat_query", success, payload.branchId, latency_ms=latency_ms, metadata={"error": error_message})
    if REPORT_DATABASE_URL:
        try:
            with psycopg.connect(REPORT_DATABASE_URL, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO chatbot_query_log ("branchId", "userId", question, "generatedSql", "sqlResult", answer, "tokensUsed", "latencyMs", "isSuccessful", "createdAt")
                        VALUES (%s, NULL, %s, %s, %s::jsonb, %s, %s, %s, %s, NOW())
                        """,
                        (
                            payload.branchId,
                            question,
                            sql,
                            json_dumps({"rows": sql_result}),
                            answer,
                            max(10, len(question) // 2),
                            latency_ms,
                            success,
                        ),
                    )
        except Exception:
            pass

    return {**record, "sqlResult": sql_result, "isSuccessful": success, "suggestions": ["Doanh thu hôm nay?", "Top món bán chạy?"]}


@app.get("/api/ai/chat/history")
@metric_guard("chat_history")
def ai_chat_history(branchId: str | None = None, limit: int = 20) -> dict[str, Any]:
    records = CHAT_HISTORY
    if branchId:
        records = [item for item in records if item.get("branchId") == branchId]
    return {"items": records[-max(1, min(limit, 50)) :]}


@app.get("/api/ai/chat/suggestions")
@metric_guard("chat_suggestions")
def ai_chat_suggestions() -> dict[str, Any]:
    return {"items": ["Doanh thu hôm nay so với hôm qua?", "Món bán chạy nhất tuần này?", "Có cảnh báo bất thường nào đang mở?", "Tồn kho nguyên liệu nào sắp hết?"]}
