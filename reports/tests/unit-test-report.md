# Unit Test Report

- Date: `2026-04-10`
- Scope:
  - `api-gateway`
  - `user-service`
  - `table-service`
  - `order-service`
  - `chat-service`
  - `frontend`

## Commands

```bash
./scripts/run-unit-tests.sh
```

## Current execution status

- `api-gateway`: PASS (1/1)
- `order-service`: PASS (1/1)
- `chat-service`: PASS (1/1)
- `frontend`: not executed in this local run
- `user-service`: not executed in this local run (Docker/Gradle command provided)
- `table-service`: not executed in this local run (Docker/Gradle command provided)

## Notes

- Sanity unit tests were added as a baseline and should be extended with business logic tests per module.
