from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    response = client.get('/api/ai/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'


def test_recommend_get_contract():
    response = client.get('/api/ai/recommend', params={'branchId': 'branch-e2e', 'limit': 3})
    assert response.status_code == 200
    payload = response.json()
    assert payload['branchId'] == 'branch-e2e'
    assert len(payload['items']) == 3
    assert payload['strategy'] in ['popularity', 'user-history']


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
    assert payload['strategy'] in ['item-based-cf', 'popularity']


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
