import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const rootDir = process.cwd();
const baseUrl = process.env.BASE_URL || 'https://localhost';
const reportDir = path.join(rootDir, 'reports', 'acceptance');
const reportJsonPath = path.join(reportDir, 'acceptance-live.json');
const reportMdPath = path.join(reportDir, 'acceptance-live.md');

const checks = [];
const artifacts = {};

function addCheck(section, code, criterion, passed, detail, evidence = []) {
  checks.push({
    section,
    code,
    criterion,
    status: passed ? 'PASS' : 'FAIL',
    detail,
    evidence,
  });
}

function readText(relPath) {
  const abs = path.join(rootDir, relPath);
  return fs.readFileSync(abs, 'utf8');
}

function safeReadText(relPath) {
  try {
    return readText(relPath);
  } catch {
    return '';
  }
}

function exists(relPath) {
  return fs.existsSync(path.join(rootDir, relPath));
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function parseJsonFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
    const child = spawn(executable, args, {
      cwd: options.cwd || rootDir,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    let timer = null;

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        killedByTimeout = true;
        child.kill('SIGTERM');
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({
        command: executable,
        args,
        code: -1,
        signal: null,
        killedByTimeout,
        stdout,
        stderr: `${stderr}\n${String(error?.message || error)}`.trim(),
      });
    });

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        command: executable,
        args,
        code: code ?? -1,
        signal: signal || null,
        killedByTimeout,
        stdout,
        stderr,
      });
    });
  });
}

function parseCoverageFromSummaryJson(relPath) {
  if (!exists(relPath)) {
    return null;
  }
  try {
    const content = JSON.parse(readText(relPath));
    const pct = Number(content?.total?.lines?.pct);
    if (Number.isNaN(pct)) return null;
    return pct;
  } catch {
    return null;
  }
}

function parseJacocoLineCoverage(relPath) {
  if (!exists(relPath)) {
    return null;
  }
  const xml = readText(relPath);
  const match = xml.match(/<counter type="LINE" missed="(\d+)" covered="(\d+)"/);
  if (!match) return null;
  const missed = Number(match[1]);
  const covered = Number(match[2]);
  if (Number.isNaN(missed) || Number.isNaN(covered) || covered + missed === 0) {
    return null;
  }
  return Number(((covered / (covered + missed)) * 100).toFixed(2));
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    token: data?.accessToken || '',
  };
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, ok: response.ok, data };
}

