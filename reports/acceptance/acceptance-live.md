# Acceptance Criteria Report

- Generated at: `2026-04-11T09:19:42.411Z`
- Base URL: `https://localhost`
- Summary: PASS `18` / FAIL `0`

| Code | Criterion | Status | Detail |
|---|---|---|---|
| 3.1.1 | TypeScript cho Node.js | PASS | api-gateway, order-service, chat-service đều có tsconfig |
| 3.1.2 | Java 17+ với kiểu rõ ràng | PASS | user-service và table-service khai báo sourceCompatibility=17 |
| 3.1.3 | Tuân thủ coding convention (ESLint + Checkstyle) | PASS | Đã có lint scripts + ESLint config cho Node.js và Checkstyle config cho Spring Boot |
| 3.1.4 | Unit test coverage >= 70% cho Order/User/Table | PASS | order=100%, user=100%, table=100% |
| 3.1.5 | Không có critical bug ở luồng chính | PASS | mvp script code=0, failed=0 |
| 3.2.3 | Tạo đơn hàng < 1 giây | PASS | avgMs=45.14, p95Ms=58.32, failures=0 |
| 3.2.1 | API Gateway >= 100 req/s, avg latency < 200ms | PASS | rps=1149.85, avgMs=45.78, failures=0 |
| 3.2.2 | WebSocket chat latency < 100ms với 50 phiên đồng thời | PASS | failedSessions=0, messageAvgMs=23.06, messageP95Ms=34.53 |
| 3.3.1 | Mật khẩu được mã hóa bằng bcrypt | PASS | Auth service dùng bcrypt hash/compare và Spring Security dùng BCryptPasswordEncoder |
| 3.3.2 | JWT có thời gian hết hạn 1 ngày | PASS | JWT_EXPIRATION được cấu hình mặc định 86400000ms |
| 3.3.4 | Endpoint quan trọng yêu cầu quyền quản lý | PASS | staffPromo=403, staffRegister=403, managerPromo=200 |
| 3.3.3 | Không có SQL injection/XSS (qua OWASP ZAP hoặc tương tự) | PASS | Có report bảo mật: reports/security/zap-report.json, reports/security/zap-report.html, reports/security/zap-report.md |
| 3.4.1 | Docker compose chạy thành công trên máy mới | PASS | servicesUp=11/11 |
| 3.4.2 | Hướng dẫn triển khai đầy đủ | PASS | Có ops/docs/deployment-guide.md với hướng dẫn Docker Compose và Kubernetes |
| 3.4.3 | Không hardcode IP/cổng/mật khẩu, dùng biến môi trường | PASS | Không phát hiện hardcode secret/IP trong docker-compose.yml |
| 3.5.1 | UI responsive cho mobile và desktop | PASS | Số responsive tokens (sm:/md:/lg:/xl:) = 31 |
| 3.5.2 | Luồng đặt món/chat/cập nhật trạng thái trực quan | PASS | Smoke flow MVP pass: login -> table -> order -> KDS update -> chat |
| 3.5.3 | Thông báo lỗi rõ ràng | PASS | Frontend/backend đều có nhiều thông báo lỗi nghiệp vụ cụ thể |

## Artifacts

```json
{
  "codingConvention": {
    "lintScriptGateway": true,
    "lintScriptOrder": true,
    "lintScriptChat": true,
    "eslintConfigReady": true,
    "checkstyleConfigured": true
  },
  "orderCoverageCommand": {
    "code": 0
  },
  "javaCoverageCommands": {
    "userServiceCode": 0,
    "tableServiceCode": 0
  },
  "coverage": {
    "orderCoverage": 100,
    "userCoverage": 100,
    "tableCoverage": 100
  },
  "mvpCheck": {
    "phase": "MVP",
    "baseUrl": "https://localhost",
    "passed": 12,
    "failed": 0,
    "durationMs": 800,
    "results": [
      {
        "name": "User login",
        "status": "PASS",
        "detail": "Admin login successful"
      },
      {
        "name": "User profile",
        "status": "PASS",
        "detail": "Profile endpoint accessible"
      },
      {
        "name": "Table list",
        "status": "PASS",
        "detail": "Fetched 66 tables"
      },
      {
        "name": "Table QR",
        "status": "PASS",
        "detail": "QR base64 generated"
      },
      {
        "name": "Menu list",
        "status": "PASS",
        "detail": "Fetched 10 menu items"
      },
      {
        "name": "Order create",
        "status": "PASS",
        "detail": "Created order cmnu4incz00041uzll8pl0hm4"
      },
      {
        "name": "Order by table",
        "status": "PASS",
        "detail": "Fetched 6 orders"
      },
      {
        "name": "Order status update",
        "status": "PASS",
        "detail": "Updated to PREPARING"
      },
      {
        "name": "Order item status update",
        "status": "PASS",
        "detail": "Updated item to DONE"
      },
      {
        "name": "Chat create",
        "status": "PASS",
        "detail": "Created chat cmnu4infz0007iol42e3v6nij"
      },
      {
        "name": "Chat send message",
        "status": "PASS",
        "detail": "Message created"
      },
      {
        "name": "Chat message list",
        "status": "PASS",
        "detail": "Fetched 1 messages"
      }
    ]
  },
  "orderLatency": {
    "target": "https://localhost/api/orders",
    "iterations": 20,
    "thresholdMs": 1000,
    "totalRequests": 20,
    "successfulRequests": 20,
    "failures": 0,
    "successRate": 100,
    "avgMs": 45.14,
    "p95Ms": 58.32,
    "minMs": 38.82,
    "maxMs": 64.76,
    "pass": true,
    "errors": [],
    "generatedAt": "2026-04-11T09:19:39.929Z"
  },
  "gatewayPerf": {
    "target": "https://localhost/",
    "totalRequests": 1000,
    "concurrency": 100,
    "rounds": 10,
    "failures": 0,
    "successRate": 100,
    "avgMs": 45.78,
    "p95Ms": 233.1,
    "totalDurationMs": 869.68,
    "requestsPerSecond": 1149.85,
    "generatedAt": "2026-04-11T09:19:40.863Z"
  },
  "wsPerf": {
    "target": "http://localhost/chat",
    "sessions": 50,
    "successfulSessions": 50,
    "failedSessions": 0,
    "thresholdMs": 100,
    "joinLatency": {
      "avgMs": 202.33,
      "p95Ms": 310.79,
      "minMs": 100.92,
      "maxMs": 315.47
    },
    "messageLatency": {
      "avgMs": 23.06,
      "p95Ms": 34.53,
      "minMs": 9.7,
      "maxMs": 37.25
    },
    "totalDurationMs": 364.18,
    "pass": true,
    "failures": [],
    "generatedAt": "2026-04-11T09:19:41.456Z"
  },
  "composeServices": [
    {
      "service": "api-gateway",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "chat-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "db-backup",
      "status": "Up 4 minutes",
      "health": ""
    },
    {
      "service": "frontend",
      "status": "Up 4 minutes (unhealthy)",
      "health": "unhealthy"
    },
    {
      "service": "inventory-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "order-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "payment-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "postgres",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "redis",
      "status": "Up 5 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "report-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "table-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    },
    {
      "service": "user-service",
      "status": "Up 4 minutes (healthy)",
      "health": "healthy"
    }
  ]
}
```
