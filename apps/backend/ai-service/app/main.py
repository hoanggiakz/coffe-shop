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
from fastapi import FastAPI, HTTPException, Request, Response
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
AI_ENFORCE_RBAC = os.getenv("AI_ENFORCE_RBAC", "false").strip().lower() in {"1", "true", "yes"}
AI_ALLOW_LEGACY_NO_AUTH = os.getenv("AI_ALLOW_LEGACY_NO_AUTH", "true").strip().lower() in {"1", "true", "yes"}
AI_RATE_LIMIT_PER_MINUTE = int(os.getenv("AI_RATE_LIMIT_PER_MINUTE", "120"))
AI_RATE_LIMIT_REPORT_CHAT_PER_MINUTE = int(os.getenv("AI_RATE_LIMIT_REPORT_CHAT_PER_MINUTE", "30"))
AI_RATE_LIMIT_CHAT_PER_MINUTE = int(os.getenv("AI_RATE_LIMIT_CHAT_PER_MINUTE", "60"))

DEFAULT_MENU_KB = [
    {"keyword": "cà phê", "answer": "Nhóm cà phê đang có các món truyền thống, latte, cappuccino và espresso."},
    {"keyword": "trà", "answer": "Nhóm trà có nhiều lựa chọn trái cây và trà sữa theo chi nhánh."},
    {"keyword": "giờ mở cửa", "answer": "Quán mở cửa từ 07:00 đến 22:00 hàng ngày."},
    {"keyword": "khuyến mãi", "answer": "Bạn có thể xem khuyến mãi đang chạy ở mục Khuyến mãi theo chi nhánh."},
]

POSITIVE_WORD_WEIGHTS: dict[str, float] = {
    "tot": 1.0,
    "ngon": 1.2,
    "tuyet": 1.4,
    "hailong": 1.3,
    "nhanh": 0.8,
    "thanthien": 1.1,
    "sach": 0.7,
    "good": 1.0,
    "great": 1.2,
    "excellent": 1.5,
    "friendly": 1.0,
}
NEGATIVE_WORD_WEIGHTS: dict[str, float] = {
    "te": 1.3,
    "do": 1.0,
    "cham": 1.1,
    "lau": 1.1,
    "khonghailong": 1.4,
    "hetmon": 1.5,
    "khophucvu": 1.2,
    "thaidoxau": 1.6,
    "bad": 1.1,
    "poor": 1.2,
    "awful": 1.5,
}

ISSUE_TOPIC_KEYWORDS: dict[str, set[str]] = {
    "cho_lau": {"cho", "cho_lau", "cham", "lau", "doi", "tre"},
    "het_mon": {"het", "het_mon", "khong_co", "out_of_stock", "sold_out"},
    "thai_do": {"thai_do", "nhan_vien", "tho_lo", "khophucvu", "cau_gat", "bat_lich_su"},
    "chat_luong": {"do", "te", "nhat", "nguoi", "khong_ngon", "chat_luong"},
    "gia_ca": {"gia", "dat", "mac", "phi", "khong_xung_dang"},
}


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
RATE_LIMIT_COUNTERS: dict[str, dict[str, int]] = {}


@app.middleware("http")
async def attach_correlation_id(request: Request, call_next):
    request_id = str(request.headers.get("x-request-id") or request.headers.get("x-correlation-id") or f"ai-{uuid4()}")
    request.state.correlation_id = request_id
    response: Response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


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


def authorize_request(
    request: Request,
    branch_id: str | None,
    allowed_roles: set[str],
) -> dict[str, str]:
    role = str(request.headers.get("x-actor-role") or request.headers.get("x-user-role") or "").strip().upper()
    actor_branch_id = str(request.headers.get("x-actor-branch-id") or request.headers.get("x-branch-id") or "").strip()
    actor_user_id = str(request.headers.get("x-actor-user-id") or request.headers.get("x-user-id") or "").strip()

    if not role:
        if AI_ENFORCE_RBAC and not AI_ALLOW_LEGACY_NO_AUTH:
            raise HTTPException(status_code=401, detail="Missing actor role")
        return {"role": "LEGACY", "branchId": actor_branch_id, "userId": actor_user_id}

    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient role for this endpoint")

    if role == "MANAGER" and branch_id and actor_branch_id and actor_branch_id != branch_id:
        raise HTTPException(status_code=403, detail="Manager cannot access other branch scope")

    return {"role": role, "branchId": actor_branch_id, "userId": actor_user_id}


