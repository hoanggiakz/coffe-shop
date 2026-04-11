import { performance } from 'node:perf_hooks';

const baseUrl = process.env.BASE_URL || 'https://localhost';
const targetPath = process.env.TARGET_PATH || '/api/orders/health';
const rounds = Number(process.env.ROUNDS || 5);
const concurrency = Number(process.env.CONCURRENCY || 100);

if (Number.isNaN(rounds) || rounds <= 0) {
  throw new Error('ROUNDS must be a positive number');
}
if (Number.isNaN(concurrency) || concurrency <= 0) {
  throw new Error('CONCURRENCY must be a positive number');
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const url = `${baseUrl}${targetPath}`;
const durations = [];
let failures = 0;
const benchmarkStartedAt = performance.now();

async function hitEndpoint() {
  const startedAt = performance.now();
  try {
    const res = await fetch(url);
    if (!res.ok) {
      failures += 1;
    }
  } catch (error) {
    failures += 1;
  } finally {
    durations.push(performance.now() - startedAt);
  }
}

for (let round = 1; round <= rounds; round += 1) {
  const jobs = Array.from({ length: concurrency }, () => hitEndpoint());
  await Promise.all(jobs);
}

const sorted = [...durations].sort((a, b) => a - b);
const total = durations.reduce((sum, value) => sum + value, 0);
const avgMs = Number((total / durations.length).toFixed(2));
const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
const p95Ms = Number(sorted[p95Index].toFixed(2));
const totalDurationMs = Number((performance.now() - benchmarkStartedAt).toFixed(2));
const requestsPerSecond = Number(((durations.length / totalDurationMs) * 1000).toFixed(2));

const result = {
  target: url,
  totalRequests: durations.length,
  concurrency,
  rounds,
  failures,
  successRate: Number((((durations.length - failures) / durations.length) * 100).toFixed(2)),
  avgMs,
  p95Ms,
  totalDurationMs,
  requestsPerSecond,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));


