import asyncio
import os
import re
import time
from urllib import request as urlrequest
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any
from uuid import uuid4

import psycopg
import sqlparse
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel, Field


app = FastAPI(title="coffee-ai-service", version="0.3.0")

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
KB_REFRESH_INTERVAL_MINUTES = int(os.getenv("AI_KB_REFRESH_INTERVAL_MINUTES", "30"))
AI_FORECAST_CRON_ENABLED = os.getenv("AI_FORECAST_CRON_ENABLED", "true").strip().lower() in {"1", "true", "yes"}
AI_FORECAST_CRON_HOUR_UTC = int(os.getenv("AI_FORECAST_CRON_HOUR_UTC", "19"))  # 02:00 ICT ~= 19:00 UTC (previous day)
CHAT_SERVICE_API_URL = os.getenv("CHAT_SERVICE_API_URL", "http://chat-service:3007/api/chats").strip().rstrip("/")

DEFAULT_MENU_KB = [
    {"keyword": "cà phê", "answer": "Nhóm cà phê đang có các món truyền thống, latte, cappuccino và espresso."},
    {"keyword": "trà", "answer": "Nhóm trà có nhiều lựa chọn trái cây và trà sữa theo chi nhánh."},
    {"keyword": "giờ mở cửa", "answer": "Quán mở cửa từ 07:00 đến 22:00 hàng ngày."},
    {"keyword": "khuyến mãi", "answer": "Bạn có thể xem khuyến mãi đang chạy ở mục Khuyến mãi theo chi nhánh."},
]

POSITIVE_WORDS = {"tốt", "ngon", "tuyệt", "hài lòng", "good", "great", "excellent", "friendly"}
NEGATIVE_WORDS = {"tệ", "dở", "chậm", "lâu", "không hài lòng", "bad", "poor", "awful"}


class RecommendationFeedback(BaseModel):
    branchId: str
    sourceItemId: str | None = None
    targetItemId: str | None = None
    action: str


class RecommendationPayload(BaseModel):
    branchId: str
    cartItemIds: list[str] = Field(default_factory=list)
    customerId: str | None = None
    limit: int = 3


class ResolveAnomalyPayload(BaseModel):
    note: str | None = None


class AnomalyDetectPayload(BaseModel):
    branchId: str
    type: str = "ORDER_QTY"
    value: float
    baselineMean: float
    baselineStd: float = 0
    referenceId: str | None = None
    referenceType: str | None = None
    description: str | None = None


class SentimentAnalyzePayload(BaseModel):
    branchId: str
    text: str
    sourceType: str = "CHAT"
    sourceId: str | None = None


class ForecastRebuildPayload(BaseModel):
    branchId: str
    days: int = 7
    granularity: str = "daily"


class ChatPayload(BaseModel):
    branchId: str | None = None
    sessionId: str | None = None
    tableId: str | None = None
    question: str | None = None
    message: str | None = None


class ReportChatPayload(BaseModel):
    branchId: str | None = None
    userId: str | None = None
    role: str = "MANAGER"
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
KB_STATE: dict[str, Any] = {
    "lastReloadAt": datetime.now(timezone.utc).isoformat(),
    "source": "bootstrap",
}
FORECAST_CRON_STATE: dict[str, Any] = {"running": False, "lastRunAt": None}


def metric_guard(endpoint: str):
    def decorator(func):
        @wraps(func)
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


def json_dumps(obj: dict[str, Any]) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)


def normalize_branch_id(value: str | None) -> str:
    branch_id = str(value or "").strip()
    if not branch_id:
        raise HTTPException(status_code=400, detail="branchId is required")
    return branch_id


def normalize_limit(value: int, lower: int = 1, upper: int = 10) -> int:
    if value < lower or value > upper:
        raise HTTPException(status_code=400, detail=f"limit must be between {lower} and {upper}")
    return value


def reload_knowledge_base(source: str = "manual") -> dict[str, Any]:
    # Phase-1 baseline: load from static defaults; ready to swap with DB/API loaders.
    global DEFAULT_MENU_KB  # pylint: disable=global-statement
    DEFAULT_MENU_KB = list(DEFAULT_MENU_KB)
    now_iso = datetime.now(timezone.utc).isoformat()
    KB_STATE["lastReloadAt"] = now_iso
    KB_STATE["source"] = source
    KB_STATE["itemCount"] = len(DEFAULT_MENU_KB)
    return {"reloadedAt": now_iso, "itemCount": len(DEFAULT_MENU_KB), "source": source}


