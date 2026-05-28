const baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:18080/api';
const managerEmail = process.env.AI_E2E_MANAGER_EMAIL || 'manager.central@coffeeshop.local';
const managerPassword = process.env.AI_E2E_MANAGER_PASSWORD || 'Manager@123';
const branchId = process.env.AI_E2E_BRANCH_ID || 'branch-e2e';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
  }
  return data;
}

async function login() {
  const payload = await call('POST', '/users/login', null, {
    email: managerEmail,
    password: managerPassword,
  });
  const token = payload?.accessToken || payload?.token;
  assert(typeof token === 'string' && token.length > 20, 'Missing access token from login');
  return token;
}

async function run() {
  const token = await login();

  const health = await call('GET', '/ai/health', token);
  assert(health?.status === 'ok', 'Invalid /ai/health response');

  const forecast = await call('GET', `/ai/forecast/revenue?branchId=${encodeURIComponent(branchId)}&days=7`, token);
  assert(Array.isArray(forecast?.forecasts), 'Forecast contract mismatch');

  const forecastHourly = await call('GET', `/ai/forecast/revenue/hourly?branchId=${encodeURIComponent(branchId)}`, token);
  assert(Array.isArray(forecastHourly?.points), 'Hourly forecast contract mismatch');

  const forecastInventory = await call('GET', `/ai/forecast/inventory?branchId=${encodeURIComponent(branchId)}`, token);
  assert(Array.isArray(forecastInventory?.items), 'Inventory forecast contract mismatch');

  const forecastStaffing = await call('GET', `/ai/forecast/staffing?branchId=${encodeURIComponent(branchId)}`, token);
  assert(Array.isArray(forecastStaffing?.shifts), 'Staffing forecast contract mismatch');

  const recommend = await call('GET', `/ai/recommend?branchId=${encodeURIComponent(branchId)}&limit=5`, token);
  assert(Array.isArray(recommend?.items), 'Recommend contract mismatch');

  const recommendPopular = await call('GET', `/ai/recommend/popular?branchId=${encodeURIComponent(branchId)}&limit=5`, token);
  assert(Array.isArray(recommendPopular?.items), 'Recommend popular contract mismatch');

  const feedback = await call('POST', '/ai/recommend/feedback', token, {
    branchId,
    sourceItemId: 'item-1',
    targetItemId: 'item-2',
    action: 'click',
  });
  assert(feedback?.accepted === true, 'Recommend feedback contract mismatch');

  const anomalies = await call('GET', `/ai/anomalies?branchId=${encodeURIComponent(branchId)}`, token);
  assert(Array.isArray(anomalies?.items), 'Anomalies contract mismatch');

  const anomalyId = anomalies.items[0]?.id;
  if (anomalyId) {
    const resolved = await call('PUT', `/ai/anomalies/${encodeURIComponent(anomalyId)}/resolve`, token, { note: 'verified in e2e' });
    assert(resolved?.success === true, 'Resolve anomaly contract mismatch');
  }

  const anomalySummary = await call('GET', `/ai/anomalies/summary?branchId=${encodeURIComponent(branchId)}`, token);
  assert(typeof anomalySummary?.total === 'number', 'Anomaly summary contract mismatch');

  const sentimentSummary = await call('GET', `/ai/sentiment/summary?branchId=${encodeURIComponent(branchId)}`, token);
  assert(typeof sentimentSummary?.positive === 'number', 'Sentiment summary contract mismatch');

  const sentimentTrend = await call('GET', `/ai/sentiment/trend?branchId=${encodeURIComponent(branchId)}&days=7`, token);
  assert(Array.isArray(sentimentTrend?.points), 'Sentiment trend contract mismatch');

  const sentimentAnalyze = await call('POST', '/ai/sentiment/analyze', token, { branchId, text: 'Dịch vụ rất tốt' });
  assert(typeof sentimentAnalyze?.label === 'string', 'Sentiment analyze contract mismatch');

  const chat = await call('POST', '/ai/chat', token, { branchId, question: 'Doanh thu hôm nay?' });
  assert(typeof chat?.answer === 'string', 'Chat contract mismatch');

  const chatHistory = await call('GET', `/ai/chat/history?branchId=${encodeURIComponent(branchId)}&limit=10`, token);
  assert(Array.isArray(chatHistory?.items), 'Chat history contract mismatch');

  const suggestions = await call('GET', '/ai/chat/suggestions', token);
  assert(Array.isArray(suggestions?.items), 'Chat suggestions contract mismatch');

  console.log('AI contract E2E PASSED');
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
