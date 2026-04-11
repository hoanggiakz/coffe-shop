param(
  [string]$BaseUrl = "https://localhost:3443",
  [int]$Samples = 30
)

$ErrorActionPreference = "Stop"

function Get-P95([double[]]$values) {
  $sorted = $values | Sort-Object
  if ($sorted.Count -eq 0) {
    return 0
  }
  $index = [Math]::Ceiling($sorted.Count * 0.95) - 1
  if ($index -lt 0) { $index = 0 }
  if ($index -ge $sorted.Count) { $index = $sorted.Count - 1 }
  return [Math]::Round($sorted[$index], 2)
}

function Measure-Http([string]$name, [string]$url, [int]$samples) {
  $results = @()
  foreach ($i in 1..$samples) {
    $output = & curl.exe -k -s -o NUL -w "%{time_total}" $url
    $ms = [double]::Parse($output, [System.Globalization.CultureInfo]::InvariantCulture) * 1000
    $results += $ms
  }

  $avg = [Math]::Round((($results | Measure-Object -Average).Average), 2)
  $p95 = Get-P95 $results
  [PSCustomObject]@{
    target = $name
    avg_ms = $avg
    p95_ms = $p95
    samples = $samples
  }
}

$httpResults = @(
  (Measure-Http "order-health" "$BaseUrl/api/orders/health" $Samples)
  (Measure-Http "order-menu" "$BaseUrl/api/orders/menu" $Samples)
  (Measure-Http "payment-health" "$BaseUrl/api/v1/payments/health" $Samples)
)

Push-Location frontend
try {
  $wsJson = node -e @"
const { performance } = require('perf_hooks');
globalThis.performance = performance;
const { io } = require('socket.io-client');

async function run() {
  const samples = [];

  for (let i = 0; i < 10; i += 1) {
    const socket = io('${BaseUrl}/chat', {
      transports: ['websocket'],
      rejectUnauthorized: false,
      forceNew: true,
      reconnection: false,
      timeout: 5000,
    });

    const startedAt = performance.now();

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);

      socket.on('connect', () => {
        socket.emit('join', { tableId: 'nfr-benchmark-table', customerName: 'NFR Benchmark' });
      });

      socket.on('joined', () => {
        clearTimeout(timer);
        samples.push(performance.now() - startedAt);
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error?.message || error)));
      });
    });
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];

  process.stdout.write(JSON.stringify({
    target: 'chat-websocket-join',
    avg_ms: Number(avg.toFixed(2)),
    p95_ms: Number(p95.toFixed(2)),
    samples: samples.length,
  }));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
"@
} finally {
  Pop-Location
}

$wsResult = $wsJson | ConvertFrom-Json

$httpResults + $wsResult | Format-Table -AutoSize


