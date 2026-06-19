# Coffee Shop Microservices Architecture Map

Generated: 2026-06-19

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Browser / Mobile App (Customer, Staff, Admin)                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                                │
├──────────────────────────────────────────────────────────────────────┤
│  React + Vite + Nginx Reverse Proxy                                  │
│  • Customer Menu / QR Ordering                                       │
│  • Staff Dashboard / KDS                                             │
│  • Admin Management Screens                                          │
│  • Chat UI                                                           │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                               │
├──────────────────────────────────────────────────────────────────────┤
│  NestJS Gateway (Port 8080)                                          │
│  • JWT Authentication                                                │
│  • RBAC (Role-Based Access Control)                                 │
│  • Service Routing / Proxying                                       │
│  • Branch-Scoped Access Enforcement                                 │
└──────────┬─────────┬─────────┬─────────┬─────────┬─────────┬───────┘
           │         │         │         │         │         │
      ┌────▼┐  ┌────▼┐  ┌────▼┐  ┌────▼┐  ┌────▼┐  ┌────▼┐  ┌────▼┐
      │ US  │  │ TS  │  │ OS  │  │ CS  │  │ IS  │  │ PS  │  │ RS  │
      └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘
```

---

## 2. Service Routing Map

```
API Gateway Routes:
┌──────────────────────────────────────────────────────────────┐
│                   /api/* requests                            │
└─────────────────────────┬──────────────────────────────────────┘
         │
    ┌────┴────────────────────────────────┐
    │                                      │
    ▼                                      ▼
/api/users                          /api/tables
/api/auth                           /api/orders
/api/customer                       /api/chats
/api/branches                       /api/v1/ingredients
/api/staff                          /api/v1/payments
/api/attendance                     /api/invoices
/api/payroll                        /api/reports
                                    /api/ai
    │                                      │
    ▼                                      ▼
┌──────────────────┐             ┌─────────────────────────────┐
│  USER-SERVICE    │             │  BACKEND SERVICES CLUSTER   │
│  (Spring Boot)   │             │  (Mostly NestJS + Prisma)   │
│  :3000           │             │                             │
└──────────────────┘             │ • table-service :3003       │
                                 │ • order-service :3001       │
                                 │ • inventory-service :3005   │
                                 │ • payment-service :3004     │
                                 │ • chat-service :3007        │
                                 │ • report-service :3006      │
                                 │ • ai-service :3010          │
                                 └─────────────────────────────┘
```

---

## 3. Service Dependency Graph

```
                           ┌─────────────┐
                           │   Frontend  │
                           └──────┬──────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │  API Gateway     │
                        │  (NestJS)        │
                        └─────────┬────────┘
                                  │
                 ┌────────┬────────┼────────┬────────┬────────┐
                 │        │        │        │        │        │
                 ▼        ▼        ▼        ▼        ▼        ▼
           ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
           │ User    │ │Table │ │Order │ │Chat  │ │Inv.  │ │Pmt.  │
           │Service  │ │Svc   │ │Svc   │ │Svc   │ │Svc   │ │Svc   │
           │(Spring) │ │(Spg) │ │(Nest)│ │(Nest)│ │(Nest)│ │(Nest)│
           └────┬────┘ └──────┘ └──┬───┘ └──────┘ └──────┘ └──────┘
                │                  │
    ┌───────────┼──────────────┐   │
    │           │              │   │
    │           │              │   │
    ▼           ▼              ▼   ▼
 ┌──────────────────────────────────────┐
 │         PostgreSQL (Core DB)         │
 └──────────────────────────────────────┘
    ▲           ▲              ▲   ▲
    │           │              │   │
    │      ┌────┴──────────┐   │   │
    └──────┤               │   │   │
           │               │   │   │
           ▼               ▼   ▼   ▼
      ┌─────────┐      ┌──────────────────┐
      │  Redis  │      │  Report Service  │
      │ (Cache) │      │  (NestJS)        │
      └─────────┘      └──────────────────┘
           ▲
           │
      ┌────┴───────────────────┐
      │                        │
      ▼                        ▼
  ┌─────────────┐      ┌────────────────┐
  │ Chat Svc    │      │ API Gateway    │
  │ (realtime)  │      │ (cache)        │
  └─────────────┘      └────────────────┘
```

---

## 4. Service Interaction Flows

### 4.1 Customer QR Order Flow

```
Customer                Frontend              Gateway              Services
   │                       │                    │                    │
   ├─ Scan QR ────────────▶│                    │                    │
   │                       │                    │                    │
   │                       ├─ GET /api/orders/menu?tableId ──────────▶│
   │                       │                    │                    │
   │                       │     ┌──────────────────────────────────┐ │
   │                       │     │ Gateway validates JWT           │ │
   │                       │     │ (or public if customer)         │ │
   │                       │     └──────────────────────────────────┘ │
   │                       │                    │                    │
   │                       │                    ├──→ Table Service   │
   │                       │                    │    (verify table)  │
   │                       │                    │◀──┘                │
   │                       │                    │                    │
   │                       │                    ├──→ Order Service   │
   │                       │                    │    (get menu)      │
   │                       │                    │◀──┘                │
   │                       │◀─ Menu Items ──────┤                    │
   │◀─ Display Menu ───────┤                    │                    │
   │                       │                    │                    │
   ├─ Add Items + Submit ─▶│                    │                    │
   │                       │                    │                    │
   │                       ├─ POST /api/orders ────────────────────▶│
   │                       │                    │                    │
   │                       │     ┌──────────────────────────────────┐ │
   │                       │     │ Order Service:                  │ │
   │                       │     │ • Create Order                  │ │
   │                       │     │ • Publish OrderCreated event    │ │
   │                       │     │ • Emit Kafka message            │ │
   │                       │     └──────────────────────────────────┘ │
   │                       │                    │                    │
   │                       │◀─ Order Details ───┤                    │
   │◀─ Confirm Order ──────┤                    │                    │
   │                       │                    │                    │
   │  (Realtime updates via Chat WS)            │                    │
   │◀─ Order Status Updates ─────────────────────────────────────────│
   │                       │                    │                    │
```

### 4.2 Staff KDS (Kitchen Display System) Flow

```
Order Service                Kafka              KDS (Chat Service)        Frontend
      │                       │                        │                    │
      ├─ OrderCreated ────────▶│                        │                    │
      │ (event)                │                        │                    │
      │                        ├─ OrderCreated ───────▶│                    │
      │                        │ (consumed)            │                    │
      │                        │                       ├─ Socket.IO emit ──▶│
      │                        │                       │ (new-order)        │
      │                        │                       │                    │
      │                        │                       │◀─ Barista updates ─┤
      │                        │                       │ PREPARING→READY    │
      │                        │                       │                    │
      │◀──── ItemStatus Update─────────────────────────┤                    │
      │                        │                       │                    │
      ├─ Check inventory ──────────────────────────────────────────────────▶│
      │ (when READY)           │                       │                    │
      │                        │                       │                    │
      │◀────InventoryUpdated───────────────────────────────────────────────┤
      │ (stock consumed)       │                       │                    │
```

### 4.3 Staff Management (HRM) Flow

```
Admin/Manager              Frontend              Gateway           User Service
     │                        │                    │                    │
     ├─ Manage Staff ────────▶│                    │                    │
     │ (create/schedule)      │                    │                    │
     │                        │                    │                    │
     │                        ├─ POST /api/users/staff ──────────────▶│
     │                        │                    │                  │
     │                        │     ┌────────────────────────────────┐
     │                        │     │ Gateway RBAC check:           │
     │                        │     │ Role must be ADMIN|MANAGER    │
     │                        │     └────────────────────────────────┘
     │                        │                    │                  │
     │                        │                    ├─ Create Staff    │
     │                        │                    │ Save to PostgreSQL
     │                        │                    │◀──┘              │
     │                        │◀─ Staff Created ───┤                  │
     │◀─ Confirm ─────────────┤                    │                  │
     │                        │                    │                  │
     ├─ Schedule Shift ──────▶│                    │                  │
     │                        │                    │                  │
     │                        ├─ POST /api/users/staff/schedules ────▶│
     │                        │                    │                  │
     │                        │                    ├─ Create Schedule │
     │                        │                    │◀──┘              │
     │                        │◀─ Schedule Created ┤                  │
     │◀─ Confirm ─────────────┤                    │                  │
```

### 4.4 Payment Processing Flow

```
Frontend              Gateway              Order Service         Payment Service
   │                    │                       │                      │
   ├─ Order Complete   ─▶│                       │                      │
   │ (customer ready   │ (for payment)          │                      │
   │  to pay)          │                        │                      │
   │                   │                        │                      │
   │                   │                        ├─ Create Payment ─────▶│
   │                   │                        │                      │
   │                   │                        │ (via internal token) │
   │                   │                        │                      │
   │                   │◀─ Payment Details ─────┤◀──────────────────────┤
   │◀─ Show Payment    ─┤                       │                      │
   │   Options         │                        │                      │
   │                   │                        │                      │
   ├─ Choose CASH ─────▶│                       │                      │
   │                   │                        │                      │
   │                   ├─ POST /api/v1/payments ──────────────────────▶│
   │                   │ (CASH provider)        │                      │
   │                   │                        │                      │
   │                   │     ┌──────────────────────────────────────┐  │
   │                   │     │ Payment Service:                    │  │
   │                   │     │ • Create CASH payment (PENDING)     │  │
   │                   │     │ • Return paymentId                  │  │
   │                   │     └──────────────────────────────────────┘  │
   │                   │                        │                      │
   │                   │◀─ Payment Ready ───────┤                      │
   │◀─ Wait Staff ──────┤ (for confirmation)    │                      │
   │   Confirmation    │                        │                      │
   │                   │                        │                      │
   │                   ├─ POST /api/v1/payments/{id}/confirm-cash ────▶│
   │                   │ (staff confirms)       │                      │
   │                   │                        │                      │
   │                   │                        │                      │
   │                   │     ┌──────────────────────────────────────┐  │
   │                   │     │ Payment Service:                    │  │
   │                   │     │ • Verify amount                     │  │
   │                   │     │ • Update status to PAID             │  │
   │                   │     └──────────────────────────────────────┘  │
   │                   │                        │                      │
   │                   │◀─ PAID Confirmation ───┤◀──────────────────────┤
   │◀─ Order Complete ──┤                       │                      │
```

### 4.5 Inventory & Menu Sync Flow

```
Admin/Manager         Frontend           Gateway          Inventory Service
      │                  │                  │                    │
      ├─ Add Ingredient ─▶│                  │                    │
      │                  │                  │                    │
      │                  ├─ POST /api/v1/ingredients ───────────▶│
      │                  │                  │                    │
      │                  │                  │    ┌──────────────┐
      │                  │                  │    │ Create item  │
      │                  │                  │    │ Save to DB   │
      │                  │                  │    └──────────────┘
      │                  │                  │                    │
      │                  │◀─ Ingredient OK ─┤◀──────────────────┘
      │◀─ Confirm ───────┤                  │
      │                  │                  │
      ├─ Import Stock ───▶│                  │
      │                  │                  │
      │                  ├─ POST /api/v1/ingredients/stock/import ──▶│
      │                  │                  │                    │
      │                  │                  │    ┌──────────────┐
      │                  │                  │    │ Record import│
      │                  │                  │    │ Update stock │
      │                  │                  │    │ Save movement│
      │                  │                  │    └──────────────┘
      │                  │                  │                    │
      │                  │◀─ Stock Updated ─┤◀──────────────────┘
      │◀─ Confirm ───────┤                  │
      │                  │                  │

                    MENU SYNC (Automatic or Triggered)

Order Service                                Inventory Service
      │                                              │
      ├─ Request sync /api/v1/ingredients/sync-menu ───────▶│
      │                                              │
      │◀─ Synced Recipes/Ingredients ─────────────────────┘
      │ (Menu becomes aware of available stock)
```

### 4.6 Reporting & Analytics Flow

```
Admin/Manager         Frontend           Gateway          Report Service
      │                  │                  │                    │
      ├─ View Dashboard ─▶│                  │                    │
      │                  │                  │                    │
      │                  ├─ GET /api/reports/dashboard ───────▶│
      │                  │                  │                    │
      │                  │                  │    ┌──────────────┐
      │                  │                  │    │ Query DB:    │
      │                  │                  │    │ • Sales data │
      │                  │                  │    │ • Order count│
      │                  │                  │    │ • Revenue    │
      │                  │                  │    └──────────────┘
      │                  │                  │                    │
      │                  │◀─ Dashboard Data ┤◀──────────────────┘
      │◀─ Show Charts ───┤                  │
      │                  │                  │
      ├─ View Top Items ─▶│                  │
      │                  │                  │
      │                  ├─ GET /api/reports/top-items ──────▶│
      │                  │                  │                  │
      │                  │◀─ Rankings ──────┤◀────────────────┘
      │◀─ Show List ─────┤                  │
```

---

## 5. Service Matrix

```
┌──────────────────┬─────────┬──────────┬───────────────────────────────────┐
│ Service          │ Runtime │ Port     │ Primary Responsibility            │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ Frontend         │ React   │ 80/8088  │ UI + Reverse Proxy                │
│                  │ + Vite  │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ api-gateway      │ NestJS  │ 8080     │ Route, Auth, RBAC, Proxy          │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ user-service     │ Spring  │ 3000     │ Auth, Staff, Branch, Customer, HR │
│                  │ Boot    │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ table-service    │ Spring  │ 3003     │ Tables, QR, Call-Staff            │
│                  │ Boot    │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ order-service    │ NestJS  │ 3001     │ Menu, Orders, KDS, Promotions     │
│                  │ + Prism │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ chat-service     │ NestJS  │ 3007     │ Realtime Chat + Socket.IO         │
│                  │ + S.IO  │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ inventory-svc    │ NestJS  │ 3005     │ Stock, Ingredients, Movements     │
│                  │ + Prism │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ payment-service  │ NestJS  │ 3004     │ CASH/SEPAY Payments, Invoices     │
│                  │ + Prism │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ report-service   │ NestJS  │ 3006     │ Analytics, Dashboards, Exports    │
│                  │ + Prism │          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ ai-service       │ FastAPI │ 3010     │ Forecasting, Anomalies, Chat AI   │
│                  │ (Python)│          │                                   │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ PostgreSQL       │ DB      │ 5432     │ Core Persistent Data              │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ Redis            │ Cache   │ 6379     │ Cache, Realtime Coordination      │
├──────────────────┼─────────┼──────────┼───────────────────────────────────┤
│ Kafka            │ Broker  │ 9092     │ Event Streaming, Async Pub/Sub    │
└──────────────────┴─────────┴──────────┴───────────────────────────────────┘
```

---

## 6. RBAC & Access Control Flows

```
┌────────────────────────────────────────────────────────────────┐
│                    JWT Token (from User Service)               │
│  {sub, email, role, branchId, permissions}                    │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ API Gateway Check  │
    └────────┬───────────┘
             │
    ┌────────┴────────────────┬──────────────────┐
    │                         │                  │
    ▼                         ▼                  ▼
PUBLIC ROUTES         ROLE-BASED ROUTES    BRANCH-SCOPED ROUTES
/api/users/login      /api/users/staff     /api/branches/{id}
/api/orders/menu      /api/reports/*       /api/orders?branchId=X
/api/tables/*/qr      /api/admin/*         /api/v1/ingredients
/api/chats            /api/attendance      ?branchId=X
                      /api/payroll


                        ROLE TREE
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
      ADMIN           MANAGER              STAFF
        │                   │                   │
    ┌───┴────────┐      ┌───┴────────┐     ┌───┴────────┐
    │            │      │            │     │            │
    ▼            ▼      ▼            ▼     ▼            ▼
  MULTI-    CROSS-   SINGLE-    BRANCH-  ROLE-     BRANCH-
  BRANCH    SERVICE  BRANCH     LOCKED   LOCKED    LOCKED
  ADMIN     CALLS    MANAGER    VIEWS    TASK      OPERATIONS
            ALL      DATA FOR   FOR      SPECIFIC  (WAITER,
            BRANCHES THEIR      THEIR    BRANCH    BARISTA,
                     BRANCH     BRANCH             STAFF)

Legend:
  • ADMIN: Full system access across all branches
  • MANAGER: Limited to assigned branch, can manage staff/operations
  • WAITER/BARISTA/STAFF: Can perform their role's tasks in their branch
  • CUSTOMER: Public menu/order/chat only
```

---

## 7. Data Flow by User Type

### 7.1 Customer Journey

```
CUSTOMER
    │
    ├─→ [PUBLIC] Menu via QR
    │   GET /api/orders/menu?tableId=X
    │
    ├─→ [PUBLIC] Create Order
    │   POST /api/orders
    │   └─→ Kafka: OrderCreated
    │       └─→ KDS updates
    │
    ├─→ [PUBLIC] Order History
    │   GET /api/orders/history
    │   └─→ Linked to email/phone
    │
    ├─→ [PUBLIC] Chat Support
    │   POST /api/chats (REST)
    │   WS /chat (Socket.IO)
    │
    ├─→ [PUBLIC] Payment
    │   POST /api/v1/payments (CASH/SEPAY)
    │
    └─→ [PUBLIC] Points/Offers
        GET /api/users/customer/profile
        GET /api/users/customer/offers
```

### 7.2 Staff Journey

```
STAFF (WAITER/BARISTA/etc)
    │
    ├─→ [AUTHENTICATED] See My Branch Tables
    │   GET /api/tables (filtered by branchId)
    │
    ├─→ [AUTHENTICATED] View Orders for My Branch
    │   GET /api/orders (filtered by branchId)
    │
    ├─→ [AUTHENTICATED] Update Order/Item Status
    │   PATCH /api/orders/{id}/items/{itemId}/status
    │   └─→ KDS workflow (PREPARING→READY→DONE)
    │
    ├─→ [AUTHENTICATED] Receive/Send Chat
    │   GET|POST /api/chats/{id}/messages
    │   WS /chat with join-staff event
    │
    ├─→ [STAFF ROLE] Confirm Payment (if WAITER/BARISTA/STAFF)
    │   POST /api/v1/payments/{id}/confirm-cash
    │
    └─→ [AUTHENTICATED] Check In/Out (if allowed)
        POST /api/users/staff/attendance/check-in
        POST /api/users/staff/attendance/check-out
```

### 7.3 Manager Journey

```
MANAGER (role=MANAGER, branchId=X)
    │
    ├─→ [MANAGER ONLY] Staff Management
    │   GET|POST|PATCH|DELETE /api/users/staff
    │   └─→ Scoped to own branch
    │
    ├─→ [MANAGER ONLY] Schedule/Payroll
    │   POST /api/users/staff/schedules
    │   GET /api/users/staff/payroll
    │   └─→ Own branch only
    │
    ├─→ [MANAGER ONLY] Inventory
    │   GET|POST|PATCH /api/v1/ingredients
    │   POST /api/v1/ingredients/stock/*
    │   └─→ Own branch only
    │
    ├─→ [MANAGER ONLY] Menu Management
    │   GET|POST|PATCH /api/orders/admin/menu/*
    │   └─→ Own branch only
    │
    ├─→ [MANAGER ONLY] Promotions
    │   GET|POST|PATCH /api/orders/admin/promotions
    │   └─→ Own branch only
    │
    ├─→ [MANAGER ONLY] Reports
    │   GET /api/reports/* (filtered by branch)
    │   └─→ Own branch data
    │
    └─→ [MANAGER ONLY] AI Features (Forecast/Recommend)
        GET /api/ai/* (if available)
        └─→ Own branch insights
```

### 7.4 Admin Journey

```
ADMIN (role=ADMIN, branchId=null or ignored)
    │
    ├─→ [ADMIN ONLY] Cross-Branch Staff
    │   GET|POST|PATCH|DELETE /api/users/staff
    │   └─→ ALL branches
    │
    ├─→ [ADMIN ONLY] Branch Management
    │   GET|POST|PATCH|DELETE /api/branches
    │   └─→ Create/manage branches
    │
    ├─→ [ADMIN ONLY] Cross-Branch Inventory
    │   GET|POST|PATCH /api/v1/ingredients
    │   └─→ ALL branches
    │
    ├─→ [ADMIN ONLY] Cross-Branch Menu
    │   GET|POST|PATCH /api/orders/admin/menu/*
    │   └─→ ALL branches
    │
    ├─→ [ADMIN ONLY] Cross-Branch Reports & Analytics
    │   GET /api/reports/* (no branch filter)
    │   └─→ System-wide insights
    │
    ├─→ [ADMIN ONLY] System Configuration
    │   Settings / SePay config / webhook setup
    │   └─→ Global system settings
    │
    └─→ [ADMIN ONLY] AI Features (Full)
        GET|POST /api/ai/* (all endpoints)
        └─→ System-wide AI training/forecasting
```

---

## 8. Data Store Interaction Matrix

```
┌────────────────┬──────────┬──────────┬────────┬───────┬───────────┐
│ Service        │ DB Type  │ Primary  │ Cache  │ Queue │ Realtime  │
│                │          │ Queries  │        │       │           │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ user-service   │ PostGres │ auth     │ Redis  │ -     │ -         │
│                │          │ profiles │        │       │           │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ table-service  │ PostGres │ tables   │ Redis  │ -     │ -         │
│                │          │ qr codes │        │       │           │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ order-service  │ PostGres │ orders   │ Redis  │Kafka  │ Kafka     │
│                │ + Prism  │ items    │        │ event │ events    │
│                │          │ menu     │        │ pub   │           │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ chat-service   │ PostGres │ chats    │ Redis  │ -     │ Socket.IO │
│                │          │ messages │        │       │ realtime  │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ inventory-svc  │ PostGres │ stock    │ Redis  │ Kafka │ Stock     │
│                │ + Prism  │ movement │        │ event │ updates   │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ payment-svc    │ PostGres │ payments │ Redis  │ -     │ Payment   │
│                │ + Prism  │ invoices │        │       │ webhooks  │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ report-svc     │ PostGres │ read-only│ Redis  │ -     │ -         │
│                │ + Prism  │ queries  │        │       │           │
├────────────────┼──────────┼──────────┼────────┼───────┼───────────┤
│ ai-service     │ Optional │ ML       │ Redis  │Kafka  │ -         │
│                │(Feast/   │ training │        │ event │           │
│                │MLflow)   │ features │        │ consume           │
└────────────────┴──────────┴──────────┴────────┴───────┴───────────┘
```

---

## 9. Event-Driven Architecture (Kafka)

```
┌─────────────────────────────────────────────────────────────┐
│                    KAFKA BROKER                             │
└────────────┬────────────────┬──────────────┬────────────────┘
             │                │              │
             ▼                ▼              ▼
        ┌──────────┐    ┌────────────┐  ┌────────────┐
        │ Orders   │    │ Inventory  │  │ Analytics  │
        │ Topic    │    │ Topic      │  │ Topic      │
        └────┬─────┘    └─────┬──────┘  └─────┬──────┘
             │                │              │
    ┌────────┴────────┐       │              │
    │                 │       │              │
    ▼                 ▼       ▼              ▼
┌─────────┐    ┌──────────┐ ┌──────┐   ┌────────┐
│ Order   │    │ Chat     │ │ Inv  │   │ Report │
│ Service │    │ Service  │ │ Svc  │   │ Service│
│ (Pub)   │    │(Sub)     │ │(Sub) │   │ (Sub)  │
└────┬────┘    └──────────┘ └──────┘   └────────┘
     │
     ├─ OrderCreated
     │  └─→ {orderId, tableId, items, timestamp}
     │
     ├─ ItemStatusChanged
     │  └─→ {itemId, status: PREPARING|READY|DONE}
     │
     └─ OrderCompleted
        └─→ {orderId, totalAmount, customerId}


EVENT CONSUMERS:
  • KDS (Kitchen Display) ←─ OrderCreated, ItemStatus
  • Inventory Sync ←─ ItemCompleted (auto-decrement stock)
  • Analytics ←─ OrderCompleted, ItemStatus
  • Payment ←─ OrderCompleted (trigger payment flow)
```

---

## 10. Deployment Context

```
┌────────────────────────────────────────────────────────────┐
│          Docker Compose (Local/Dev)                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Nginx (Frontend Reverse Proxy)                      │   │
│  │ • Port 80/8088                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ All Services (Containerized)                        │   │
│  │ • api-gateway:8080                                  │   │
│  │ • user-service:3000                                 │   │
│  │ • table-service:3003                                │   │
│  │ • order-service:3001                                │   │
│  │ • chat-service:3007                                 │   │
│  │ • inventory-service:3005                            │   │
│  │ • payment-service:3004                              │   │
│  │ • report-service:3006                               │   │
│  │ • ai-service:3010                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Data Layer                                          │   │
│  │ • PostgreSQL:5432                                   │   │
│  │ • Redis:6379                                        │   │
│  │ • Kafka:9092 (optional profile)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Monitoring/Logging (optional profiles)              │   │
│  │ • Prometheus                                        │   │
│  │ • Grafana                                           │   │
│  │ • ELK Stack (Elasticsearch, Logstash, Kibana)       │   │
│  │ • MLflow, Airflow, Feast (AI profile)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## 11. Request Lifecycle: From Client to Service

```
1. CLIENT REQUEST
   │
   └─→ http://localhost:8088/login
   
2. NGINX REVERSE PROXY
   │
   └─→ Route /api/* to Gateway
       └─→ Forward to http://api-gateway:8080
   
3. API GATEWAY (NestJS)
   │
   ├─→ Parse JWT token (if present)
   ├─→ Check route rules (public vs protected)
   ├─→ Validate RBAC (role check)
   ├─→ Validate branch scoping
   │
   └─→ Proxy to appropriate service
   
4. BACKEND SERVICE (NestJS/Spring)
   │
   ├─→ Validate JWT (service-level)
   ├─→ Handle business logic
   ├─→ Query PostgreSQL
   ├─→ Update Redis cache (if needed)
   ├─→ Publish Kafka events (if async)
   │
   └─→ Return response
   
5. GATEWAY RESPONSE
   │
   └─→ Forward response to client
   
6. CLIENT RECEIVES
   │
   └─→ Display/update UI
       ├─→ Render data
       ├─→ Show notifications
       ├─→ Listen for WebSocket updates
       │   (Chat, Order Status, etc.)
```

---

## 12. Inter-Service Communication Patterns

```
┌─────────────────────────────────────────────────────────┐
│             SYNCHRONOUS (HTTP/REST)                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Gateway ─HTTP─→ Services                                │
│ (external API)                                           │
│                                                          │
│ Order Service ─HTTP─→ Inventory Service                 │
│ (query stock)          (via internal token)             │
│                                                          │
│ Order Service ─HTTP─→ Payment Service                   │
│ (create payment)       (via internal token)             │
│                                                          │
│ Gateway ─HTTP─→ Table Service                           │
│ (validate table)       (JWT forwarded)                  │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            ASYNCHRONOUS (Kafka Events)                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Order Service ─Event─→ Kafka                            │
│ (publish)              Topic: orders                    │
│                             ↓                           │
│                  ┌──────────┴──────────┐                │
│                  ▼                     ▼                │
│            Chat Service           Inventory Svc        │
│            (consume order)        (consume item ready) │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│          REALTIME (WebSocket / Socket.IO)               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Chat Service ─WS─→ Clients (Chat rooms)                │
│                    namespace: /chat                     │
│                    rooms: {tableId}, table:{tableId}    │
│                                                          │
│ Order Service ─Event→ Socket.IO ─WS─→ KDS Screens      │
│ (item status)  (indirect)             (realtime)       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 13. Technology Stack Summary

```
FRONTEND LAYER
├─ React 18+ (UI Framework)
├─ Vite (Build Tool)
├─ Nginx (Reverse Proxy)
└─ Socket.IO Client (Realtime)

API GATEWAY
└─ NestJS (Node.js Framework)
   ├─ JWT Middleware
   ├─ RBAC Guards
   └─ HTTP Proxy

BACKEND SERVICES
├─ user-service: Spring Boot + PostgreSQL
├─ table-service: Spring Boot + PostgreSQL
├─ order-service: NestJS + Prisma + PostgreSQL
├─ chat-service: NestJS + Socket.IO + PostgreSQL + Redis
├─ inventory-service: NestJS + Prisma + PostgreSQL
├─ payment-service: NestJS + Prisma + PostgreSQL + SePay Integration
├─ report-service: NestJS + Prisma + PostgreSQL
└─ ai-service: FastAPI (Python) + Optional (Feast, MLflow)

DATA STORES
├─ PostgreSQL (Primary DB)
├─ Redis (Cache & Realtime)
└─ Kafka (Event Streaming) - Optional

INFRASTRUCTURE
├─ Docker Compose (Local/Dev)
├─ Kubernetes (Possible Production)
├─ Prometheus + Grafana (Monitoring - Optional)
├─ ELK Stack (Logging - Optional)
├─ Airflow + MLflow (ML Ops - Optional)
└─ GitHub Actions (CI/CD)
```

---

## 14. Critical Paths & Bottlenecks

```
CRITICAL PATH 1: Customer Order Placement
┌─────────────────────────────────────────────────┐
│ Frontend         → Gateway      → Order Service │
│ POST /api/orders → Validate JWT → Create order  │
│                                  → Kafka event  │
│ ⚠️ BOTTLENECK: Order Service write latency       │
│             (Kafka, DB commit)                  │
└─────────────────────────────────────────────────┘

CRITICAL PATH 2: KDS (Kitchen Display)
┌─────────────────────────────────────────────────┐
│ Kafka           → Chat Service  → Frontend (WS) │
│ OrderCreated    → Broadcast     → KDS refresh   │
│ ⚠️ BOTTLENECK: Socket.IO broadcast latency       │
│             (many concurrent KDS screens)       │
└─────────────────────────────────────────────────┘

CRITICAL PATH 3: Payment Confirmation
┌─────────────────────────────────────────────────┐
│ Frontend → Gateway → Payment Service → Response │
│ CASH confirmation   Create/Update PAID          │
│ ⚠️ BOTTLENECK: Payment DB commit + order status │
│             (must be atomic)                    │
└─────────────────────────────────────────────────┘

CRITICAL PATH 4: Inventory Sync on Item Ready
┌─────────────────────────────────────────────────┐
│ Order Service → Kafka/HTTP → Inventory Service │
│ ItemReady event           → Decrement stock     │
│ ⚠️ BOTTLENECK: Kafka unavailability             │
│             (fallback to HTTP, manual retry)    │
└─────────────────────────────────────────────────┘
```

---

## 15. Error Handling & Resilience

```
SCENARIO 1: Order Service Down
├─→ Gateway returns 503 Service Unavailable
├─→ Frontend shows "Order service temporarily down"
├─→ Customer can't place orders
└─→ Recommendation: Load balance across replicas

SCENARIO 2: Kafka Broker Down
├─→ Order Service fails to publish events
├─→ Fallback: HTTP calls to services (inventory, payment)
├─→ KDS updates via Socket.IO direct push instead
└─→ Recommendation: Use Kafka replication + monitoring alerts

SCENARIO 3: PostgreSQL Connection Pool Exhausted
├─→ Services queue requests (may timeout)
├─→ Gateway returns 429 Too Many Requests
├─→ Circuit breaker trips on gateway
└─→ Recommendation: Increase pool size, caching layer

SCENARIO 4: Payment Service Webhook Failure
├─→ Payment marked as PENDING
├─→ Manual reconciliation required
├─→ Webhook relay mechanism retries
└─→ Recommendation: Implement idempotent webhook handlers

SCENARIO 5: Redis Cache Miss / Restart
├─→ Services fall back to database queries
├─→ Performance degrades (expected)
├─→ Cache warms up as requests hit
└─→ Recommendation: Implement cache preloading
```

---

## Quick Reference: API Endpoints by Service

```
USER SERVICE (/api/users)
├─ POST /users/login
├─ POST /users/register
├─ GET /users/profile
├─ POST /users/customer/*
├─ GET|POST|PATCH|DELETE /users/staff*
├─ POST /users/staff/attendance/*
├─ GET|POST|PATCH|DELETE /branches*
└─ GET /branches/{id}/reports/sales

TABLE SERVICE (/api/tables)
├─ GET /tables
├─ POST /tables
├─ GET|PATCH|DELETE /tables/{id}
├─ GET /tables/{id}/qr
├─ POST /tables/qr/batch
└─ POST /tables/{id}/call-staff

ORDER SERVICE (/api/orders)
├─ GET /orders/menu
├─ POST /orders
├─ GET /orders/history
├─ GET|PATCH /orders/{id}*
├─ PATCH /orders/{id}/items/{itemId}/status
├─ GET|POST|PATCH|DELETE /orders/admin/menu/*
├─ GET|POST|PATCH /orders/admin/promotions/*
└─ GET /orders/recommendations

CHAT SERVICE (/api/chats)
├─ GET /chats
├─ POST /chats
├─ POST /chats/{id}/messages
├─ GET /chats/{id}/messages
└─ PATCH /chats/{id}/close

INVENTORY SERVICE (/api/v1/ingredients)
├─ GET /v1/ingredients
├─ POST /v1/ingredients
├─ PATCH|DELETE /v1/ingredients/{id}
├─ POST /v1/ingredients/stock/import
├─ POST /v1/ingredients/stock/adjust
├─ GET /v1/ingredients/stock/movements
└─ POST /v1/ingredients/sync-menu

PAYMENT SERVICE (/api/v1/payments)
├─ POST /v1/payments
├─ GET /v1/payments/{id}
├─ POST /v1/payments/{id}/verify
├─ POST /v1/payments/{id}/confirm-cash
├─ GET /v1/payments/online/qr
└─ POST /v1/payments/webhook*

REPORT SERVICE (/api/reports)
├─ GET /reports/dashboard
├─ GET /reports/daily-stats
├─ GET /reports/revenue
├─ GET /reports/top-items
├─ GET /reports/inventory
├─ GET /reports/staff-performance
└─ GET /reports/export

AI SERVICE (/api/ai)
├─ GET /api/ai/health
├─ GET /api/ai/recommend/*
├─ POST /api/ai/anomalies/*
├─ POST /api/ai/sentiment
├─ POST /api/ai/forecast/*
└─ POST /api/ai/chatbot
```

---

**End of Service Architecture Map**

This document provides comprehensive visual and textual representations of how all services in the coffe-shop system interact, communicate, and serve different user types.
