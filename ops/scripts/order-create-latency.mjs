import { performance } from 'node:perf_hooks';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const baseUrl = process.env.BASE_URL || 'https://localhost';
const adminEmail = process.env.ADMIN_EMAIL || 'admin.test@coffeeshop.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
const iterations = Number(process.env.ORDER_ITERATIONS || 20);
const thresholdMs = Number(process.env.ORDER_THRESHOLD_MS || 1000);
const tableNumberStart = Number(process.env.TABLE_NUMBER_START || 7000);
const tableArea = process.env.TABLE_AREA || 'PERF-ORDER';

if (Number.isNaN(iterations) || iterations <= 0) {
  throw new Error('ORDER_ITERATIONS must be a positive number');
}
if (Number.isNaN(thresholdMs) || thresholdMs <= 0) {
  throw new Error('ORDER_THRESHOLD_MS must be a positive number');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, options = {}, retries = 3) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.status === 429 && retries > 0) {
    await sleep(400);
    return request(pathname, options, retries - 1);
  }
  return { response, data };
}

function summarizeDurations(durations) {
  if (!durations.length) {
    return { avgMs: null, p95Ms: null, minMs: null, maxMs: null };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((acc, item) => acc + item, 0);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avgMs: Number((sum / durations.length).toFixed(2)),
    p95Ms: Number(sorted[p95Index].toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

async function main() {
  const login = await request('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });

  if (!login.response.ok || !login.data?.accessToken) {
    const result = {
      target: `${baseUrl}/api/orders`,
      success: false,
      reason: 'LOGIN_FAILED',
      statusCode: login.response.status,
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  const authHeaders = {
    Authorization: `Bearer ${login.data.accessToken}`,
    'Content-Type': 'application/json',
  };

  const menu = await request('/api/orders/menu');
  if (!menu.response.ok || !Array.isArray(menu.data) || !menu.data.length || !menu.data[0]?.id) {
    const result = {
      target: `${baseUrl}/api/orders`,
      success: false,
      reason: 'MENU_NOT_READY',
      statusCode: menu.response.status,
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  const menuItemId = String(menu.data[0].id);
  const tableIds = [];
  const maxCreateAttempts = iterations * 5;
  let createAttempts = 0;

  while (tableIds.length < iterations && createAttempts < maxCreateAttempts) {
    createAttempts += 1;
    const tableNumber = tableNumberStart + createAttempts;
    const createTable = await request('/api/tables', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        number: tableNumber,
        capacity: 4,
        area: tableArea,
      }),
    });
    if (createTable.response.ok && createTable.data?.id) {
      tableIds.push(String(createTable.data.id));
    }
  }

  if (tableIds.length < iterations) {
    const result = {
      target: `${baseUrl}/api/orders`,
      success: false,
      reason: 'TABLE_PREPARE_FAILED',
      preparedTables: tableIds.length,
      expectedTables: iterations,
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  const durations = [];
  const successfulDurations = [];
  const errors = [];

  for (let i = 0; i < iterations; i += 1) {
    const tableId = tableIds[i];
    const startedAt = performance.now();

    const createOrder = await request('/api/orders', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tableId,
        customerName: `Perf Customer ${i + 1}`,
        items: [{ menuItemId, quantity: 1 }],
      }),
    });

    const elapsed = performance.now() - startedAt;
    durations.push(elapsed);

    if (createOrder.response.ok && createOrder.data?.id) {
      successfulDurations.push(elapsed);
    } else if (errors.length < 20) {
      errors.push({
        iteration: i + 1,
        statusCode: createOrder.response.status,
        detail: createOrder.data?.message || 'ORDER_CREATE_FAILED',
      });
    }
  }

  const failures = durations.length - successfulDurations.length;
  const stats = summarizeDurations(successfulDurations);
  const pass = failures === 0 && stats.avgMs !== null && stats.avgMs < thresholdMs;

  const result = {
    target: `${baseUrl}/api/orders`,
    iterations,
    thresholdMs,
    totalRequests: durations.length,
    successfulRequests: successfulDurations.length,
    failures,
    successRate: Number(((successfulDurations.length / durations.length) * 100).toFixed(2)),
    ...stats,
    pass,
    errors,
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        target: `${baseUrl}/api/orders`,
        success: false,
        reason: 'UNHANDLED_ERROR',
        error: String(error?.message || error),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});


