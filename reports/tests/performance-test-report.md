# Performance Test Report (100 Concurrent Users)

- Date: `2026-04-10`
- Script: `scripts/perf-100-users.mjs`

## Command

```bash
BASE_URL=https://localhost TARGET_PATH=/api/orders/health CONCURRENCY=100 ROUNDS=5 node scripts/perf-100-users.mjs
```

## Output fields

- `totalRequests`
- `concurrency` (must be `100`)
- `rounds`
- `failures`
- `successRate`
- `avgMs`
- `p95Ms`

## Pass criteria (baseline)

- `successRate >= 99%`
- `p95Ms <= 1000`

## Notes

- Tune target path and rounds based on deployment capacity.

## Current execution status

- Not executed in this local editing session.
