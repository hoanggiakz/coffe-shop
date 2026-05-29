from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    response = client.get("/api/ai/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"


def test_recommend_contract():
    response = client.get("/api/ai/recommend", params={"branchId": "branch-e2e", "limit": 3})
    assert response.status_code == 200
    payload = response.json()
    assert payload["branchId"] == "branch-e2e"
    assert len(payload["items"]) == 3
