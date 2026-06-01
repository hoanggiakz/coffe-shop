from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    response = client.get('/api/ai/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'


def test_live_and_ready():
    live = client.get('/api/ai/live')
    assert live.status_code == 200
    assert live.json().get('status') == 'alive'

    ready = client.get('/api/ai/ready')
    assert ready.status_code == 200
    assert ready.json().get('status') in ['ready', 'degraded']
    assert 'checks' in ready.json()


def test_quality_summary_contract():
    response = client.get('/api/ai/ops/quality-summary')
    assert response.status_code == 200
    payload = response.json()
    assert 'quality' in payload
    assert 'fallbackRatios' in payload


def test_fallback_trend_contract():
    response = client.get('/api/ai/ops/fallback-trend', params={'windowMinutes': 60})
    assert response.status_code == 200
    payload = response.json()
    assert 'points' in payload
    assert isinstance(payload.get('points'), list)


def test_recommend_get_contract():
    response = client.get('/api/ai/recommend', params={'branchId': 'branch-e2e', 'limit': 3})
    assert response.status_code == 200
    payload = response.json()
    assert payload['branchId'] == 'branch-e2e'
    assert len(payload['items']) == 3
    assert payload['strategy'] in ['popularity', 'hybrid-cf-popularity']


def test_recommend_post_contract():
    response = client.post(
        '/api/ai/recommend',
        json={
            'branchId': 'branch-e2e',
            'cartItemIds': ['item-1', 'item-2'],
            'limit': 3,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['branchId'] == 'branch-e2e'
    assert len(payload['recommendations']) == 3
    assert payload['strategy'] in ['item-based-cf+popularity', 'popularity']


def test_sentiment_analyze_contract():
    response = client.post(
        '/api/ai/sentiment/analyze',
        json={'branchId': 'branch-e2e', 'text': 'Phuc vu rat te va cho lau'},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['label'] in ['POSITIVE', 'NEUTRAL', 'NEGATIVE']
    assert 'scores' in payload


def test_chat_contract():
    response = client.post(
        '/api/ai/chat',
        json={
            'sessionId': 's1',
            'tableId': 't1',
            'branchId': 'branch-e2e',
            'message': 'Khuyen mai hien tai la gi?',
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['intent'] in ['FAQ', 'ORDER', 'ESCALATE']
    assert isinstance(payload['confidence'], float)
    assert 'reply' in payload


def test_recommend_invalid_limit():
    response = client.get('/api/ai/recommend', params={'branchId': 'branch-e2e', 'limit': 99})
    assert response.status_code == 400
    assert 'limit' in response.json().get('detail', '')


def test_recommend_missing_branch():
    response = client.post(
        '/api/ai/recommend',
        json={
            'branchId': '',
            'cartItemIds': ['item-1'],
            'limit': 3,
        },
    )
    assert response.status_code == 400
    assert 'branchId' in response.json().get('detail', '')


def test_chat_missing_message():
    response = client.post('/api/ai/chat', json={'branchId': 'branch-e2e'})
    assert response.status_code == 400


def test_kb_reload_endpoint():
    response = client.post('/api/ai/kb/reload')
    assert response.status_code == 200
    payload = response.json()
    assert payload.get('success') is True
    assert int(payload.get('itemCount', 0)) > 0


def test_forecast_rebuild_endpoint():
    response = client.post(
        '/api/ai/forecast/revenue/rebuild',
        json={'branchId': 'branch-e2e', 'days': 3, 'granularity': 'daily'},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get('branchId') == 'branch-e2e'
    assert int(payload.get('days', 0)) == 3
    assert isinstance(payload.get('items'), list)


def test_sentiment_issues_top_contract():
    response = client.get('/api/ai/sentiment/issues-top', params={'branchId': 'branch-e2e', 'days': 7, 'limit': 3})
    assert response.status_code == 200
    payload = response.json()
    assert payload.get('branchId') == 'branch-e2e'
    assert isinstance(payload.get('issues'), list)


def test_anomaly_detect_contract():
    response = client.post(
        '/api/ai/anomalies/detect',
        json={
            'branchId': 'branch-e2e',
            'type': 'ORDER_QTY',
            'value': 120,
            'baselineMean': 20,
            'baselineStd': 10,
            'referenceId': 'order-1',
            'referenceType': 'ORDER',
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get('branchId') == 'branch-e2e'
    assert payload.get('severity') in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    assert 'zScore' in payload
    assert 'notified' in payload


def test_report_chat_admin_contract():
    response = client.post(
        '/api/ai/report-chat',
        json={
            'branchId': 'branch-e2e',
            'userId': 'admin-1',
            'role': 'ADMIN',
            'question': 'Doanh thu hôm nay là bao nhiêu?',
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get('intent') in ['REVENUE_QUERY', 'TOP_ITEMS_QUERY', 'ANOMALY_QUERY', 'SENTIMENT_QUERY', 'GENERAL_QUERY']
    assert isinstance(payload.get('executionTimeMs'), int)
    assert payload.get('sql') is None or isinstance(payload.get('sql'), str)


def test_report_chat_manager_hides_sql():
    response = client.post(
        '/api/ai/report-chat',
        json={
            'branchId': 'branch-e2e',
            'userId': 'manager-1',
            'role': 'MANAGER',
            'question': 'Có cảnh báo bất thường nào không?',
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get('sql') is None
