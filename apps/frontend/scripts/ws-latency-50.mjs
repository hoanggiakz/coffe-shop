import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';

const wsBaseUrl = process.env.WS_BASE_URL || 'http://localhost';
const namespace = process.env.WS_NAMESPACE || '/chat';
const sessions = Number(process.env.WS_SESSIONS || 50);
const connectTimeoutMs = Number(process.env.WS_CONNECT_TIMEOUT_MS || 8000);
const messageTimeoutMs = Number(process.env.WS_MESSAGE_TIMEOUT_MS || 8000);
const thresholdMs = Number(process.env.WS_LATENCY_THRESHOLD_MS || 100);

if (Number.isNaN(sessions) || sessions <= 0) {
  throw new Error('WS_SESSIONS must be a positive number');
}

function summarize(values) {
  if (!values.length) {
    return { avgMs: null, p95Ms: null, minMs: null, maxMs: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avgMs: Number((total / values.length).toFixed(2)),
    p95Ms: Number(sorted[p95Index].toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function runSession(index) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const tableId = `ws-perf-${Date.now()}-${index}`;
    const messageMark = `WS_LATENCY_${Date.now()}_${index}`;
    const socket = io(`${wsBaseUrl}${namespace}`, {
      transports: ['websocket'],
      timeout: connectTimeoutMs,
      reconnection: false,
      forceNew: true,
      rejectUnauthorized: false,
    });

    let joinLatencyMs = null;
    let messageStartedAt = 0;
    let done = false;

    const finalize = (result) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      socket.removeAllListeners();
      socket.disconnect();
      resolve(result);
    };

    const deadline = setTimeout(() => {
      finalize({
        success: false,
        error: 'TIMEOUT',
      });
    }, connectTimeoutMs + messageTimeoutMs + 1000);

    socket.on('connect_error', (error) => {
      finalize({
        success: false,
        error: `CONNECT_ERROR: ${String(error?.message || error)}`,
      });
    });

    socket.on('error', (payload) => {
      finalize({
        success: false,
        error: `SERVER_ERROR: ${String(payload?.message || payload || 'UNKNOWN')}`,
      });
    });

    socket.on('connect', () => {
      socket.emit('join', {
        tableId,
        customerName: `WS Perf ${index}`,
        senderType: 'CUSTOMER',
      });
    });

    socket.on('joined', () => {
      joinLatencyMs = performance.now() - startedAt;
      messageStartedAt = performance.now();
      socket.emit('send-message', {
        content: messageMark,
        senderType: 'CUSTOMER',
        senderName: `WS Perf ${index}`,
      });
    });

    socket.on('new-message', (payload) => {
      const content = String(payload?.content || '');
      if (content !== messageMark) {
        return;
      }
      const messageLatencyMs = performance.now() - messageStartedAt;
      finalize({
        success: true,
        joinLatencyMs,
        messageLatencyMs,
      });
    });
  });
}

async function main() {
  const startedAt = performance.now();
  const jobs = Array.from({ length: sessions }, (_, index) => runSession(index + 1));
  const outputs = await Promise.all(jobs);

  const successful = outputs.filter((item) => item.success);
  const failed = outputs.filter((item) => !item.success);

  const joinStats = summarize(successful.map((item) => item.joinLatencyMs));
  const messageStats = summarize(successful.map((item) => item.messageLatencyMs));
  const totalDurationMs = Number((performance.now() - startedAt).toFixed(2));
  const pass =
    failed.length === 0 &&
    messageStats.avgMs !== null &&
    messageStats.avgMs < thresholdMs;

  const result = {
    target: `${wsBaseUrl}${namespace}`,
    sessions,
    successfulSessions: successful.length,
    failedSessions: failed.length,
    thresholdMs,
    joinLatency: joinStats,
    messageLatency: messageStats,
    totalDurationMs,
    pass,
    failures: failed.slice(0, 20),
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        target: `${wsBaseUrl}${namespace}`,
        success: false,
        error: String(error?.message || error),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
