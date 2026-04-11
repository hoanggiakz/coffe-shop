
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const base = process.env.BASE_URL || 'https://localhost';
const adminEmail = process.env.ADMIN_EMAIL || 'admin.test@coffeeshop.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const today = new Date().toISOString().slice(0, 10);
const outDir = path.join(process.cwd(), 'reports', 'api-tests');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `remaining-apis-${runId}.json`);

const res = [];
const st = {
  token: '',
  branchId: '',
  staffId: '',
  employeeCode: '',
  shiftId: '',
  tableA: '',
  tableB: '',
  chatId: '',
  categoryId: '',
  optionGroupId: '',
  optionValueId: '',
  menuItemId: '',
  promoId: '',
  promoCode: '',
  orderId: '',
  orderItemId: '',
  ingredientId: '',
  syncIngredientId: `sync-${runId}`,
  cashOrderId: `ORD-CASH-${runId}`,
  cashPaymentId: '',
  vnpOrderId: `ORD-VNP-${runId}`,
  orderCustomerEmail: `order.${runId}@mail.local`,
};

function snip(v, n = 220) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}...` : s || '';
}

function push(entry) {
  res.push({ index: res.length + 1, ...entry });
}

function skip(name, detail) {
  push({ name, status: 'SKIP', detail });
}

async function api(name, method, path, expected = [200], body, token, binary = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  try {
    const r = await fetch(`${base}${path}`, { method, headers, body: payload });
    const ok = expected.includes(r.status);
    let data;
    if (binary) {
      const b = await r.arrayBuffer();
      data = { byteLength: b.byteLength };
    } else {
      const ct = String(r.headers.get('content-type') || '');
      data = ct.includes('application/json') ? await r.json() : await r.text();
    }

    push({
      name,
      method,
      path,
      expected,
      actual: r.status,
      status: ok ? 'PASS' : 'FAIL',
      detail: ok ? `HTTP ${r.status}` : `Expected ${expected.join('/')} got ${r.status}`,
      responsePreview: snip(data),
    });
    return { ok, status: r.status, data };
  } catch (e) {
    push({ name, method, path, expected, actual: 'NETWORK_ERROR', status: 'FAIL', detail: String(e?.message || e) });
    return { ok: false, status: 0, data: null };
  }
}

async function run() {
  await api('Gateway health', 'GET', '/');
  const login = await api('Admin login', 'POST', '/api/users/login', [200], { email: adminEmail, password: adminPassword });
  st.token = login.data?.accessToken || '';
  if (!st.token) {
    skip('Stop', 'Missing admin token');
    return finish();
  }
  const t = st.token;

  await api('User health', 'GET', '/api/users/health');
  await api('Table health', 'GET', '/api/tables/health');
  await api('Order health', 'GET', '/api/orders/health');
  await api('Chat health', 'GET', '/api/chats/health', [200], undefined, t);
  await api('Inventory health', 'GET', '/api/v1/ingredients/health', [200], undefined, t);
  await api('Payment health', 'GET', '/api/v1/payments/health');
  await api('Report health', 'GET', '/api/reports/health', [200], undefined, t);

  await api('User profile', 'GET', '/api/users/profile', [200], undefined, t);

  const b = await api('Create branch', 'POST', '/api/users/admin/branches', [201], { name: `Branch ${runId}`, address: 'Test', phone: '0901234567' }, t);
  st.branchId = b.data?.id || '';
  await api('List branches', 'GET', '/api/users/admin/branches?includeInactive=true', [200], undefined, t);

  const s = await api('Create staff', 'POST', '/api/users/staff', [201], {
    name: `Staff ${runId}`,
    email: `staff.${runId}@coffeeshop.local`,
    password: 'Pass@123',
    phone: `092${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
    role: 'BARISTA',
    preferredShift: 'MORNING',
    branchId: st.branchId || undefined,
  }, t);
  st.staffId = s.data?.id || '';
  st.employeeCode = s.data?.employeeCode || '';

  await api('List staff', 'GET', '/api/users/staff?includeInactive=true', [200], undefined, t);
  if (st.staffId) {
    await api('Update staff', 'PATCH', `/api/users/staff/${encodeURIComponent(st.staffId)}`, [200], { preferredShift: 'AFTERNOON' }, t);
    const sh = await api('Upsert schedule', 'POST', '/api/users/staff/schedules', [201], {
      staffId: st.staffId,
      shiftDate: today,
      shiftType: 'MORNING',
      note: 'smoke',
    }, t);
    st.shiftId = sh.data?.id || '';
    await api('Get schedules', 'GET', `/api/users/staff/schedules?staffId=${encodeURIComponent(st.staffId)}&weekStart=${today}`, [200], undefined, t);

    if (st.employeeCode) {
      await api('Check-in', 'POST', '/api/users/staff/attendance/check-in', [200], { identifier: st.employeeCode, method: 'EMPLOYEE_CODE' }, t);
      await api('Attendance list', 'GET', `/api/users/staff/attendance?staffId=${encodeURIComponent(st.staffId)}&dateFrom=${today}&dateTo=${today}`, [200], undefined, t);
      await api('Shift overview', 'GET', `/api/users/staff/shift-overview?staffId=${encodeURIComponent(st.staffId)}&date=${today}`, [200], undefined, t);
      await api('Check-out', 'POST', '/api/users/staff/attendance/check-out', [200], { identifier: st.employeeCode, method: 'EMPLOYEE_CODE' }, t);
    } else {
      skip('Check-in', 'No employee code');
      skip('Attendance list', 'No employee code');
      skip('Shift overview', 'No employee code');
      skip('Check-out', 'No employee code');
    }
    await api('Payroll', 'GET', `/api/users/staff/payroll?staffId=${encodeURIComponent(st.staffId)}&dateFrom=${today}&dateTo=${today}`, [200], undefined, t);
  }

  const otpPhone = `094${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`;
  const otp = await api('Customer OTP request', 'POST', '/api/users/customer/request-otp', [200], { phone: otpPhone });
  const otpCode = otp.data?.otp || '';
  if (otpCode) {
    await api('Customer register OTP', 'POST', '/api/users/customer/register-otp', [201], {
      name: `Otp Customer ${runId}`,
      phone: otpPhone,
      otp: otpCode,
      email: `otp.${runId}@mail.local`,
    });
  }

  const custEmail = `customer.${runId}@mail.local`;
  const custPhone = `093${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`;
  const custReg = await api('Customer register email', 'POST', '/api/users/customer/register-email', [201], {
    name: `Customer ${runId}`,
    email: custEmail,
    password: 'Pass@123',
    phone: custPhone,
  });
  const cToken = custReg.data?.accessToken || '';
  const cId = custReg.data?.user?.id || '';

  await api('Customer login email', 'POST', '/api/users/customer/login-email', [200], { email: custEmail, password: 'Pass@123' });
  if (cToken) {
    await api('Customer profile', 'GET', '/api/users/customer/profile', [200], undefined, cToken);
    await api('Customer offers', 'GET', '/api/users/customer/offers', [200], undefined, cToken);
  }
  if (cId) {
    await api('Customer points accrual', 'POST', '/api/users/customer/points/accrual', [200], { customerId: cId, orderId: `ORDER-${runId}`, amount: 200000 });
  }

  await api('List tables', 'GET', '/api/tables');
  const nA = 8000 + Math.floor(Math.random() * 500);
  const nB = nA + 1;
  const ta = await api('Create table A', 'POST', '/api/tables', [201], { number: nA, area: 'API_A', capacity: 4, branchId: st.branchId || undefined });
  const tb = await api('Create table B', 'POST', '/api/tables', [201], { number: nB, area: 'API_B', capacity: 4, branchId: st.branchId || undefined });
  st.tableA = ta.data?.id || '';
  st.tableB = tb.data?.id || '';

  if (st.tableA) {
    await api('Get table by id', 'GET', `/api/tables/${encodeURIComponent(st.tableA)}`);
    await api('Update table', 'PATCH', `/api/tables/${encodeURIComponent(st.tableA)}`, [200], { area: 'API_A_UPD', capacity: 6 });
    await api('Update table status', 'PATCH', `/api/tables/${encodeURIComponent(st.tableA)}/status`, [200], { status: 'AVAILABLE' });
    await api('Get table QR', 'GET', `/api/tables/${encodeURIComponent(st.tableA)}/qr`);
    await api('Batch QR', 'POST', '/api/tables/qr/batch', [200], { tableIds: [st.tableA, st.tableB].filter(Boolean) });
    await api('Call staff', 'POST', `/api/tables/${encodeURIComponent(st.tableA)}/call-staff`, [200], { reason: 'Need water' });
  }

  await api('List open chats', 'GET', '/api/chats', [200], undefined, t);
  if (st.tableA) {
    const ch = await api('Create chat', 'POST', '/api/chats', [201], { tableId: st.tableA, customerName: `Chat ${runId}` }, t);
    st.chatId = ch.data?.id || '';
    await api('Emit staff notification', 'POST', '/api/chats/staff-notifications', [201], {
      type: 'CHAT_MESSAGE', title: 'smoke', message: 'ping', tableId: st.tableA,
    }, t);
    if (st.chatId) {
      await api('Send chat message', 'POST', `/api/chats/${encodeURIComponent(st.chatId)}/messages`, [201], {
        senderType: 'CUSTOMER', senderName: 'Smoke', content: 'Hello',
      }, t);
      await api('List chat messages', 'GET', `/api/chats/${encodeURIComponent(st.chatId)}/messages`, [200], undefined, t);
      await api('Close chat', 'PATCH', `/api/chats/${encodeURIComponent(st.chatId)}/close`, [200], undefined, t);
    }
  }
  const m = await api('Menu list', 'GET', '/api/orders/menu');
  const firstMenu = Array.isArray(m.data) && m.data.length ? String(m.data[0].id || '') : '';

  await api('List menu categories', 'GET', '/api/orders/admin/menu/categories?includeInactive=true', [200], undefined, t);
  const cat = await api('Create menu category', 'POST', '/api/orders/admin/menu/categories', [201], {
    name: `Cat ${runId}`, description: 'smoke', sortOrder: 99, branchId: st.branchId || undefined,
  }, t);
  st.categoryId = cat.data?.id || '';
  if (st.categoryId) await api('Update menu category', 'PATCH', `/api/orders/admin/menu/categories/${encodeURIComponent(st.categoryId)}`, [200], { description: 'updated' }, t);

  await api('List option groups', 'GET', '/api/orders/admin/menu/options/groups?includeInactive=true', [200], undefined, t);
  const og = await api('Create option group', 'POST', '/api/orders/admin/menu/options/groups', [201], {
    name: `Size ${runId}`, type: 'SINGLE', isGlobal: true, sortOrder: 1, branchId: st.branchId || undefined,
  }, t);
  st.optionGroupId = og.data?.id || '';
  if (st.optionGroupId) {
    await api('Update option group', 'PATCH', `/api/orders/admin/menu/options/groups/${encodeURIComponent(st.optionGroupId)}`, [200], { name: `Size Upd ${runId}` }, t);
    const ov = await api('Create option value', 'POST', `/api/orders/admin/menu/options/groups/${encodeURIComponent(st.optionGroupId)}/values`, [201], {
      value: 'M', label: 'Medium', priceDelta: 5000, isDefault: true,
    }, t);
    st.optionValueId = ov.data?.id || '';
    if (st.optionValueId) await api('Update option value', 'PATCH', `/api/orders/admin/menu/options/values/${encodeURIComponent(st.optionValueId)}`, [200], { label: 'Medium Upd' }, t);
  }

  await api('List menu items admin', 'GET', '/api/orders/admin/menu/items?includeInactive=true', [200], undefined, t);
  const mi = await api('Create menu item', 'POST', '/api/orders/admin/menu/items', [201], {
    name: `Smoke Latte ${runId}`,
    price: 55000,
    description: 'smoke menu item',
    categoryId: st.categoryId || undefined,
    branchId: st.branchId || undefined,
    available: true,
    optionGroups: st.optionGroupId ? [{ groupId: st.optionGroupId, required: true, sortOrder: 0 }] : [],
    recipe: [],
  }, t);
  st.menuItemId = mi.data?.id || '';
  if (st.menuItemId) await api('Update menu item', 'PATCH', `/api/orders/admin/menu/items/${encodeURIComponent(st.menuItemId)}`, [200], { price: 56000 }, t);

  await api('List promotions', 'GET', '/api/orders/admin/promotions?includeInactive=true', [200], undefined, t);
  st.promoCode = `PROMO${String(Math.floor(Math.random() * 100000))}`;
  const pr = await api('Create promotion', 'POST', '/api/orders/admin/promotions', [201], {
    code: st.promoCode,
    description: 'smoke',
    discountType: 'PERCENT',
    discountValue: 10,
    appliesTo: 'ORDER',
    minOrderAmount: 0,
    isActive: true,
    branchId: st.branchId || undefined,
  }, t);
  st.promoId = pr.data?.id || '';
  if (st.promoId) await api('Update promotion', 'PATCH', `/api/orders/admin/promotions/${encodeURIComponent(st.promoId)}`, [200], { discountValue: 12 }, t);
  await api('Validate promotion', 'GET', `/api/orders/promotions/validate?code=${encodeURIComponent(st.promoCode)}&subtotal=120000`);

  const menuForOrder = st.menuItemId || firstMenu;
  if (st.tableA && menuForOrder) {
    const od = await api('Create order', 'POST', '/api/orders', [201], {
      tableId: st.tableA,
      branchId: st.branchId || undefined,
      customerName: 'Smoke Order Customer',
      customerEmail: st.orderCustomerEmail,
      customerPhone: '0900000000',
      items: [{ menuItemId: menuForOrder, quantity: 1, note: 'no sugar' }],
    }, t);
    st.orderId = od.data?.id || '';
    st.orderItemId = od.data?.orderItems?.[0]?.id || '';

    await api('List orders by table A', 'GET', `/api/orders?tableId=${encodeURIComponent(st.tableA)}`, [200], undefined, t);
    if (st.orderId) {
      await api('Get order by id', 'GET', `/api/orders/${encodeURIComponent(st.orderId)}`, [200], undefined, t);
      await api('Update customer order items', 'PATCH', `/api/orders/${encodeURIComponent(st.orderId)}/customer-items`, [200], {
        tableId: st.tableA,
        items: [{ menuItemId: menuForOrder, quantity: 2, note: 'less ice' }],
      }, t);
      const updItems = await api('Update order items', 'PATCH', `/api/orders/${encodeURIComponent(st.orderId)}/items`, [200], {
        items: [{ menuItemId: menuForOrder, quantity: 2, note: 'staff update' }],
      }, t);
      st.orderItemId = updItems.data?.orderItems?.[0]?.id || st.orderItemId;
      if (st.orderItemId) {
        await api('Update order item status', 'PATCH', `/api/orders/${encodeURIComponent(st.orderId)}/items/${encodeURIComponent(st.orderItemId)}/status`, [200], { status: 'DONE' }, t);
      }
      if (st.tableB) {
        await api('Transfer table action', 'POST', '/api/orders/table-actions/transfer', [200], {
          fromTableId: st.tableA,
          toTableId: st.tableB,
          mode: 'TRANSFER',
        }, t);
        await api('List orders by table B', 'GET', `/api/orders?tableId=${encodeURIComponent(st.tableB)}`, [200], undefined, t);
      }
      await api('Update order status COMPLETED', 'PATCH', `/api/orders/${encodeURIComponent(st.orderId)}/status`, [200], { status: 'COMPLETED' }, t);
      await api('Order history by email', 'GET', `/api/orders/history?email=${encodeURIComponent(st.orderCustomerEmail)}`, [200], undefined, t);
    }
  }

  if (st.promoId) await api('Disable promotion', 'POST', `/api/orders/admin/promotions/${encodeURIComponent(st.promoId)}/disable`, [200], undefined, t);

  const cp = await api('Create CASH payment', 'POST', '/api/v1/payments', [201], {
    orderId: st.cashOrderId, amount: 120000, provider: 'CASH', tableId: st.tableB || st.tableA || undefined, customerName: 'Cash Customer',
  });
  st.cashPaymentId = cp.data?.paymentId || '';
  await api('Get payment by order', 'GET', `/api/v1/payments/orders/${encodeURIComponent(st.cashOrderId)}`);
  if (st.cashPaymentId) {
    await api('Get payment by id', 'GET', `/api/v1/payments/${encodeURIComponent(st.cashPaymentId)}`);
    await api('Confirm CASH payment', 'POST', `/api/v1/payments/${encodeURIComponent(st.cashPaymentId)}/confirm-cash`, [200], {
      confirmedBy: 'API Smoke Staff', amountReceived: 130000,
    }, t);
  }
  await api('Create VIETQR payment', 'POST', '/api/v1/payments', [201], {
    orderId: st.vnpOrderId, amount: 150000, provider: 'VIETQR', tableId: st.tableB || st.tableA || undefined, customerName: 'VIETQR Customer',
  });
  await api('Handle payment return', 'POST', '/api/v1/payments/return', [200], {
    provider: 'VIETQR', orderId: st.vnpOrderId, resultCode: '0', message: 'success', transactionId: `txn-${runId}`,
  });
  await api('Webhook status check', 'POST', '/api/v1/payments/webhook', [200, 400], {
    provider: 'VIETQR', orderId: st.vnpOrderId, transactionId: `txn-${runId}`, status: 'PAID', signature: 'ignored',
    rawData: { provider: 'VIETQR', orderId: st.vnpOrderId, transactionId: `txn-${runId}`, status: 'PAID' },
  });

  await api('List ingredients', 'GET', '/api/v1/ingredients', [200], undefined, t);
  const ing = await api('Create ingredient', 'POST', '/api/v1/ingredients', [201], {
    name: `Ingredient ${runId}`, unit: 'kg', stock: 20, minStock: 5, importPrice: 100000, branchId: st.branchId || undefined,
  }, t);
  st.ingredientId = ing.data?.id || '';
  if (st.ingredientId) {
    await api('Update ingredient', 'PATCH', `/api/v1/ingredients/${encodeURIComponent(st.ingredientId)}`, [200], { minStock: 6, importPrice: 110000 }, t);
    await api('Import stock', 'POST', '/api/v1/ingredients/stock/import', [200], {
      ingredientId: st.ingredientId, type: 'IMPORT', quantity: 5, source: 'MANUAL', unitPrice: 100000, reason: 'Smoke import',
    }, t);
    await api('Create stock receipt', 'POST', '/api/v1/ingredients/stock/receipts', [201], {
      supplier: 'Smoke Supplier', note: 'Smoke receipt', items: [{ ingredientId: st.ingredientId, quantity: 3, unitPrice: 120000 }],
    }, t);
    await api('Adjust stock', 'POST', '/api/v1/ingredients/stock/adjust', [200], { ingredientId: st.ingredientId, actualStock: 25, reason: 'Stocktake' }, t);
    await api('Export stock bulk', 'POST', '/api/v1/ingredients/stock/export-bulk', [200], {
      items: [{ ingredientId: st.ingredientId, quantity: 1, note: 'Order export' }], source: 'ORDER', reason: 'Smoke export', referenceCode: `EXP-${runId}`,
    }, t);
    await api('Get stock movements', 'GET', `/api/v1/ingredients/stock/movements?ingredientId=${encodeURIComponent(st.ingredientId)}&limit=20`, [200], undefined, t);
    await api('Sync menu to inventory', 'POST', '/api/v1/ingredients/sync-menu', [200], {
      branchId: st.branchId || undefined, items: [{ id: st.syncIngredientId, name: `Synced ${runId}`, unit: 'portion' }],
    }, t);
    await api('Delete ingredient', 'DELETE', `/api/v1/ingredients/${encodeURIComponent(st.ingredientId)}`, [200], undefined, t);
    await api('Delete synced ingredient', 'DELETE', `/api/v1/ingredients/${encodeURIComponent(st.syncIngredientId)}`, [200], undefined, t);
  }

  await api('Report revenue', 'GET', `/api/reports/revenue?dateFrom=${today}&dateTo=${today}&groupBy=day`, [200], undefined, t);
  await api('Report top items', 'GET', `/api/reports/top-items?dateFrom=${today}&dateTo=${today}&limit=10`, [200], undefined, t);
  await api('Report inventory', 'GET', `/api/reports/inventory?dateFrom=${today}&dateTo=${today}&includeMovements=true&movementLimit=50`, [200], undefined, t);
  await api('Report staff performance', 'GET', `/api/reports/staff-performance?dateFrom=${today}&dateTo=${today}&limit=10`, [200], undefined, t);
  await api('Report dashboard', 'GET', `/api/reports/dashboard?dateFrom=${today}&dateTo=${today}&groupBy=day`, [200], undefined, t);
  await api('Report daily stats', 'GET', `/api/reports/daily-stats?dateFrom=${today}&dateTo=${today}`, [200], undefined, t);
  await api('Report export excel', 'GET', `/api/reports/export?reportType=revenue&format=excel&dateFrom=${today}&dateTo=${today}`, [200], undefined, t, true);

  if (st.menuItemId) await api('Delete menu item', 'DELETE', `/api/orders/admin/menu/items/${encodeURIComponent(st.menuItemId)}`, [200], undefined, t);
  if (st.optionValueId) await api('Delete option value', 'DELETE', `/api/orders/admin/menu/options/values/${encodeURIComponent(st.optionValueId)}`, [200], undefined, t);
  if (st.optionGroupId) await api('Delete option group', 'DELETE', `/api/orders/admin/menu/options/groups/${encodeURIComponent(st.optionGroupId)}`, [200], undefined, t);
  if (st.categoryId) await api('Delete category', 'DELETE', `/api/orders/admin/menu/categories/${encodeURIComponent(st.categoryId)}`, [200], undefined, t);
  if (st.tableA) await api('Delete table A', 'DELETE', `/api/tables/${encodeURIComponent(st.tableA)}`);
  if (st.tableB) await api('Delete table B', 'DELETE', `/api/tables/${encodeURIComponent(st.tableB)}`, [200, 409]);
  if (st.shiftId) await api('Delete schedule', 'DELETE', `/api/users/staff/schedules/${encodeURIComponent(st.shiftId)}`, [204], undefined, t);
  if (st.staffId) await api('Delete staff', 'DELETE', `/api/users/staff/${encodeURIComponent(st.staffId)}`, [200], undefined, t);
  if (st.branchId) await api('Delete branch', 'DELETE', `/api/users/admin/branches/${encodeURIComponent(st.branchId)}`, [200], undefined, t);

  finish();
}

function finish() {
  const summary = {
    total: res.length,
    pass: res.filter((x) => x.status === 'PASS').length,
    fail: res.filter((x) => x.status === 'FAIL').length,
    skip: res.filter((x) => x.status === 'SKIP').length,
  };
  const payload = { generatedAt: new Date().toISOString(), baseUrl: base, runId, summary, state: st, results: res };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify({ outFile, summary }, null, 2));
  if (summary.fail > 0) process.exitCode = 1;
}

run().catch((e) => {
  push({ name: 'Unhandled error', status: 'FAIL', detail: String(e?.message || e) });
  finish();
  process.exitCode = 1;
});