def enforce_rate_limit(request: Request, scope: str, max_per_minute: int) -> None:
    if max_per_minute <= 0:
        return
    client_ip = str(getattr(request.client, "host", "") or "unknown")
    actor_id = str(request.headers.get("x-actor-user-id") or request.headers.get("x-user-id") or "").strip()
    actor_key = actor_id or client_ip
    key = f"{scope}:{actor_key}"
    now = int(time.time())
    bucket = RATE_LIMIT_COUNTERS.get(key)
    if not bucket or now >= int(bucket.get("resetAt", 0)):
        RATE_LIMIT_COUNTERS[key] = {"count": 1, "resetAt": now + 60}
        return
    current_count = int(bucket.get("count", 0)) + 1
    bucket["count"] = current_count
    if current_count > max_per_minute:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded for {scope}")


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


def normalize_text_for_sentiment(text: str) -> str:
    value = str(text or "").lower()
    value = value.replace("không", "khong").replace("hài lòng", "hailong")
    value = value.replace("thái độ", "thai_do").replace("hết món", "het_mon")
    value = value.replace("chờ lâu", "cho_lau").replace("khó phục vụ", "khophucvu")
    value = re.sub(r"[^a-z0-9À-ỹà-ỹ_\s]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def sentiment_weight_score(tokens: list[str], weight_map: dict[str, float]) -> float:
    score = 0.0
    for token in tokens:
        score += weight_map.get(token, 0.0)
    return score


def classify_sentiment(text: str) -> tuple[str, float, dict[str, float], dict[str, Any]]:
    normalized_text = normalize_text_for_sentiment(text)
    tokens = [token for token in normalized_text.split(" ") if token]

    pos_score = sentiment_weight_score(tokens, POSITIVE_WORD_WEIGHTS)
    neg_score = sentiment_weight_score(tokens, NEGATIVE_WORD_WEIGHTS)
    delta = pos_score - neg_score

    if delta > 0.35:
        label = "POSITIVE"
    elif delta < -0.35:
        label = "NEGATIVE"
    else:
        label = "NEUTRAL"

    magnitude = abs(delta)
    confidence = max(0.55, min(0.97, 0.6 + (magnitude * 0.12)))

    base_positive = max(0.05, pos_score + (0.8 if label == "POSITIVE" else 0.2))
    base_negative = max(0.05, neg_score + (0.8 if label == "NEGATIVE" else 0.2))
    base_neutral = max(0.1, 0.8 if label == "NEUTRAL" else 0.25)
    total = base_positive + base_neutral + base_negative
    normalized = {
        "POSITIVE": round(base_positive / total, 2),
        "NEUTRAL": round(base_neutral / total, 2),
        "NEGATIVE": round(base_negative / total, 2),
    }
    explanation = {
        "tokens": tokens[:20],
        "positiveScore": round(pos_score, 3),
        "negativeScore": round(neg_score, 3),
        "delta": round(delta, 3),
    }
    return label, round(confidence, 2), normalized, explanation


def decimal_from_any(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    mid = len(sorted_values) // 2
    if len(sorted_values) % 2 == 0:
        return (sorted_values[mid - 1] + sorted_values[mid]) / 2
    return sorted_values[mid]


def std_dev(values: list[float], mean_value: float) -> float:
    if len(values) <= 1:
        return 0.0
    variance = sum((value - mean_value) ** 2 for value in values) / len(values)
    return variance ** 0.5


def historical_daily_revenue(branch_id: str, lookback_days: int = 90) -> list[dict[str, Any]]:
    if not REPORT_DATABASE_URL:
        return []
    try:
        rows = execute_sql(
            """
            SELECT DATE(o."createdAt") AS date, COALESCE(SUM(o."finalAmount"), 0) AS revenue
            FROM order_entity o
            WHERE o."branchId" = %s
              AND COALESCE(o."paymentStatus", 'UNPAID') = 'PAID'
              AND o."createdAt" >= (CURRENT_DATE - (%s::int || ' days')::interval)
            GROUP BY DATE(o."createdAt")
            ORDER BY DATE(o."createdAt") ASC
            """,
            [branch_id, max(7, min(lookback_days, 365))],
        )
        return rows
    except Exception:
        return []


def merge_recommendation_candidates(
    cooccurrence_items: list[dict[str, Any]],
    popular_items: list[dict[str, Any]],
    cart_item_ids: list[str],
    limit: int,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(limit, 10))
    cart_set = set([str(item_id).strip() for item_id in cart_item_ids if str(item_id).strip()])
    score_map: dict[str, dict[str, Any]] = {}

    for idx, item in enumerate(cooccurrence_items):
        item_id = str(item.get("branchMenuItemId") or item.get("menuItemId") or "").strip()
        if not item_id or item_id in cart_set:
            continue
        co_score = decimal_from_any(item.get("score"), 0.0)
        weighted = (0.72 * co_score) + max(0.0, 0.28 - idx * 0.03)
        score_map[item_id] = {**item, "score": round(min(0.99, weighted), 4), "reason": "hybrid_cf_popularity"}

    for idx, item in enumerate(popular_items):
        item_id = str(item.get("branchMenuItemId") or item.get("menuItemId") or "").strip()
        if not item_id or item_id in cart_set:
            continue
        pop_score = decimal_from_any(item.get("score"), 0.0)
        weighted = (0.40 * pop_score) + max(0.0, 0.60 - idx * 0.04)
        if item_id in score_map:
            score_map[item_id]["score"] = round(min(0.99, score_map[item_id]["score"] + (weighted * 0.25)), 4)
            continue
        score_map[item_id] = {**item, "score": round(min(0.99, weighted), 4), "reason": "popularity_fallback"}

    ranked = sorted(score_map.values(), key=lambda row: decimal_from_any(row.get("score"), 0), reverse=True)

    # Diversify: avoid returning only one reason/type when list is long.
    if len(ranked) > 3:
        first = ranked[0]
        others = [row for row in ranked[1:] if str(row.get("reason")) != str(first.get("reason"))]
        if others:
            ranked = [first, others[0]] + [row for row in ranked[1:] if row is not others[0]]

    return ranked[:safe_limit]


def build_revenue_forecast_from_history(branch_id: str, days: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    now = datetime.now(timezone.utc)
    history = historical_daily_revenue(branch_id, 120)
    if not history:
        baseline = 4_200_000.0
        points = []
        for idx in range(days):
            predicted = baseline * (1 + (0.015 * ((idx % 7) - 3)))
            points.append(
                {
                    "date": (now + timedelta(days=idx)).date().isoformat(),
                    "predictedRevenue": int(max(0.0, predicted)),
                    "confidenceLow": int(max(0.0, predicted * 0.86)),
                    "confidenceHigh": int(max(0.0, predicted * 1.14)),
                    "confidence": 0.75,
                }
            )
        return points, {"source": "fallback", "historyDays": 0, "baseline": baseline}

    series: list[tuple[datetime.date, float]] = []
    for row in history:
        date_raw = str(row.get("date") or "")[:10]
        try:
            date_value = datetime.fromisoformat(date_raw).date()
        except Exception:
            continue
        revenue_value = max(0.0, decimal_from_any(row.get("revenue"), 0))
        series.append((date_value, revenue_value))
    if not series:
        baseline = 4_200_000.0
        points = []
        for idx in range(days):
            predicted = baseline * (1 + (0.015 * ((idx % 7) - 3)))
            points.append(
                {
                    "date": (now + timedelta(days=idx)).date().isoformat(),
                    "predictedRevenue": int(max(0.0, predicted)),
                    "confidenceLow": int(max(0.0, predicted * 0.86)),
                    "confidenceHigh": int(max(0.0, predicted * 1.14)),
                    "confidence": 0.75,
                }
            )
        return points, {"source": "fallback", "historyDays": 0, "baseline": baseline}

    values = [value for _, value in series]
    mean_value = sum(values) / len(values)
    day_factors = {idx: [] for idx in range(7)}
    for day, value in series:
        day_factors[day.weekday()].append(value)
    weekday_factor: dict[int, float] = {}
    for weekday in range(7):
        weekday_avg = sum(day_factors[weekday]) / len(day_factors[weekday]) if day_factors[weekday] else mean_value
        weekday_factor[weekday] = weekday_avg / max(mean_value, 1.0)

    trend_window = min(14, len(values))
    recent_avg = sum(values[-trend_window:]) / trend_window
    past_avg = sum(values[-(trend_window * 2):-trend_window]) / trend_window if len(values) >= trend_window * 2 else mean_value
    trend_ratio = recent_avg / max(past_avg, 1.0)
    trend_ratio = max(0.85, min(1.2, trend_ratio))

    mape_proxy = min(25.0, max(5.0, abs(trend_ratio - 1.0) * 100 + 7.5))
    confidence_band = max(0.08, min(0.2, mape_proxy / 100))
    confidence_score = round(max(0.65, min(0.9, 1 - (mape_proxy / 100))), 2)

    points: list[dict[str, Any]] = []
    for idx in range(days):
        forecast_date = (now + timedelta(days=idx)).date()
        seasonal = weekday_factor.get(forecast_date.weekday(), 1.0)
        step_trend = 1 + ((trend_ratio - 1) * min(1.0, idx / max(1, days - 1)))
        predicted = max(0.0, mean_value * seasonal * step_trend)
        points.append(
            {
                "date": forecast_date.isoformat(),
                "predictedRevenue": int(predicted),
                "confidenceLow": int(max(0.0, predicted * (1 - confidence_band))),
                "confidenceHigh": int(max(0.0, predicted * (1 + confidence_band))),
                "confidence": confidence_score,
            }
        )

    metadata = {
        "source": "history-derived",
        "historyDays": len(series),
        "meanDailyRevenue": int(mean_value),
        "trendRatio": round(trend_ratio, 4),
        "mapeProxy": round(mape_proxy, 2),
    }
    return points, metadata


def top_negative_issues(texts: list[str], limit: int = 3) -> list[dict[str, Any]]:
    topic_counts: dict[str, int] = {key: 0 for key in ISSUE_TOPIC_KEYWORDS.keys()}
    fallback_token_counts: dict[str, int] = {}
    stop_words = {
        "la", "va", "cho", "khong", "qua", "rat", "bi", "toi", "ban", "quan",
        "phuc", "vu", "mon", "nhan", "vien", "khach", "nay", "kia", "roi",
    }
    for text in texts:
        normalized = normalize_text_for_sentiment(text)
        tokens = [token.strip() for token in normalized.split() if token.strip()]
        token_set = set(tokens)
        matched_topic = False
        for topic, keywords in ISSUE_TOPIC_KEYWORDS.items():
            if token_set.intersection(keywords):
                topic_counts[topic] += 1
                matched_topic = True
        if not matched_topic:
            for token in tokens:
                if len(token) < 3 or token in stop_words:
                    continue
                fallback_token_counts[token] = fallback_token_counts.get(token, 0) + 1
    ranked_topics = sorted(
        [(topic, count) for topic, count in topic_counts.items() if count > 0],
        key=lambda item: item[1],
        reverse=True,
    )
    issues = [{"issue": topic, "count": count} for topic, count in ranked_topics]
    if len(issues) < limit and fallback_token_counts:
        fallback_ranked = sorted(fallback_token_counts.items(), key=lambda item: item[1], reverse=True)
        for token, count in fallback_ranked:
            if len(issues) >= limit:
                break
            issues.append({"issue": token, "count": count})
    return issues[: max(1, min(limit, 10))]


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
                    rebuild_revenue_forecast_internal(ForecastRebuildPayload(branchId=branch_id, days=7, granularity="daily"))
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


@app.get("/api/ai/live")
def live() -> dict[str, Any]:
    return {"status": "alive", "service": "ai-service", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/ai/ready")
def ready() -> dict[str, Any]:
    db_ok = True
    db_reason = "not-configured"
    if REPORT_DATABASE_URL:
        try:
            with psycopg.connect(REPORT_DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("SET LOCAL statement_timeout = '1000ms'")
                    cur.execute("SELECT 1")
            db_reason = "ok"
        except Exception as error:
            db_ok = False
            db_reason = f"error:{error.__class__.__name__}"

    kb_ok = int(KB_STATE.get("itemCount", len(DEFAULT_MENU_KB))) > 0
    status = "ready" if db_ok and kb_ok else "degraded"
    return {
        "status": status,
        "service": "ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "database": {"ok": db_ok, "reason": db_reason},
            "knowledgeBase": {"ok": kb_ok, "itemCount": int(KB_STATE.get("itemCount", len(DEFAULT_MENU_KB)))},
            "rbac": {"enforce": AI_ENFORCE_RBAC, "allowLegacyNoAuth": AI_ALLOW_LEGACY_NO_AUTH},
        },
    }


def rebuild_revenue_forecast_internal(payload: ForecastRebuildPayload) -> dict[str, Any]:
    payload.branchId = normalize_branch_id(payload.branchId)
    payload.days = max(1, min(payload.days, 30))
    generated, forecast_meta = build_revenue_forecast_from_history(payload.branchId, payload.days)

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
                                decimal_from_any(forecast_meta.get("mapeProxy"), 12.5),
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
        metadata={"days": payload.days, "persisted": persisted, **forecast_meta},
    )
    return {
        "branchId": payload.branchId,
        "days": payload.days,
        "granularity": payload.granularity,
        "persisted": persisted,
        "items": generated,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
        "source": str(forecast_meta.get("source") or "fallback"),
        "meta": forecast_meta,
    }


@app.post("/api/ai/forecast/revenue/rebuild")
@metric_guard("forecast_revenue_rebuild")
def rebuild_revenue_forecast(payload: ForecastRebuildPayload, request: Request) -> dict[str, Any]:
    enforce_rate_limit(request, "forecast_rebuild", AI_RATE_LIMIT_PER_MINUTE)
    return rebuild_revenue_forecast_internal(payload)


@app.post("/api/ai/kb/reload")
@metric_guard("kb_reload")
def kb_reload() -> dict[str, Any]:
    payload = reload_knowledge_base(source="manual-api")
    return {"success": True, **payload}


@app.get("/api/ai/forecast/revenue")
@metric_guard("forecast_revenue")
def forecast_revenue(request: Request, branchId: str, days: int = 7, granularity: str = "daily") -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
                    "available": True,
                }
        except Exception:
            pass

    forecasts, forecast_meta = build_revenue_forecast_from_history(branchId, days)
    log_audit("/api/ai/forecast/revenue", "predict", True, branchId)
    return {
        "branchId": branchId,
        "generatedAt": now.isoformat(),
        "granularity": granularity,
        "forecasts": forecasts,
        "modelVersion": AI_ACTIVE_MODEL_VERSION,
        "mape": decimal_from_any(forecast_meta.get("mapeProxy"), 12.5),
        "source": str(forecast_meta.get("source") or "fallback"),
        "available": True,
        "meta": forecast_meta,
    }


@app.get("/api/ai/forecast/revenue/hourly")
@metric_guard("forecast_hourly")
def forecast_revenue_hourly(request: Request, branchId: str) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
def forecast_inventory(request: Request, branchId: str, days: int = 7) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
def forecast_staffing(request: Request, branchId: str) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
    cart_seed = [customerId] if customerId else []
    cooccurrence_items = get_cooccurrence_items(branchId, cart_seed, safe_limit) if customerId else []
    popular_items = get_popular_items(branchId, max(safe_limit * 2, safe_limit))
    items = merge_recommendation_candidates(cooccurrence_items, popular_items, cart_seed, safe_limit)
    strategy = "hybrid-cf-popularity" if cooccurrence_items else "popularity"
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
    cooccurrence_items = get_cooccurrence_items(payload.branchId, payload.cartItemIds, max(safe_limit * 2, safe_limit))
    popular_items = get_popular_items(payload.branchId, max(safe_limit * 2, safe_limit))
    response_items = merge_recommendation_candidates(cooccurrence_items, popular_items, payload.cartItemIds, safe_limit)
    strategy = "item-based-cf+popularity" if cooccurrence_items else "popularity"
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
def anomalies(request: Request, branchId: str, severity: str | None = None) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
    branchId = normalize_branch_id(branchId)
    db_items = load_anomalies_from_db(branchId, severity)
    if db_items:
        return {"branchId": branchId, "items": db_items, "source": "db", "available": True}

    filtered = [a for a in ANOMALIES if a["branchId"] == branchId]
    if severity:
        filtered = [a for a in filtered if a["severity"] == severity.upper()]
    log_audit("/api/ai/anomalies", "list", True, branchId)
    return {"branchId": branchId, "items": filtered, "source": "fallback", "available": True}


@app.post("/api/ai/anomalies/detect")
@metric_guard("anomaly_detect")
def detect_anomaly(payload: AnomalyDetectPayload, request: Request) -> dict[str, Any]:
    enforce_rate_limit(request, "anomaly_detect", AI_RATE_LIMIT_PER_MINUTE)
    authorize_request(request, payload.branchId, {"ADMIN", "MANAGER"})
    payload.branchId = normalize_branch_id(payload.branchId)
    if payload.baselineStd < 0:
        raise HTTPException(status_code=400, detail="baselineStd must be >= 0")

    z_score = 0.0 if payload.baselineStd == 0 else (payload.value - payload.baselineMean) / payload.baselineStd
    robust_scale = max(payload.baselineStd, abs(payload.baselineMean) * 0.15, 1.0)
    robust_z_score = (payload.value - payload.baselineMean) / robust_scale
    combined_score = (abs(z_score) * 0.6) + (abs(robust_z_score) * 0.4)
    severity = calculate_anomaly_severity(combined_score)
    score = min(1.0, combined_score / 5.0)
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
        "explanation": {
            "value": payload.value,
            "baselineMean": payload.baselineMean,
            "baselineStd": payload.baselineStd,
            "zScore": round(z_score, 4),
            "robustZScore": round(robust_z_score, 4),
            "combinedScore": round(combined_score, 4),
        },
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
                    "robustZScore": round(robust_z_score, 4),
                    "combinedScore": round(combined_score, 4),
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
        metadata={
            "severity": severity,
            "zScore": round(z_score, 4),
            "robustZScore": round(robust_z_score, 4),
            "combinedScore": round(combined_score, 4),
            "persisted": persisted,
            "notified": notified,
        },
    )
    return {
        **created,
        "zScore": round(z_score, 4),
        "robustZScore": round(robust_z_score, 4),
        "combinedScore": round(combined_score, 4),
        "persisted": persisted,
        "notified": notified,
    }


@app.put("/api/ai/anomalies/{anomaly_id}/resolve")
@metric_guard("anomaly_resolve")
def resolve_anomaly(anomaly_id: str, payload: ResolveAnomalyPayload, request: Request) -> dict[str, Any]:
    # branch scope check follows anomaly lookup; role check first.
    actor = authorize_request(request, None, {"ADMIN", "MANAGER"})
    for item in ANOMALIES:
        if item["id"] == anomaly_id:
            if actor["role"] == "MANAGER":
                item_branch = str(item.get("branchId") or "").strip()
                actor_branch = str(actor.get("branchId") or "").strip()
                if item_branch and actor_branch and item_branch != actor_branch:
                    raise HTTPException(status_code=403, detail="Manager cannot resolve anomaly of other branch")
            item["isResolved"] = True
            item["resolvedAt"] = datetime.now(timezone.utc).isoformat()
            item["resolutionNote"] = payload.note
            log_audit("/api/ai/anomalies/resolve", "resolve", True, item.get("branchId"))
            return {"success": True, "item": item}
    log_audit("/api/ai/anomalies/resolve", "resolve", False)
    return {"success": False, "message": "Anomaly not found"}


@app.get("/api/ai/anomalies/summary")
@metric_guard("anomaly_summary")
def anomalies_summary(request: Request, branchId: str) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
    branchId = normalize_branch_id(branchId)
    items = anomalies(request, branchId).get("items", [])
    resolved = sum(1 for a in items if a.get("isResolved"))
    log_audit("/api/ai/anomalies/summary", "summary", True, branchId)
    return {"branchId": branchId, "total": len(items), "resolved": resolved, "open": len(items) - resolved}


@app.get("/api/ai/sentiment/summary")
@metric_guard("sentiment_summary")
def sentiment_summary(request: Request, branchId: str) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
                    "source": "db",
                }
        except Exception:
            pass

    log_audit("/api/ai/sentiment/summary", "summary", True, branchId)
    return {"branchId": branchId, "positive": 0.78, "neutral": 0.15, "negative": 0.07, "sampleSize": 120, "modelVersion": AI_ACTIVE_MODEL_VERSION, "source": "fallback"}


