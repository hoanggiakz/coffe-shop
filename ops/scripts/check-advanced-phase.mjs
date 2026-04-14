import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const baseUrl = process.env.BASE_URL || 'https://localhost';
const managerEmail = process.env.MANAGER_EMAIL || 'manager.central@coffeeshop.local';
const managerPassword = process.env.MANAGER_PASSWORD || 'Manager@123';

const checks = [];

function add(status, name, detail) {
  checks.push({ status, name, detail });
}

async function request(pathname, options = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

function exists(relPath) {
  return fs.existsSync(path.resolve(relPath));
}

async function main() {
  let token = '';
  const login = await request('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: managerEmail, password: managerPassword }),
  });

  if (login.res.ok && login.data?.accessToken) {
    token = login.data.accessToken;
    add('PASS', 'Manager login', 'Manager token acquired');
  } else {
    add('FAIL', 'Manager login', `HTTP ${login.res.status}`);
  }

  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  const endpointChecks = [
    ['/api/v1/ingredients/health', 'Inventory health'],
    ['/api/v1/payments/health', 'Payment health'],
    ['/api/reports/health', 'Report health'],
    ['/api/orders/admin/promotions', 'Promotion management endpoint'],
    ['/api/users/staff', 'Staff management endpoint'],
    ['/api/users/admin/branches', 'Branch management endpoint'],
  ];

  for (const [pathname, name] of endpointChecks) {
    const r = await request(pathname, { headers: authHeaders });
    if (r.res.ok) add('PASS', name, `HTTP ${r.res.status}`);
    else add('FAIL', name, `HTTP ${r.res.status}`);
  }

  const fileChecks = [
    ['ops/k8s/configmap.yaml', 'K8s ConfigMap'],
    ['ops/k8s/secret.example.yaml', 'K8s Secret'],
    ['ops/k8s/ingress.yaml', 'K8s Ingress'],
    ['ops/k8s/api-gateway.yaml', 'K8s API Gateway Deployment'],
    ['ops/scripts/perf-100-users.mjs', 'Performance script (100 concurrent)'],
    ['ops/scripts/check-mvp-phase.mjs', 'MVP phase check script'],
    ['ops/scripts/check-advanced-phase.mjs', 'Advanced phase check script'],
    ['.github/workflows/deno.yml', 'CI workflow file'],
  ];

  for (const [p, name] of fileChecks) {
    if (exists(p)) add('PASS', name, p);
    else add('FAIL', name, p);
  }

  if (exists('apps/frontend/public/manifest.webmanifest')) {
    add('PASS', 'PWA manifest', 'manifest.webmanifest found');
  } else {
    add('WARN', 'PWA manifest', 'Not found (PWA not fully enabled yet)');
  }

  if (exists('monitoring/prometheus.yml')) {
    add('PASS', 'Monitoring stack files', 'Monitoring config found');
  } else {
    add('WARN', 'Monitoring stack files', 'Prometheus/Grafana config not found');
  }

  if (exists('logging/elk-stack.yml')) {
    add('PASS', 'Centralized logging files', 'Logging stack found');
  } else {
    add('WARN', 'Centralized logging files', 'ELK/logging stack not found');
  }

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;

  console.log(
    JSON.stringify(
      {
        phase: 'ADVANCED',
        baseUrl,
        pass,
        fail,
        warn,
        checks,
      },
      null,
      2,
    ),
  );

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        phase: 'ADVANCED',
        error: String(error?.message || error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});