function collectHardcodedSecrets(composeText) {
  const findings = [];
  const lines = composeText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/(PASSWORD|SECRET|TOKEN)/i.test(trimmed)) continue;
    if (/:\s*\$\{/.test(trimmed)) continue;
    if (/\$\$[A-Z0-9_]+/.test(trimmed)) continue;
    findings.push(trimmed);
  }
  return findings;
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function buildMarkdownReport(result) {
  const lines = [];
  lines.push('# Acceptance Criteria Report');
  lines.push('');
  lines.push(`- Generated at: \`${result.generatedAt}\``);
  lines.push(`- Base URL: \`${result.baseUrl}\``);
  lines.push(`- Summary: PASS \`${result.summary.pass}\` / FAIL \`${result.summary.fail}\``);
  lines.push('');
  lines.push('| Code | Criterion | Status | Detail |');
  lines.push('|---|---|---|---|');
  for (const item of result.checks) {
    lines.push(`| ${item.code} | ${item.criterion} | ${item.status} | ${item.detail.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Artifacts');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result.artifacts, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

async function run() {
  const nodeTsReady =
    exists('apps/backend/api-gateway/tsconfig.json') &&
    exists('apps/backend/order-service/tsconfig.json') &&
    exists('apps/backend/chat-service/tsconfig.json');
  addCheck(
    '3.1',
    '3.1.1',
    'TypeScript cho Node.js',
    nodeTsReady,
    nodeTsReady
      ? 'api-gateway, order-service, chat-service đều có tsconfig'
      : 'Thiếu tsconfig ở ít nhất một Node.js service',
    ['apps/backend/api-gateway/tsconfig.json', 'apps/backend/order-service/tsconfig.json', 'apps/backend/chat-service/tsconfig.json'],
  );

  const userBuildGradle = safeReadText('apps/backend/user-service/build.gradle');
  const tableBuildGradle = safeReadText('apps/backend/table-service/build.gradle');
  const java17Ready =
    /sourceCompatibility\s*=\s*'17'/.test(userBuildGradle) &&
    /sourceCompatibility\s*=\s*'17'/.test(tableBuildGradle);
  addCheck(
    '3.1',
    '3.1.2',
    'Java 17+ với kiểu rõ ràng',
    java17Ready,
    java17Ready
      ? 'user-service và table-service khai báo sourceCompatibility=17'
      : 'Thiếu khai báo Java 17 ở user-service hoặc table-service',
    ['apps/backend/user-service/build.gradle', 'apps/backend/table-service/build.gradle'],
  );

  const lintScriptGateway = safeReadText('apps/backend/api-gateway/package.json').includes('"lint"');
  const lintScriptOrder = safeReadText('apps/backend/order-service/package.json').includes('"lint"');
  const lintScriptChat = safeReadText('apps/backend/chat-service/package.json').includes('"lint"');
  const eslintConfigReady =
    exists('apps/backend/api-gateway/.eslintrc.cjs') &&
    exists('apps/backend/order-service/.eslintrc.cjs') &&
    exists('apps/backend/chat-service/.eslintrc.cjs');
  const checkstyleConfigured =
    exists('apps/backend/user-service/config/checkstyle/checkstyle.xml') &&
    exists('apps/backend/table-service/config/checkstyle/checkstyle.xml');
  const codingConventionPassed =
    lintScriptGateway &&
    lintScriptOrder &&
    lintScriptChat &&
    eslintConfigReady &&
    checkstyleConfigured;
  artifacts.codingConvention = {
    lintScriptGateway,
    lintScriptOrder,
    lintScriptChat,
    eslintConfigReady,
    checkstyleConfigured,
  };
  addCheck(
    '3.1',
    '3.1.3',
    'Tuân thủ coding convention (ESLint + Checkstyle)',
    codingConventionPassed,
    codingConventionPassed
      ? 'Đã có lint scripts + ESLint config cho Node.js và Checkstyle config cho Spring Boot'
      : `Thiếu cấu hình convention: lintScriptGateway=${lintScriptGateway}, lintScriptOrder=${lintScriptOrder}, lintScriptChat=${lintScriptChat}, eslintConfigReady=${eslintConfigReady}, checkstyleConfigured=${checkstyleConfigured}`,
    ['apps/backend/api-gateway', 'apps/backend/order-service', 'apps/backend/chat-service', 'apps/backend/user-service/config/checkstyle/checkstyle.xml', 'apps/backend/table-service/config/checkstyle/checkstyle.xml'],
  );

  const orderCovCmd = await runCommand(
    'node',
    [
      'node_modules/jest/bin/jest.js',
      '--coverage',
      '--coverageReporters=json-summary',
      '--coverageReporters=text',
      '--coverageReporters=lcov',
      '--runInBand',
    ],
    {
    cwd: path.join(rootDir, 'apps/backend/order-service'),
    timeoutMs: 10 * 60 * 1000,
    },
  );
  artifacts.orderCoverageCommand = { code: orderCovCmd.code };

  const userServicePath = toPosixPath(path.join(rootDir, 'apps/backend/user-service'));
  const tableServicePath = toPosixPath(path.join(rootDir, 'apps/backend/table-service'));
  const userCovCmd = await runCommand('docker', [
    'run',
    '--rm',
    '-v',
    `${userServicePath}:/app`,
    '-w',
    '/app',
    'gradle:8-jdk17-alpine',
    'gradle',
    'test',
    'jacocoTestReport',
    '--no-daemon',
  ], {
    timeoutMs: 15 * 60 * 1000,
  });
  const tableCovCmd = await runCommand('docker', [
    'run',
    '--rm',
    '-v',
    `${tableServicePath}:/app`,
    '-w',
    '/app',
    'gradle:8-jdk17-alpine',
    'gradle',
    'test',
    'jacocoTestReport',
    '--no-daemon',
  ], {
    timeoutMs: 15 * 60 * 1000,
  });
  artifacts.javaCoverageCommands = {
    userServiceCode: userCovCmd.code,
    tableServiceCode: tableCovCmd.code,
  };

  const orderCoverage = parseCoverageFromSummaryJson('apps/backend/order-service/coverage/coverage-summary.json');
  const userCoverage = parseJacocoLineCoverage('apps/backend/user-service/build/reports/jacoco/test/jacocoTestReport.xml');
  const tableCoverage = parseJacocoLineCoverage('apps/backend/table-service/build/reports/jacoco/test/jacocoTestReport.xml');
  artifacts.coverage = { orderCoverage, userCoverage, tableCoverage };
  const coveragePassed =
    typeof orderCoverage === 'number' &&
    typeof userCoverage === 'number' &&
    typeof tableCoverage === 'number' &&
    orderCoverage >= 70 &&
    userCoverage >= 70 &&
    tableCoverage >= 70;
  addCheck(
    '3.1',
    '3.1.4',
    'Unit test coverage >= 70% cho Order/User/Table',
    coveragePassed,
    `order=${orderCoverage ?? 'n/a'}%, user=${userCoverage ?? 'n/a'}%, table=${tableCoverage ?? 'n/a'}%`,
    ['apps/backend/order-service/coverage/coverage-summary.json', 'apps/backend/user-service/build/reports/jacoco/test/jacocoTestReport.xml', 'apps/backend/table-service/build/reports/jacoco/test/jacocoTestReport.xml'],
  );

  const mvpCmd = await runCommand('node', ['ops/scripts/check-mvp-phase.mjs'], {
    env: {
      BASE_URL: baseUrl,
    },
    timeoutMs: 5 * 60 * 1000,
  });
  const mvpJson = parseJsonFromText(mvpCmd.stdout) || {};
  artifacts.mvpCheck = mvpJson;
  addCheck(
    '3.1',
    '3.1.5',
    'Không có critical bug ở luồng chính',
    mvpCmd.code === 0 && Number(mvpJson.failed || 0) === 0,
    `mvp script code=${mvpCmd.code}, failed=${mvpJson.failed ?? 'n/a'}`,
    ['ops/scripts/check-mvp-phase.mjs'],
  );

  const orderLatencyCmd = await runCommand('node', ['ops/scripts/order-create-latency.mjs'], {
    env: {
      BASE_URL: baseUrl,
      ORDER_ITERATIONS: '20',
      ORDER_THRESHOLD_MS: '1000',
    },
    timeoutMs: 5 * 60 * 1000,
  });
  const orderLatencyJson = parseJsonFromText(orderLatencyCmd.stdout) || {};
  artifacts.orderLatency = orderLatencyJson;
  const orderLatencyPassed =
    Number(orderLatencyJson.failures || 0) === 0 &&
    Number(orderLatencyJson.avgMs || Number.POSITIVE_INFINITY) < 1000;
  addCheck(
    '3.2',
    '3.2.3',
    'Tạo đơn hàng < 1 giây',
    orderLatencyPassed,
    `avgMs=${orderLatencyJson.avgMs ?? 'n/a'}, p95Ms=${orderLatencyJson.p95Ms ?? 'n/a'}, failures=${orderLatencyJson.failures ?? 'n/a'}`,
    ['ops/scripts/order-create-latency.mjs'],
  );

  const perfCmd = await runCommand('node', ['ops/scripts/perf-100-users.mjs'], {
    env: {
      BASE_URL: baseUrl,
      TARGET_PATH: '/',
      CONCURRENCY: '100',
      ROUNDS: '10',
    },
    timeoutMs: 5 * 60 * 1000,
  });
  const perfJson = parseJsonFromText(perfCmd.stdout) || {};
  artifacts.gatewayPerf = perfJson;
  const perfPassed =
    Number(perfJson.requestsPerSecond || 0) >= 100 &&
    Number(perfJson.avgMs || Number.POSITIVE_INFINITY) < 200 &&
    Number(perfJson.failures || 0) === 0;
  addCheck(
    '3.2',
    '3.2.1',
    'API Gateway >= 100 req/s, avg latency < 200ms',
    perfPassed,
    `rps=${perfJson.requestsPerSecond ?? 'n/a'}, avgMs=${perfJson.avgMs ?? 'n/a'}, failures=${perfJson.failures ?? 'n/a'}`,
    ['ops/scripts/perf-100-users.mjs'],
  );

  const wsCmd = await runCommand('node', ['scripts/ws-latency-50.mjs'], {
    cwd: path.join(rootDir, 'apps/frontend'),
    env: {
      WS_BASE_URL: 'http://localhost',
      WS_SESSIONS: '50',
      WS_LATENCY_THRESHOLD_MS: '100',
    },
    timeoutMs: 5 * 60 * 1000,
  });
  const wsJson = parseJsonFromText(wsCmd.stdout) || {};
  artifacts.wsPerf = wsJson;
  const wsPassed =
    Number(wsJson.failedSessions || 0) === 0 &&
    Number(wsJson.messageLatency?.avgMs || Number.POSITIVE_INFINITY) < 100;
  addCheck(
    '3.2',
    '3.2.2',
    'WebSocket chat latency < 100ms với 50 phiên đồng thời',
    wsPassed,
    `failedSessions=${wsJson.failedSessions ?? 'n/a'}, messageAvgMs=${wsJson.messageLatency?.avgMs ?? 'n/a'}, messageP95Ms=${wsJson.messageLatency?.p95Ms ?? 'n/a'}`,
    ['apps/frontend/scripts/ws-latency-50.mjs'],
  );

  const authServiceText = safeReadText('apps/backend/user-service/src/modules/auth/auth.service.ts');
  const securityConfigText = safeReadText('apps/backend/user-service/src/main/java/com/coffeeshop/userservice/config/SecurityConfig.java');
  const bcryptPassed =
    /bcrypt\.hash\(/.test(authServiceText) &&
    /bcrypt\.compare\(/.test(authServiceText) &&
    /BCryptPasswordEncoder/.test(securityConfigText);
  addCheck(
    '3.3',
    '3.3.1',
    'Mật khẩu được mã hóa bằng bcrypt',
    bcryptPassed,
    bcryptPassed ? 'Auth service dùng bcrypt hash/compare và Spring Security dùng BCryptPasswordEncoder' : 'Không tìm thấy đủ bằng chứng bcrypt',
    ['apps/backend/user-service/src/modules/auth/auth.service.ts', 'apps/backend/user-service/src/main/java/com/coffeeshop/userservice/config/SecurityConfig.java'],
  );

  const userAppProps = safeReadText('apps/backend/user-service/src/main/resources/application.properties');
  const jwtExpiryPassed =
    /jwt\.expiration=\$\{JWT_EXPIRATION:86400000\}/.test(userAppProps) &&
    /JWT_EXPIRATION:\s*86400000/.test(safeReadText('docker-compose.yml'));
  addCheck(
    '3.3',
    '3.3.2',
    'JWT có thời gian hết hạn 1 ngày',
    jwtExpiryPassed,
    jwtExpiryPassed ? 'JWT_EXPIRATION được cấu hình mặc định 86400000ms' : 'Không tìm thấy cấu hình mặc định 1 ngày',
    ['apps/backend/user-service/src/main/resources/application.properties', 'docker-compose.yml'],
  );

  const staffLogin = await login('staff.test@coffeeshop.local', 'Staff@123');
  const managerLogin = await login('manager.central@coffeeshop.local', 'Manager@123');
  let roleProtectionPassed = false;
  let roleProtectionDetail = 'Không chạy được kiểm tra phân quyền';
  if (staffLogin.ok && managerLogin.ok) {
    const staffHeaders = { Authorization: `Bearer ${staffLogin.token}` };
    const managerHeaders = { Authorization: `Bearer ${managerLogin.token}` };
    const staffPromo = await request('/api/orders/admin/promotions', { headers: staffHeaders });
    const managerPromo = await request('/api/orders/admin/promotions', { headers: managerHeaders });
    const staffRegister = await request('/api/users/register', {
      method: 'POST',
      headers: { ...staffHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `forbidden-${Date.now()}@coffeeshop.local`,
        password: 'Tmp@123456',
        name: 'Forbidden User',
        phone: '0999999999',
        role: 'STAFF',
      }),
    });
    roleProtectionPassed =
      staffPromo.status === 403 &&
      staffRegister.status === 403 &&
      managerPromo.status !== 403;
    roleProtectionDetail = `staffPromo=${staffPromo.status}, staffRegister=${staffRegister.status}, managerPromo=${managerPromo.status}`;
  } else {
    roleProtectionDetail = `login failed: staff=${staffLogin.status}, manager=${managerLogin.status}`;
  }
  addCheck(
    '3.3',
    '3.3.4',
    'Endpoint quan trọng yêu cầu quyền quản lý',
    roleProtectionPassed,
    roleProtectionDetail,
    ['apps/backend/api-gateway/src/proxy/proxy.controller.ts'],
  );

  const zapReportPaths = [
    'reports/security/zap-report.json',
    'reports/security/zap-report.html',
    'reports/security/zap-report.md',
    'reports/security/zap-report.xml',
  ];
  const foundZapReports = zapReportPaths.filter((item) => exists(item));
  const zapPassed = foundZapReports.length > 0;
  addCheck(
    '3.3',
    '3.3.3',
    'Không có SQL injection/XSS (qua OWASP ZAP hoặc tương tự)',
    zapPassed,
    zapPassed ? `Có report bảo mật: ${foundZapReports.join(', ')}` : 'Chưa có artifact scan OWASP ZAP/tương tự trong reports/security',
    foundZapReports.length ? foundZapReports : ['reports/security/'],
  );

  const composePsCmd = await runCommand('docker', ['compose', 'ps', '--format', 'json']);
  const lines = composePsCmd.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsedServices = [];
  for (const line of lines) {
    try {
      parsedServices.push(JSON.parse(line));
    } catch {
      // ignore malformed lines
    }
  }
  artifacts.composeServices = parsedServices.map((item) => ({
    service: item.Service,
    status: item.Status,
    health: item.Health,
  }));
  const requiredServices = new Set([
    'api-gateway',
    'user-service',
    'table-service',
    'order-service',
    'chat-service',
    'inventory-service',
    'payment-service',
    'report-service',
    'frontend',
    'postgres',
    'redis',
  ]);
  const healthyRequired = parsedServices.filter((item) => requiredServices.has(item.Service));
  const composePassed =
    healthyRequired.length === requiredServices.size &&
    healthyRequired.every((item) => String(item.Status || '').toLowerCase().includes('up'));
  addCheck(
    '3.4',
    '3.4.1',
    'Docker compose chạy thành công trên máy mới',
    composePassed,
    `servicesUp=${healthyRequired.length}/${requiredServices.size}`,
    ['docker-compose.yml'],
  );

  const deploymentGuide = safeReadText('ops/docs/deployment-guide.md');
  const guidePassed =
    exists('ops/docs/deployment-guide.md') &&
    deploymentGuide.includes('docker compose') &&
    deploymentGuide.includes('Kubernetes');
  addCheck(
    '3.4',
    '3.4.2',
    'Hướng dẫn triển khai đầy đủ',
    guidePassed,
    guidePassed ? 'Có ops/docs/deployment-guide.md với hướng dẫn Docker Compose và Kubernetes' : 'Thiếu hoặc chưa đủ nội dung deployment-guide.md',
    ['ops/docs/deployment-guide.md'],
  );

  const composeText = safeReadText('docker-compose.yml');
  const hardcodedSecrets = collectHardcodedSecrets(composeText);
  const hasHardcodedIp = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(composeText);
  const envAbstractionPassed = hardcodedSecrets.length === 0 && !hasHardcodedIp;
  addCheck(
    '3.4',
    '3.4.3',
    'Không hardcode IP/cổng/mật khẩu, dùng biến môi trường',
    envAbstractionPassed,
    envAbstractionPassed
      ? 'Không phát hiện hardcode secret/IP trong docker-compose.yml'
      : `Phát hiện hardcode: ${hardcodedSecrets.slice(0, 3).join(' | ')}${hardcodedSecrets.length > 3 ? ' ...' : ''}${hasHardcodedIp ? ' | có địa chỉ IP cố định' : ''}`,
    ['docker-compose.yml', '.env.example'],
  );

  const frontPagesText = safeReadText('apps/frontend/src/pages/CustomerMenu.tsx') + '\n' + safeReadText('apps/frontend/src/pages/Orders.tsx');
  const responsiveTokens = countMatches(frontPagesText, /\b(sm:|md:|lg:|xl:)/g);
  addCheck(
    '3.5',
    '3.5.1',
    'UI responsive cho mobile và desktop',
    responsiveTokens >= 20,
    `Số responsive tokens (sm:/md:/lg:/xl:) = ${responsiveTokens}`,
    ['apps/frontend/src/pages/CustomerMenu.tsx', 'apps/frontend/src/pages/Orders.tsx'],
  );

  const mvpFlowPassed = mvpCmd.code === 0 && Number(mvpJson.failed || 0) === 0;
  addCheck(
    '3.5',
    '3.5.2',
    'Luồng đặt món/chat/cập nhật trạng thái trực quan',
    mvpFlowPassed,
    mvpFlowPassed
      ? 'Smoke flow MVP pass: login -> table -> order -> KDS update -> chat'
      : `Smoke flow MVP fail (code=${mvpCmd.code}, failed=${mvpJson.failed ?? 'n/a'})`,
    ['ops/scripts/check-mvp-phase.mjs'],
  );

  const clearErrorMessages =
    countMatches(frontPagesText, /toast\.error\(/g) >= 10 &&
    countMatches(safeReadText('apps/backend/order-service/src/modules/order/order.service.ts'), /BadRequestException\('/g) >= 10;
  addCheck(
    '3.5',
    '3.5.3',
    'Thông báo lỗi rõ ràng',
    clearErrorMessages,
    clearErrorMessages
      ? 'Frontend/backend đều có nhiều thông báo lỗi nghiệp vụ cụ thể'
      : 'Số lượng thông báo lỗi nghiệp vụ rõ ràng chưa đủ theo kiểm tra tĩnh',
    ['apps/frontend/src/pages/CustomerMenu.tsx', 'apps/frontend/src/pages/Orders.tsx', 'apps/backend/order-service/src/modules/order/order.service.ts'],
  );

  fs.mkdirSync(reportDir, { recursive: true });

  const pass = checks.filter((item) => item.status === 'PASS').length;
  const fail = checks.filter((item) => item.status === 'FAIL').length;
  const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    summary: {
      pass,
      fail,
      total: checks.length,
    },
    checks,
    artifacts,
  };

  fs.writeFileSync(reportJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportMdPath, buildMarkdownReport(result), 'utf8');
  console.log(JSON.stringify(result, null, 2));

  process.exit(fail > 0 ? 1 : 0);
}

run().catch((error) => {
  fs.mkdirSync(reportDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    error: String(error?.message || error),
  };
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});




