from datetime import datetime

print(f"[{datetime.utcnow().isoformat()}] ingest_cdc: pull Debezium topics and load DW staging")
