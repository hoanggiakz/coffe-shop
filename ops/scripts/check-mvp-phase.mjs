import { performance } from 'node:perf_hooks';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const baseUrl = process.env.BASE_URL || 'https://localhost';
const adminEmail = process.env.ADMIN_EMAIL || 'admin.test@coffeeshop.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

const startedAt = performance.now();
const results = [];

function ok(name, detail) {
  results.push({ name, status: 'PASS', detail });
}

function fail(name, detail) {
  results.push({ name, status: 'FAIL', detail });
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data, url };
}

async function main() {
  let token = '';

  try {
    const login = await request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (!login.response.ok || !login.data?.accessToken) {
      fail('User login', `HTTP ${login.response.status} at ${login.url}`);
      throw new Error('Cannot continue without token');
    }
    token = login.data.accessToken;
    ok('User login', 'Admin login successful');
  } catch (error) {
    fail('User login', String(error.message || error));
    summarizeAndExit(1);
    return;
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Gateway + profile
  {
    const profile = await request('/api/users/profile', { headers: authHeaders });
    if (profile.response.ok) ok('User profile', 'Profile endpoint accessible');
    else fail('User profile', `HTTP ${profile.response.status}`);
  }

  // Table service + QR
  let tableId = '';
  {
    const tablesRes = await request('/api/tables', { headers: authHeaders });
    if (tablesRes.response.ok && Array.isArray(tablesRes.data)) {
      if (tablesRes.data.length > 0) {
        tableId = String(tablesRes.data[0].id || '');
      }
      ok('Table list', `Fetched ${tablesRes.data.length} tables`);
    } else {
      fail('Table list', `HTTP ${tablesRes.response.status}`);
    }

    if (!tableId) {
      const createRes = await request('/api/tables', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ number: 999, capacity: 4, area: 'MVP-TEST' }),
      });
      if (createRes.response.ok && createRes.data?.id) {
        tableId = String(createRes.data.id);
        ok('Table create', `Created table ${tableId}`);
      } else {
        fail('Table create', `HTTP ${createRes.response.status}`);
      }
    }

    if (tableId) {
      const qrRes = await request(`/api/tables/${encodeURIComponent(tableId)}/qr`, { headers: authHeaders });
      if (qrRes.response.ok && typeof qrRes.data?.qrCode === 'string' && qrRes.data.qrCode.startsWith('data:image/')) {
        ok('Table QR', 'QR base64 generated');
      } else {
        fail('Table QR', `HTTP ${qrRes.response.status}`);
      }
    }
  }

  // Order service flow
  let orderId = '';
  let orderItemId = '';
  {
    const menuRes = await request('/api/orders/menu');
    let menuItemId = '';
    if (menuRes.response.ok && Array.isArray(menuRes.data) && menuRes.data.length > 0) {
      menuItemId = String(menuRes.data[0].id || '');
      ok('Menu list', `Fetched ${menuRes.data.length} menu items`);
    } else {
      fail('Menu list', `HTTP ${menuRes.response.status}`);
    }

    if (tableId && menuItemId) {
      const createOrder = await request('/api/orders', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tableId,
          customerName: 'MVP Test',
          items: [{ menuItemId, quantity: 1 }],
        }),
      });
      if (createOrder.response.ok && createOrder.data?.id) {
        orderId = String(createOrder.data.id);
        orderItemId = String(createOrder.data?.orderItems?.[0]?.id || '');
        ok('Order create', `Created order ${orderId}`);
      } else {
        fail('Order create', `HTTP ${createOrder.response.status}`);
      }
    }

    if (tableId) {
      const byTable = await request(`/api/orders?tableId=${encodeURIComponent(tableId)}`, { headers: authHeaders });
      if (byTable.response.ok && Array.isArray(byTable.data)) ok('Order by table', `Fetched ${byTable.data.length} orders`);
      else fail('Order by table', `HTTP ${byTable.response.status}`);
    }

    if (orderId) {
      const updateOrder = await request(`/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: 'PREPARING' }),
      });
      if (updateOrder.response.ok) ok('Order status update', 'Updated to PREPARING');
      else fail('Order status update', `HTTP ${updateOrder.response.status}`);
    }

    if (orderId && orderItemId) {
      const updateItem = await request(`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}/status`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: 'DONE' }),
      });
      if (updateItem.response.ok) ok('Order item status update', 'Updated item to DONE');
      else fail('Order item status update', `HTTP ${updateItem.response.status}`);
    }
  }

  // Chat flow
  {
    let chatId = '';
    const createChat = await request('/api/chats', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tableId: tableId || 'mvp-table', customerName: 'MVP Customer' }),
    });
    if (createChat.response.ok && createChat.data?.id) {
      chatId = String(createChat.data.id);
      ok('Chat create', `Created chat ${chatId}`);
    } else {
      fail('Chat create', `HTTP ${createChat.response.status}`);
    }

    if (chatId) {
      const sendMsg = await request(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          senderType: 'CUSTOMER',
          senderName: 'MVP Customer',
          content: 'MVP chat message',
        }),
      });
      if (sendMsg.response.ok) ok('Chat send message', 'Message created');
      else fail('Chat send message', `HTTP ${sendMsg.response.status}`);

      const listMsg = await request(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
        headers: authHeaders,
      });
      if (listMsg.response.ok && Array.isArray(listMsg.data)) ok('Chat message list', `Fetched ${listMsg.data.length} messages`);
      else fail('Chat message list', `HTTP ${listMsg.response.status}`);
    }
  }

  summarizeAndExit(0);
}

function summarizeAndExit(defaultCode) {
  const durationMs = Math.round(performance.now() - startedAt);
  const passed = results.filter((item) => item.status === 'PASS').length;
  const failed = results.filter((item) => item.status === 'FAIL').length;

  console.log(JSON.stringify({
    phase: 'MVP',
    baseUrl,
    passed,
    failed,
    durationMs,
    results,
  }, null, 2));

  process.exit(failed > 0 ? 1 : defaultCode);
}

main().catch((error) => {
  fail('Unhandled error', String(error.message || error));
  summarizeAndExit(1);
});


