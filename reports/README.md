# Reports Index

Bộ `reports/` gồm 2 nhóm:

- **Snapshot generated**: JSON/MD được tạo từ script ở từng thời điểm chạy.
- **Manual summary**: các file markdown mô tả cách chạy và phạm vi kiểm tra.

## 1) Tests

- `reports/tests/unit-test-report.md`
- `reports/tests/integration-test-report.md`
- `reports/tests/performance-test-report.md`

Scripts tương ứng:

- `ops/scripts/run-unit-tests.sh`
- `ops/scripts/integration-test.sh`
- `ops/scripts/perf-100-users.mjs`

## 2) Phases

- `reports/phases/mvp-readiness.md`
- `reports/phases/advanced-readiness.md`
- Snapshot JSON:
  - `reports/phases/mvp-readiness-live.json`
  - `reports/phases/advanced-readiness-live.json`

Scripts tương ứng:

- `ops/scripts/check-mvp-phase.mjs`
- `ops/scripts/check-advanced-phase.mjs`

## 3) Acceptance

- `reports/acceptance/acceptance-live.md`
- `reports/acceptance/acceptance-live.json`

Script:

- `ops/scripts/check-acceptance-criteria.mjs`

## 4) Security

- `reports/security/zap-report.md`
- `reports/security/zap-report.json`

Ghi chú: `zap-report.md` là artifact auto-generated, không chỉnh tay nội dung findings.

## 5) NFR

- `reports/nfr/non-functional-readiness.md`

Ghi chú: đây là bảng đối chiếu NFR 4.1-4.6 theo code/config hiện tại + gap cần bổ sung.