def ensure_kb_fresh() -> None:
    try:
        last_reload = datetime.fromisoformat(str(KB_STATE.get("lastReloadAt")))
    except Exception:
        last_reload = datetime.now(timezone.utc) - timedelta(minutes=KB_REFRESH_INTERVAL_MINUTES + 1)
    if datetime.now(timezone.utc) - last_reload >= timedelta(minutes=KB_REFRESH_INTERVAL_MINUTES):
        reload_knowledge_base(source="auto-interval")


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
        return


def sanitize_sql(sql: str) -> str:
    normalized = sqlparse.format(sql, strip_comments=True).strip().rstrip(";")
    lowered = normalized.lower()
    blocked = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "truncate ", "grant ", "revoke "]
    if any(token in lowered for token in blocked):
        raise HTTPException(status_code=400, detail="Only read-only SQL is allowed")
    if not lowered.startswith("select "):
        raise HTTPException(status_code=400, detail="Only SELECT statements are allowed")
    return normalized


def execute_sql(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    if not REPORT_DATABASE_URL:
        return []
    normalized = sanitize_sql(sql)
    with psycopg.connect(REPORT_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(f"SET LOCAL statement_timeout = '{CHATBOT_SQL_TIMEOUT_MS}ms'")
            cur.execute(normalized, params or [])
            rows = cur.fetchmany(CHATBOT_MAX_ROWS)
            cols = [d.name for d in cur.description] if cur.description else []
    return [{cols[idx]: row[idx] for idx in range(len(cols))} for row in rows]


def get_popular_items(branch_id: str, limit: int) -> list[dict[str, Any]]:
    if not REPORT_DATABASE_URL:
        return [
            {
                "branchMenuItemId": f"popular-{i}",
                "menuItemId": f"popular-{i}",
                "name": f"Popular Item {i}",
                "price": 25000 + i * 5000,
                "score": round(0.92 - i * 0.08, 2),
                "reason": "popular",
            }
            for i in range(1, limit + 1)
        ]

    try:
        rows = execute_sql(
            """
            SELECT oi."branchMenuItemId" AS id, COALESCE(SUM(oi.quantity), 0)::int AS qty
            FROM order_item oi
            JOIN order_entity o ON o.id = oi."orderId"
            WHERE o."branchId" = %s
            GROUP BY oi."branchMenuItemId"
            ORDER BY qty DESC
            LIMIT %s
            """,
            [branch_id, limit],
        )
        items: list[dict[str, Any]] = []
        for index, row in enumerate(rows):
            item_id = str(row.get("id") or f"item-{index + 1}")
            items.append(
                {
                    "branchMenuItemId": item_id,
                    "menuItemId": item_id,
                    "name": f"Item {item_id[:6]}",
                    "price": 30000,
                    "score": round(0.95 - index * 0.08, 2),
                    "reason": "popular",
                }
            )
        return items
    except Exception:
        return []


def get_cooccurrence_items(branch_id: str, cart_item_ids: list[str], limit: int) -> list[dict[str, Any]]:
    if not REPORT_DATABASE_URL or not cart_item_ids:
        return []

    try:
        rows = execute_sql(
            """
            SELECT oi2."branchMenuItemId" AS id, COUNT(*)::int AS score
            FROM order_item oi1
            JOIN order_item oi2 ON oi1."orderId" = oi2."orderId"
            JOIN order_entity o ON o.id = oi1."orderId"
            WHERE o."branchId" = %s
              AND oi1."branchMenuItemId" = ANY(%s)
              AND oi2."branchMenuItemId" <> ALL(%s)
            GROUP BY oi2."branchMenuItemId"
            ORDER BY score DESC
            LIMIT %s
            """,
            [branch_id, cart_item_ids, cart_item_ids, limit],
        )
        max_score = max([int(row.get("score") or 1) for row in rows], default=1)
        return [
            {
                "branchMenuItemId": str(row.get("id")),
                "menuItemId": str(row.get("id")),
                "name": f"Item {str(row.get('id'))[:6]}",
                "price": 30000,
                "score": round((int(row.get("score") or 0) / max_score), 2),
                "reason": "item_cooccurrence",
            }
            for row in rows
        ]
    except Exception:
        return []


def classify_sentiment(text: str) -> tuple[str, float, dict[str, float]]:
    lowered = text.lower()
    pos_hits = sum(1 for word in POSITIVE_WORDS if word in lowered)
    neg_hits = sum(1 for word in NEGATIVE_WORDS if word in lowered)

    if pos_hits > neg_hits:
        label = "POSITIVE"
        confidence = min(0.95, 0.62 + 0.08 * pos_hits)
    elif neg_hits > pos_hits:
        label = "NEGATIVE"
        confidence = min(0.95, 0.62 + 0.08 * neg_hits)
    else:
        label = "NEUTRAL"
        confidence = 0.65

    scores = {
        "POSITIVE": round(0.1 + (0.75 if label == "POSITIVE" else 0.15), 2),
        "NEUTRAL": round(0.1 + (0.75 if label == "NEUTRAL" else 0.15), 2),
        "NEGATIVE": round(0.1 + (0.75 if label == "NEGATIVE" else 0.15), 2),
    }
    total = sum(scores.values())
    normalized = {key: round(value / total, 2) for key, value in scores.items()}
    return label, round(confidence, 2), normalized


def decimal_from_any(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def top_negative_issues(texts: list[str], limit: int = 3) -> list[dict[str, Any]]:
    stop_words = {
        "la",
        "va",
        "cho",
        "khong",
        "qua",
        "rat",
        "bi",
        "toi",
        "ban",
        "quan",
        "phuc",
        "vu",
        "mon",
        "nhan",
        "vien",
        "khach",
    }
    counts: dict[str, int] = {}
    for text in texts:
        normalized = re.sub(r"[^a-zA-Z0-9À-ỹà-ỹ\s]", " ", str(text or "").lower())
        for token in normalized.split():
            token = token.strip()
            if len(token) < 3 or token in stop_words:
                continue
            counts[token] = counts.get(token, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)[: max(1, min(limit, 10))]
    return [{"issue": key, "count": value} for key, value in ranked]


async def forecast_cron_loop():
    if not AI_FORECAST_CRON_ENABLED:
        return
    FORECAST_CRON_STATE["running"] = True
    while True:
        now = datetime.now(timezone.utc)
        if now.hour == AI_FORECAST_CRON_HOUR_UTC and now.minute < 5:
            try:
                branch_rows = execute_sql('SELECT DISTINCT "branchId" FROM sales_forecast WHERE "branchId" IS NOT NULL LIMIT 200')
                branch_ids = [str(row.get("branchId") or "").strip() for row in branch_rows if str(row.get("branchId") or "").strip()]
                if not branch_ids:
                    branch_ids = ["branch-e2e"]
                for branch_id in branch_ids:
                    rebuild_revenue_forecast(ForecastRebuildPayload(branchId=branch_id, days=7, granularity="daily"))
                FORECAST_CRON_STATE["lastRunAt"] = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(360)
            except Exception:
                await asyncio.sleep(60)
        else:
            await asyncio.sleep(30)


@app.on_event("startup")
async def startup_tasks():
    reload_knowledge_base(source="startup")
    if AI_FORECAST_CRON_ENABLED:
        asyncio.create_task(forecast_cron_loop())


def map_question_to_sql(question: str, branch_id: str | None) -> str:
    q = question.lower()
    where = 'WHERE "branchId" = %s' if branch_id else ""

    if "doanh thu" in q and ("hôm nay" in q or "hom nay" in q):
        return (
            f'SELECT COALESCE(SUM("predictedRevenue"), 0) AS revenue FROM sales_forecast {where} '
            f'{"AND" if where else "WHERE"} "forecastDate"::date = CURRENT_DATE'
        )
    if "món" in q and ("bán chạy" in q or "ban chay" in q):
        return f'SELECT "menuItemId", SUM(quantity)::int AS qty FROM item_sales {where} GROUP BY "menuItemId" ORDER BY qty DESC LIMIT 10'
    if "bất thường" in q or "canh bao" in q or "cảnh báo" in q:
        return f'SELECT id, "alertType", severity, description, "isResolved", "detectedAt" FROM anomaly_alert {where} ORDER BY "detectedAt" DESC LIMIT 20'
    if "cảm xúc" in q or "cam xuc" in q or "sentiment" in q:
        return f'SELECT label, COUNT(*)::int AS count FROM sentiment_analysis {where} GROUP BY label ORDER BY label'

    return f'SELECT "forecastDate", "predictedRevenue", "confidenceLow", "confidenceHigh" FROM sales_forecast {where} ORDER BY "forecastDate" DESC LIMIT 7'


def infer_report_intent(question: str) -> str:
    q = question.lower()
    if "doanh thu" in q:
        return "REVENUE_QUERY"
    if "món" in q and ("bán chạy" in q or "ban chay" in q):
        return "TOP_ITEMS_QUERY"
    if "bất thường" in q or "cảnh báo" in q or "canh bao" in q:
        return "ANOMALY_QUERY"
    if "cảm xúc" in q or "sentiment" in q or "cam xuc" in q:
        return "SENTIMENT_QUERY"
    return "GENERAL_QUERY"


def summarize_sql_result(intent: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Không tìm thấy dữ liệu phù hợp trong phạm vi câu hỏi."
    if intent == "REVENUE_QUERY":
        revenue = decimal_from_any(rows[0].get("revenue"), 0)
        return f"Doanh thu ước tính theo dữ liệu hiện có là {int(revenue):,}đ."
    if intent == "TOP_ITEMS_QUERY":
        top = rows[0]
        return f"Món dẫn đầu hiện tại là {top.get('menuItemId', 'N/A')} với số lượng {top.get('qty', 0)}."
    if intent == "ANOMALY_QUERY":
        return f"Có {len(rows)} cảnh báo bất thường gần nhất trong phạm vi truy vấn."
    if intent == "SENTIMENT_QUERY":
        parts = [f"{row.get('label', 'UNKNOWN')}: {row.get('count', 0)}" for row in rows[:3]]
        return "Phân bổ cảm xúc hiện tại: " + ", ".join(parts)
    return f"Tìm thấy {len(rows)} dòng dữ liệu."


def answer_from_knowledge_base(question: str) -> tuple[str, str, float, bool]:
    lowered = question.lower()
    for item in DEFAULT_MENU_KB:
        if item["keyword"] in lowered:
            return item["answer"], "FAQ", 0.91, False

    order_tokens = ["đặt", "order", "mua", "thêm vào giỏ"]
    if any(token in lowered for token in order_tokens):
        return "Mình đã ghi nhận yêu cầu đặt món. Nhân viên sẽ xác nhận lại ngay.", "ORDER", 0.74, False

    return "Mình chưa chắc câu trả lời. Mình sẽ chuyển yêu cầu này cho nhân viên để hỗ trợ ngay.", "ESCALATE", 0.41, True


def load_anomalies_from_db(branch_id: str, severity: str | None) -> list[dict[str, Any]]:
    if not REPORT_DATABASE_URL:
        return []
    try:
        sql = (
            'SELECT id, "alertType", severity, description, "isResolved", "detectedAt" '
            'FROM anomaly_alert WHERE "branchId" = %s '
        )
        params: list[Any] = [branch_id]
        if severity:
            sql += "AND severity = %s "
            params.append(severity.upper())
        sql += 'ORDER BY "detectedAt" DESC LIMIT 50'
        return execute_sql(sql, params)
    except Exception:
        return []


def calculate_anomaly_severity(z_score: float) -> str:
    abs_score = abs(z_score)
    if abs_score >= 4:
        return "CRITICAL"
    if abs_score >= 3:
        return "HIGH"
    if abs_score >= 2:
        return "MEDIUM"
    return "LOW"


def emit_staff_notification(payload: dict[str, Any]) -> bool:
    target = f"{CHAT_SERVICE_API_URL}/staff-notifications"
    try:
        body = json_dumps(payload).encode("utf-8")
        req = urlrequest.Request(target, data=body, method="POST", headers={"Content-Type": "application/json"})
        with urlrequest.urlopen(req, timeout=2.0) as response:  # nosec B310
            return int(getattr(response, "status", 500)) < 300
    except Exception:
        return False


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
        "kb": {
            "lastReloadAt": KB_STATE.get("lastReloadAt"),
            "refreshIntervalMinutes": KB_REFRESH_INTERVAL_MINUTES,
            "itemCount": KB_STATE.get("itemCount", len(DEFAULT_MENU_KB)),
        },
        "forecastCron": {
            "enabled": AI_FORECAST_CRON_ENABLED,
            "hourUtc": AI_FORECAST_CRON_HOUR_UTC,
            "lastRunAt": FORECAST_CRON_STATE.get("lastRunAt"),
        },
    }


@app.post("/api/ai/forecast/revenue/rebuild")
@metric_guard("forecast_revenue_rebuild")
def rebuild_revenue_forecast(payload: ForecastRebuildPayload) -> dict[str, Any]:
    payload.branchId = normalize_branch_id(payload.branchId)
    payload.days = max(1, min(payload.days, 30))
    now = datetime.now(timezone.utc)

    baseline_daily = 4_200_000.0
    if REPORT_DATABASE_URL:
        try:
            rows = execute_sql(
                """
                SELECT date, revenue
                FROM daily_revenue
                WHERE date >= (CURRENT_DATE - INTERVAL '30 days')
                ORDER BY date ASC
                """,
            )
            if rows:
                recent_values = [decimal_from_any(row.get("revenue"), baseline_daily) for row in rows]
                baseline_daily = sum(recent_values) / max(len(recent_values), 1)
        except Exception:
            pass

    generated = []
    for idx in range(payload.days):
        date_value = (now + timedelta(days=idx)).date()
        predicted = max(0.0, baseline_daily * (1 + (0.02 * (idx % 5 - 2))))
        low = predicted * 0.9
        high = predicted * 1.1
        generated.append(
            {
                "date": date_value.isoformat(),
                "predictedRevenue": int(predicted),
                "confidenceLow": int(low),
                "confidenceHigh": int(high),
                "confidence": 0.8,
            }
        )

    persisted = 0
    if REPORT_DATABASE_URL:
        try:
            with psycopg.connect(REPORT_DATABASE_URL, autocommit=True) as conn:
                with conn.cursor() as cur:
                    for item in generated:
                        cur.execute(
                            """
                            INSERT INTO sales_forecast ("branchId", "forecastDate", granularity, "predictedRevenue", "confidenceLow", "confidenceHigh", confidence, "modelVersion", mape, "generatedAt")
                            VALUES (%s, %s::date, %s, %s, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT ("branchId", "forecastDate", granularity)
                            DO UPDATE SET
                              "predictedRevenue" = EXCLUDED."predictedRevenue",
                              "confidenceLow" = EXCLUDED."confidenceLow",
                              "confidenceHigh" = EXCLUDED."confidenceHigh",
                              confidence = EXCLUDED.confidence,
                              "modelVersion" = EXCLUDED."modelVersion",
                              mape = EXCLUDED.mape,
                              "generatedAt" = NOW()
                            """,
                            (
                                payload.branchId,
                                item["date"],
                                payload.granularity,
                                item["predictedRevenue"],
                                item["confidenceLow"],
                                item["confidenceHigh"],
                                item["confidence"],
                                AI_ACTIVE_MODEL_VERSION,
                                12.5,
                            ),
                        )
                        persisted += 1
        except Exception:
            persisted = 0

    log_audit(
        "/api/ai/forecast/revenue/rebuild",
        "rebuild",
        True,
        payload.branchId,
        metadata={"days": payload.days, "persisted": persisted},
    )
    return {
        "branchId": payload.branchId,
        "days": payload.days,
        "granularity": payload.granularity,
        "persisted": persisted,
        "items": generated,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
    }


@app.post("/api/ai/kb/reload")
@metric_guard("kb_reload")
def kb_reload() -> dict[str, Any]:
    payload = reload_knowledge_base(source="manual-api")
    return {"success": True, **payload}


@app.get("/api/ai/forecast/revenue")
@metric_guard("forecast_revenue")
def forecast_revenue(branchId: str, days: int = 7, granularity: str = "daily") -> dict[str, Any]:
    branchId = normalize_branch_id(branchId)
    days = max(1, min(days, 30))
    now = datetime.now(timezone.utc)
    if REPORT_DATABASE_URL:
        try:
            rows = execute_sql(
                """
                SELECT "forecastDate", "predictedRevenue", "confidenceLow", "confidenceHigh", confidence
                FROM sales_forecast
                WHERE "branchId" = %s AND granularity = %s
                ORDER BY "forecastDate" ASC
                LIMIT %s
                """,
                [branchId, granularity, days],
            )
            if rows:
                forecasts = [
                    {
                        "date": str(row.get("forecastDate"))[:10],
                        "predictedRevenue": int(decimal_from_any(row.get("predictedRevenue"), 0)),
                        "confidenceLow": int(decimal_from_any(row.get("confidenceLow"), 0)),
                        "confidenceHigh": int(decimal_from_any(row.get("confidenceHigh"), 0)),
                        "confidence": decimal_from_any(row.get("confidence"), 0.8),
                    }
                    for row in rows
                ]
                return {
                    "branchId": branchId,
                    "generatedAt": now.isoformat(),
                    "granularity": granularity,
                    "forecasts": forecasts,
                    "modelVersion": AI_ACTIVE_MODEL_VERSION,
                    "mape": 12.5,
                    "source": "db",
                }
        except Exception:
            pass

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
        "source": "fallback",
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
    branchId = normalize_branch_id(branchId)
    safe_limit = normalize_limit(limit)
    items = get_popular_items(branchId, safe_limit)
    strategy = "user-history" if customerId else "popularity"
    log_audit("/api/ai/recommend", "recommend", True, branchId, metadata={"limit": safe_limit, "strategy": strategy})
    return {
        "branchId": branchId,
        "limit": safe_limit,
        "items": items,
        "recommendations": items,
        "strategy": strategy,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
    }


@app.post("/api/ai/recommend")
@metric_guard("recommend_post")
def recommend_post(payload: RecommendationPayload) -> dict[str, Any]:
    payload.branchId = normalize_branch_id(payload.branchId)
    safe_limit = normalize_limit(payload.limit)
    cooccurrence_items = get_cooccurrence_items(payload.branchId, payload.cartItemIds, safe_limit)
    strategy = "item-based-cf" if cooccurrence_items else "popularity"
    items = cooccurrence_items if cooccurrence_items else get_popular_items(payload.branchId, safe_limit)
    response_items = items[:safe_limit]
    log_audit("/api/ai/recommend", "recommend", True, payload.branchId, metadata={"limit": safe_limit, "strategy": strategy})
    return {
        "branchId": payload.branchId,
        "limit": safe_limit,
        "cartItemIds": payload.cartItemIds,
        "recommendations": response_items,
        "items": response_items,
        "strategy": strategy,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
    }


@app.get("/api/ai/recommend/popular")
@metric_guard("recommend_popular")
def recommend_popular(branchId: str, limit: int = 5) -> dict[str, Any]:
    branchId = normalize_branch_id(branchId)
    safe_limit = normalize_limit(limit)
    items = get_popular_items(branchId, safe_limit)
    log_audit("/api/ai/recommend/popular", "recommend", True, branchId, metadata={"limit": safe_limit})
    return {"branchId": branchId, "items": items, "strategy": "popularity"}


@app.post("/api/ai/recommend/feedback")
@metric_guard("recommend_feedback")
def recommend_feedback(payload: RecommendationFeedback) -> dict[str, Any]:
    log_audit("/api/ai/recommend/feedback", "feedback", True, payload.branchId, metadata={"action": payload.action})
    return {"accepted": True, "branchId": payload.branchId, "action": payload.action, "recordedAt": datetime.now(timezone.utc).isoformat()}


@app.get("/api/ai/anomalies")
@metric_guard("anomalies")
def anomalies(branchId: str, severity: str | None = None) -> dict[str, Any]:
    branchId = normalize_branch_id(branchId)
    db_items = load_anomalies_from_db(branchId, severity)
    if db_items:
        return {"branchId": branchId, "items": db_items}

    filtered = [a for a in ANOMALIES if a["branchId"] == branchId]
    if severity:
        filtered = [a for a in filtered if a["severity"] == severity.upper()]
    log_audit("/api/ai/anomalies", "list", True, branchId)
    return {"branchId": branchId, "items": filtered}


@app.post("/api/ai/anomalies/detect")
@metric_guard("anomaly_detect")
def detect_anomaly(payload: AnomalyDetectPayload) -> dict[str, Any]:
    payload.branchId = normalize_branch_id(payload.branchId)
    if payload.baselineStd < 0:
        raise HTTPException(status_code=400, detail="baselineStd must be >= 0")

    z_score = 0.0 if payload.baselineStd == 0 else (payload.value - payload.baselineMean) / payload.baselineStd
    severity = calculate_anomaly_severity(z_score)
    score = min(1.0, abs(z_score) / 5.0)
    description = (
        payload.description
        or f"{payload.type}: value={payload.value:.2f}, mean={payload.baselineMean:.2f}, std={payload.baselineStd:.2f}, z={z_score:.2f}"
    )
    anomaly_id = f"anomaly-{uuid4()}"
    detected_at = datetime.now(timezone.utc).isoformat()

    created: dict[str, Any] = {
        "id": anomaly_id,
        "branchId": payload.branchId,
        "alertType": payload.type,
        "severity": severity,
        "description": description,
        "anomalyScore": round(score, 4),
        "referenceId": payload.referenceId,
        "referenceType": payload.referenceType,
        "isResolved": False,
        "detectedAt": detected_at,
    }

    persisted = False
    notified = False
    if REPORT_DATABASE_URL:
        try:
            with psycopg.connect(REPORT_DATABASE_URL, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO anomaly_alert (id, "branchId", "alertType", severity, "referenceId", "referenceType", description, "anomalyScore", "isResolved", "detectedAt")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, false, NOW())
                        """,
                        (
                            anomaly_id,
                            payload.branchId,
                            payload.type,
                            severity,
                            payload.referenceId,
                            payload.referenceType,
                            description,
                            score,
                        ),
                    )
            persisted = True
        except Exception:
            persisted = False

    if not persisted:
        ANOMALIES.append(created)

    if severity in {"HIGH", "CRITICAL"}:
        notified = emit_staff_notification(
            {
                "type": "ANOMALY_ALERT",
                "title": f"Canh bao bat thuong {severity}",
                "message": description,
                "branchId": payload.branchId,
                "metadata": {
                    "anomalyId": anomaly_id,
                    "severity": severity,
                    "anomalyScore": score,
                    "zScore": round(z_score, 4),
                    "referenceId": payload.referenceId,
                    "referenceType": payload.referenceType,
                },
            }
        )

    log_audit(
        "/api/ai/anomalies/detect",
        "detect",
        True,
        payload.branchId,
        metadata={"severity": severity, "zScore": round(z_score, 4), "persisted": persisted, "notified": notified},
    )
    return {**created, "zScore": round(z_score, 4), "persisted": persisted, "notified": notified}


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
    branchId = normalize_branch_id(branchId)
    items = anomalies(branchId).get("items", [])
    resolved = sum(1 for a in items if a.get("isResolved"))
    log_audit("/api/ai/anomalies/summary", "summary", True, branchId)
    return {"branchId": branchId, "total": len(items), "resolved": resolved, "open": len(items) - resolved}


@app.get("/api/ai/sentiment/summary")
@metric_guard("sentiment_summary")
def sentiment_summary(branchId: str) -> dict[str, Any]:
    branchId = normalize_branch_id(branchId)
    if REPORT_DATABASE_URL:
        try:
            rows = execute_sql(
                'SELECT label, COUNT(*)::int AS count FROM sentiment_analysis WHERE "branchId" = %s GROUP BY label',
                [branchId],
            )
            total = sum(int(row.get("count") or 0) for row in rows)
            if total > 0:
                mapped = {str(row.get("label")).upper(): int(row.get("count") or 0) for row in rows}
                return {
                    "branchId": branchId,
                    "positive": round(mapped.get("POSITIVE", 0) / total, 4),
                    "neutral": round(mapped.get("NEUTRAL", 0) / total, 4),
                    "negative": round(mapped.get("NEGATIVE", 0) / total, 4),
                    "sampleSize": total,
                    "modelVersion": AI_ACTIVE_MODEL_VERSION,
                }
        except Exception:
            pass

    log_audit("/api/ai/sentiment/summary", "summary", True, branchId)
    return {"branchId": branchId, "positive": 0.78, "neutral": 0.15, "negative": 0.07, "sampleSize": 120, "modelVersion": AI_ACTIVE_MODEL_VERSION}


@app.get("/api/ai/sentiment/trend")
@metric_guard("sentiment_trend")
def sentiment_trend(branchId: str, days: int = 7) -> dict[str, Any]:
    branchId = normalize_branch_id(branchId)
    if REPORT_DATABASE_URL:
        try:
            rows = execute_sql(
                """
                SELECT DATE("analyzedAt") AS date, label, COUNT(*)::int AS count
                FROM sentiment_analysis
                WHERE "branchId" = %s
                  AND "analyzedAt" >= (CURRENT_DATE - (%s::int || ' days')::interval)
                GROUP BY DATE("analyzedAt"), label
                ORDER BY DATE("analyzedAt") ASC
                """,
                [branchId, max(1, min(days, 30))],
            )
            if rows:
                grouped: dict[str, dict[str, int]] = {}
                for row in rows:
                    d = str(row.get("date"))[:10]
                    label = str(row.get("label") or "NEUTRAL").upper()
                    grouped.setdefault(d, {"POSITIVE": 0, "NEUTRAL": 0, "NEGATIVE": 0})
                    grouped[d][label] = grouped[d].get(label, 0) + int(row.get("count") or 0)
                points = []
                for d in sorted(grouped.keys()):
                    total = sum(grouped[d].values()) or 1
                    points.append(
                        {
                            "date": d,
                            "positive": round(grouped[d]["POSITIVE"] / total, 4),
                            "neutral": round(grouped[d]["NEUTRAL"] / total, 4),
                            "negative": round(grouped[d]["NEGATIVE"] / total, 4),
                        }
                    )
                return {"branchId": branchId, "points": points, "source": "db"}
        except Exception:
            pass

    today = datetime.now(timezone.utc).date()
    points = []
    for i in range(max(1, min(days, 30))):
        d = today - timedelta(days=i)
        points.append({"date": d.isoformat(), "positive": 0.7 + (i % 3) * 0.03, "neutral": 0.2 - (i % 2) * 0.02, "negative": 0.1 - (i % 2) * 0.01})
    log_audit("/api/ai/sentiment/trend", "trend", True, branchId)
    return {"branchId": branchId, "points": list(reversed(points)), "source": "fallback"}


@app.get("/api/ai/sentiment/issues-top")
@metric_guard("sentiment_issues_top")
def sentiment_issues_top(branchId: str, days: int = 7, limit: int = 3) -> dict[str, Any]:
    branchId = normalize_branch_id(branchId)
    safe_days = max(1, min(days, 30))
    safe_limit = max(1, min(limit, 10))
    if REPORT_DATABASE_URL:
        try:
            rows = execute_sql(
                """
                SELECT "originalText"
                FROM sentiment_analysis
                WHERE "branchId" = %s
                  AND label = 'NEGATIVE'
                  AND "analyzedAt" >= (CURRENT_DATE - (%s::int || ' days')::interval)
                ORDER BY "analyzedAt" DESC
                LIMIT 500
                """,
                [branchId, safe_days],
            )
            issues = top_negative_issues([str(row.get("originalText") or "") for row in rows], safe_limit)
            return {"branchId": branchId, "days": safe_days, "issues": issues, "source": "db"}
        except Exception:
            pass
    issues = [{"issue": "cho-lau", "count": 5}, {"issue": "het-mon", "count": 4}, {"issue": "thai-do", "count": 3}]
    return {"branchId": branchId, "days": safe_days, "issues": issues[:safe_limit], "source": "fallback"}


@app.post("/api/ai/sentiment/analyze")
@metric_guard("sentiment_analyze")
def sentiment_analyze(payload: SentimentAnalyzePayload) -> dict[str, Any]:
    payload.branchId = normalize_branch_id(payload.branchId)
    label, confidence, scores = classify_sentiment(payload.text)
    persisted = False
    if REPORT_DATABASE_URL:
        try:
            with psycopg.connect(REPORT_DATABASE_URL, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO sentiment_analysis ("branchId", "sourceType", "sourceId", "originalText", label, confidence, reason, "modelVersion", "analyzedAt")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            payload.branchId,
                            str(payload.sourceType or "CHAT").upper(),
                            payload.sourceId,
                            payload.text,
                            label,
                            confidence,
                            "lexicon_baseline_v1",
                            AI_ACTIVE_MODEL_VERSION,
                        ),
                    )
            persisted = True
        except Exception:
            persisted = False
    log_audit("/api/ai/sentiment/analyze", "analyze", True, payload.branchId, metadata={"label": label})
    return {
        "branchId": payload.branchId,
        "label": label,
        "confidence": confidence,
        "scores": scores,
        "persisted": persisted,
        "reason": "lexicon_baseline_v1",
    }


@app.post("/api/ai/chat")
@metric_guard("chat")
def ai_chat(payload: ChatPayload) -> dict[str, Any]:
    start = time.perf_counter()
    ensure_kb_fresh()
    if payload.branchId is not None:
        payload.branchId = normalize_branch_id(payload.branchId)
    question = str(payload.message or payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="message/question is required")

    answer, intent, confidence, escalated = answer_from_knowledge_base(question)
    generated_sql = None
    sql_result: list[dict[str, Any]] = []
    success = True
    error_message = None

    if intent == "ESCALATE" and REPORT_DATABASE_URL:
        generated_sql = map_question_to_sql(question, payload.branchId)
        try:
            params = [payload.branchId] if payload.branchId and "%s" in generated_sql else []
            sql_result = execute_sql(generated_sql, params)
            if sql_result:
                answer = f"Mình đã lấy dữ liệu sơ bộ ({len(sql_result)} dòng) và đã chuyển nhân viên xử lý chi tiết."
                confidence = 0.58
                escalated = True
        except Exception as error:  # pylint: disable=broad-except
            success = False
            error_message = str(error)

    chat_id = str(uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "id": chat_id,
        "branchId": payload.branchId,
        "sessionId": payload.sessionId,
        "tableId": payload.tableId,
        "question": question,
        "answer": answer,
        "intent": intent,
        "confidence": round(confidence, 2),
        "escalated": escalated,
        "generatedSql": generated_sql,
        "createdAt": now_iso,
    }
    CHAT_HISTORY.append(record)

    latency_ms = int((time.perf_counter() - start) * 1000)
    log_audit("/api/ai/chat", "chat_query", success, payload.branchId, latency_ms=latency_ms, metadata={"error": error_message, "intent": intent})

    return {
        **record,
        "reply": answer,
        "sqlResult": sql_result,
        "isSuccessful": success,
        "suggestions": ["Doanh thu hôm nay?", "Món bán chạy nhất?", "Khuyến mãi đang chạy?"],
    }


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


@app.post("/api/ai/report-chat")
@metric_guard("report_chat")
def report_chat(payload: ReportChatPayload) -> dict[str, Any]:
    start = time.perf_counter()
    question = str(payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    branch_id = normalize_branch_id(payload.branchId) if payload.branchId is not None else None
    role = str(payload.role or "MANAGER").upper()
    intent = infer_report_intent(question)
    sql = map_question_to_sql(question, branch_id)

    rows: list[dict[str, Any]] = []
    success = True
    error_message = None
    try:
        params = [branch_id] if branch_id and "%s" in sql else []
        rows = execute_sql(sql, params)
        answer = summarize_sql_result(intent, rows)
    except Exception as error:  # pylint: disable=broad-except
        success = False
        error_message = str(error)
        answer = "Không thể thực thi truy vấn báo cáo tại thời điểm này."

    execution_ms = int((time.perf_counter() - start) * 1000)
    log_audit(
        "/api/ai/report-chat",
        "report_chat",
        success,
        branch_id,
        actor_id=payload.userId,
        latency_ms=execution_ms,
        metadata={"intent": intent, "error": error_message, "role": role},
    )

    return {
        "answer": answer,
        "sql": sql if role == "ADMIN" else None,
        "executionTimeMs": execution_ms,
        "intent": intent,
        "isSuccessful": success,
        "rowCount": len(rows),
        "sampleRows": rows[:5],
    }