@app.get("/api/ai/sentiment/trend")
@metric_guard("sentiment_trend")
def sentiment_trend(request: Request, branchId: str, days: int = 7) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
def sentiment_issues_top(request: Request, branchId: str, days: int = 7, limit: int = 3) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
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
def sentiment_analyze(payload: SentimentAnalyzePayload, request: Request) -> dict[str, Any]:
    authorize_request(request, payload.branchId, {"ADMIN", "MANAGER"})
    payload.branchId = normalize_branch_id(payload.branchId)
    label, confidence, scores, explanation = classify_sentiment(payload.text)
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
                            "vi_weighted_lexicon_v2",
                            AI_ACTIVE_MODEL_VERSION,
                        ),
                    )
            persisted = True
        except Exception:
            persisted = False
    log_audit(
        "/api/ai/sentiment/analyze",
        "analyze",
        True,
        payload.branchId,
        metadata={"label": label, "positiveScore": explanation.get("positiveScore"), "negativeScore": explanation.get("negativeScore")},
    )
    return {
        "branchId": payload.branchId,
        "label": label,
        "confidence": confidence,
        "scores": scores,
        "persisted": persisted,
        "reason": "vi_weighted_lexicon_v2",
        "explanation": explanation,
    }


@app.post("/api/ai/chat")
@metric_guard("chat")
def ai_chat(payload: ChatPayload, request: Request) -> dict[str, Any]:
    enforce_rate_limit(request, "ai_chat", AI_RATE_LIMIT_CHAT_PER_MINUTE)
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
def ai_chat_history(request: Request, branchId: str | None = None, limit: int = 20) -> dict[str, Any]:
    authorize_request(request, branchId, {"ADMIN", "MANAGER"})
    records = CHAT_HISTORY
    if branchId:
        records = [item for item in records if item.get("branchId") == branchId]
    return {"items": records[-max(1, min(limit, 50)) :]}


@app.get("/api/ai/chat/suggestions")
@metric_guard("chat_suggestions")
def ai_chat_suggestions(request: Request) -> dict[str, Any]:
    authorize_request(request, None, {"ADMIN", "MANAGER"})
    return {"items": ["Doanh thu hôm nay so với hôm qua?", "Món bán chạy nhất tuần này?", "Có cảnh báo bất thường nào đang mở?", "Tồn kho nguyên liệu nào sắp hết?"]}


@app.post("/api/ai/report-chat")
@metric_guard("report_chat")
def report_chat(payload: ReportChatPayload, request: Request) -> dict[str, Any]:
    enforce_rate_limit(request, "report_chat", AI_RATE_LIMIT_REPORT_CHAT_PER_MINUTE)
    start = time.perf_counter()
    question = str(payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    branch_id = normalize_branch_id(payload.branchId) if payload.branchId is not None else None
    role = str(payload.role or "MANAGER").upper()
    actor = authorize_request(request, branch_id, {"ADMIN", "MANAGER"})
    if actor["role"] == "ADMIN":
        role = "ADMIN"
    elif actor["role"] == "MANAGER":
        role = "MANAGER"
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
