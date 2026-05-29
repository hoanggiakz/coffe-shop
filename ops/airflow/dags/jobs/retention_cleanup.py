import os
from datetime import datetime

import psycopg


report_db_url = os.getenv("REPORT_DATABASE_URL", "").strip()
forecast_days = int(os.getenv("AI_RETENTION_FORECAST_DAYS", "180"))
anomaly_days = int(os.getenv("AI_RETENTION_ANOMALY_DAYS", "365"))
chat_days = int(os.getenv("AI_RETENTION_CHATLOG_DAYS", "90"))

if not report_db_url:
    print("retention_cleanup: missing REPORT_DATABASE_URL, skipping")
else:
    with psycopg.connect(report_db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM sales_forecast WHERE "generatedAt" < NOW() - (%s || \' days\')::interval', (forecast_days,))
            cur.execute('DELETE FROM anomaly_alert WHERE "detectedAt" < NOW() - (%s || \' days\')::interval', (anomaly_days,))
            cur.execute('DELETE FROM chatbot_query_log WHERE "createdAt" < NOW() - (%s || \' days\')::interval', (chat_days,))

    print(
        f"[{datetime.utcnow().isoformat()}] retention_cleanup: forecast={forecast_days}d anomaly={anomaly_days}d chat={chat_days}d"
    )
