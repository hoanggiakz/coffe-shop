from datetime import datetime

print(f"[{datetime.utcnow().isoformat()}] dbt_transform: run staging + mart models")
