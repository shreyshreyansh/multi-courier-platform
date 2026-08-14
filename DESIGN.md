# Design: Multi-Courier Integration Platform

## Executive summary

The system exposes one internal shipment API and treats each courier as a replaceable integration plugin. The public contract is normalized around an internal order ID, shipper/consignee addresses, parcel dimensions, invoice data, and a courier-partner identifier. UrbaneBolt is the first real boundary; MockCourier proves the same contract works without a live provider.

The central design decision is to make provider behavior an edge concern. Controllers, API DTOs, idempotency, lifecycle rules, and consumers work entirely with normalized types. Courier-specific authentication, request mapping, response parsing, and status translation are isolated in adapters.

## Goals and non-goals

| Goals                                      | Non-goals in the current reference implementation          |
| ------------------------------------------ | ---------------------------------------------------------- |
| One stable API for all courier partners    | A customer-facing UI                                       |
| New providers without route or DTO changes | A provider-specific API exposed to clients                 |
| Deterministic local development and CI     | Real UrbaneBolt credentials in source control or CI        |
| Safe API admission and consistent errors   | Pretending that in-memory state is durable storage         |
| A path to production-grade async dispatch  | Hiding the remaining database, worker, and durability work |

The [assignment coverage matrix](docs/ASSIGNMENT-COVERAGE.md) is the source of truth for implementation completeness.

## Architecture

```mermaid
flowchart TB
    Consumer["Order management system"] --> Controller["OrdersController<br/>normalized HTTP API"]
    Controller --> Admission["OrderService<br/>idempotent admission"]
    Controller --> Batch["BatchService<br/>1–100 item admission"]
    Batch --> Admission
    Admission --> Repository["OrderRepository port"]
    Admission --> Dispatcher["OrderDispatcher port"]
    Dispatcher --> Lifecycle["OrderFulfillmentService"]
    Lifecycle --> Registry["CourierAdapterRegistry"]
    Registry --> Mock["MockCourierAdapter"]
    Registry --> Urbane["UrbaneboltAdapter"]
    Urbane --> UAT["UrbaneBolt UAT"]

    subgraph Cross-cutting concerns
        Validation["ValidationPipe + nested DTOs"]
        RequestID["x-request-id middleware"]
        Errors["Normalized exception filter"]
        Logs["Pino logs + redaction"]
    end

    Controller -.-> Validation
    Controller -.-> RequestID
    Controller -.-> Errors
    Controller -.-> Logs
```

### Responsibility map

| Component                     | Owns                                                                       | Must not own                                         |
| ----------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| OrdersController              | HTTP status, parameter extraction, normalized request/response translation | Provider payloads or provider-specific error parsing |
| OrderService                  | Idempotent order admission and dispatch scheduling                         | Courier API calls                                    |
| OrderRepository               | Admission uniqueness and state persistence                                 | HTTP or provider mapping                             |
| BatchService                  | Batch summary, item-level admission outcomes, state projection             | Provider calls or a second order-validation contract |
| OrderFulfillmentService       | Lifecycle orchestration: dispatch, track, cancel                           | Provider credential management                       |
| CourierAdapterRegistry        | Selecting a configured adapter by partner                                  | Route selection or request validation                |
| CourierAdapter implementation | Auth, provider mapping, bounded HTTP calls, status normalization           | Public API DTOs or another provider's logic          |

## Why the Adapter pattern

Courier APIs differ in auth mechanisms, field names, cancel identifiers, error bodies, and status vocabularies. A conditional branch in the controller would couple every consumer change to every courier addition. The Adapter pattern gives each provider a narrow, testable implementation of the same port:

```ts
interface CourierAdapter {
  readonly partner: CourierPartner;
  create(order: StoredOrder): Promise<CourierDispatchResult>;
  track(order: StoredOrder): Promise<CourierTrackingResult>;
  cancel(order: StoredOrder): Promise<CourierCancelResult>;
}
```

The existing **MockCourierAdapter** and **UrbaneboltAdapter** implement the same three methods. A future Delhivery, Shiprocket, Bluedart, or DTDC adapter is additive. Existing routes, DTOs, lifecycle orchestration, and adapters remain closed to modification.

## Request lifecycle

### Admission and idempotency

```mermaid
sequenceDiagram
    participant C as Consumer
    participant A as API
    participant O as OrderService
    participant R as OrderRepository
    participant D as Dispatcher

    C->>A: POST /orders + x-request-id
    A->>A: Validate nested normalized DTO
    A->>O: create(command)
    O->>O: Canonicalize and SHA-256 fingerprint
    O->>R: admit(orderId, fingerprint)
    alt first request
        R-->>O: created / PENDING order
        O->>D: enqueue dispatch
        O-->>A: created
        A-->>C: 202 Accepted
    else same order ID, same payload
        R-->>O: replayed existing order
        O-->>A: replayed
        A-->>C: 202 Accepted
    else same order ID, changed payload
        R-->>O: conflict
        O-->>A: IDEMPOTENCY_CONFLICT
        A-->>C: 409 + normalized error
    end
```

The fingerprint canonicalizes object keys and omits undefined optional values before hashing. The same logical request therefore produces the same value even when JSON field order changes. The order ID is the natural client idempotency key; reusing it with a materially different payload is rejected rather than silently creating a second shipment.

### Provider lifecycle

The fulfilment service selects the adapter from the stored order's courier partner. Dispatch transitions PENDING to PROCESSING, calls the adapter, then persists the normalized provider shipment ID, AWB, and status. Tracking asks the same adapter for current state, persists a fingerprint-deduplicated normalized event history, and returns an API-owned response shape. Cancellation rejects delivered orders and is idempotent for already-cancelled ones.

The dispatcher schedules the lifecycle call after the HTTP request is admitted. It is intentionally in-process: it keeps courier latency out of the request path, retries retryable dispatch errors with bounded exponential backoff, and logs a terminal failure without producing an unhandled rejection. `memory` is the zero-dependency local default. `postgres` persists orders, lifecycle attempts, and tracking events through the same repository port. Neither mode makes the dispatch handoff crash-safe; that is the explicit transactional-outbox boundary.

### Batch admission and state projection

```mermaid
sequenceDiagram
    participant C as Consumer
    participant A as API
    participant B as BatchService
    participant O as OrderService
    participant D as In-process dispatcher

    C->>A: POST /orders/bulk (1–100 orders)
    A->>B: create(commands)
    par each normalized command
        B->>O: idempotent create(command)
        O->>D: schedule dispatch after response
    end
    B-->>A: batch ID + item admission results
    A-->>C: 202 Accepted
    C->>A: GET /batches/:batchId
    A->>B: project latest order states
    B-->>C: summary + current item states
```

The batch endpoint intentionally returns admission state, not a fictional synchronous courier result. A same-ID/different-payload collision becomes an item-level `IDEMPOTENCY_CONFLICT`; unaffected orders remain visible. The local map retains the batch only for the lifetime of the process. In PostgreSQL mode, individual order state is durable but the current batch projection is not yet persisted; the response contract makes no restart-safe batch promise.

## Data model

### Operating modes

The default `memory` repository stores:

- internal UUID and external order ID;
- selected courier partner, service type, and payment mode;
- SHA-256 request fingerprint and original normalized command;
- normalized lifecycle state;
- provider shipment ID, AWB, failure code/message, and timestamps.

The batch service separately holds a batch UUID and its item-level admission outcome, then projects current order state on lookup. This is sufficient to demonstrate partial-result semantics and deterministic local behavior. Neither orders nor batches survive a restart in this mode.

`PERSISTENCE_MODE=postgres` selects `PostgresOrderRepository`. It stores the same canonical order projection across API restarts and adds append-only, sanitized courier-attempt and tracking-event rows. A unique `orders.order_id` constraint and a unique `(tracking_events.order_id, fingerprint)` constraint enforce the two critical write invariants at the database boundary.

### PostgreSQL schema and planned tables

The deployed Prisma migration creates the following schema. The runtime-use column prevents the schema from being mistaken for a completed worker implementation.

| Table            | Key fields and indexes                                        | Runtime use today                                                 |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| orders           | unique order_id; request_fingerprint; partner/status index    | Canonical durable order projection and idempotent admission.      |
| courier_attempts | order_id, operation, created_at; sanitized scalar metadata    | Append-only lifecycle audit for dispatch, track, and cancel.      |
| tracking_events  | unique order_id plus payload fingerprint; chronological index | Append-only normalized observations, deduplicated on polling.     |
| batches          | batch_id and summary counters                                 | Schema provision only; current batch service is process-local.    |
| batch_items      | unique batch_id plus order_id                                 | Schema provision only; written by the future durable batch slice. |
| outbox_events    | unpublished-event index and deterministic aggregate key       | Schema provision only; no worker or publisher claims yet.         |

The orders table owns the latest projection. Tracking events are append-only because the latest provider status alone is not enough to debug a disputed delivery.

## UrbaneBolt integration boundary

The adapter performs four provider interactions:

1. **POST /api/v1/auth/getToken/** to authenticate and cache the access token.
2. **POST /api/v1/services/manifest/** to create a shipment from the normalized order.
3. **GET /api/v1/services/tracking-pub/?awb=...** to retrieve shipment status.
4. **POST /api/v1/services/cancel/** to cancel by AWB.

It sends a bounded request with an AbortController timeout, never exposes raw provider bodies to the client, and maps values such as “In Transit” to the normalized **IN_TRANSIT** status. The contract test uses an injected fake fetch function to prove auth, URL, payload, status, and cancellation mappings without a live UAT account.

## Error, retry, and reconciliation strategy

The API emits a single error envelope with code, safe message, request ID, and optional field-level details. Validation failures and idempotency conflicts are distinct from provider failures. This keeps consumers independent of a courier's raw response wording.

The implemented in-process retry policy and the remaining production policy are distinct:

| Failure class                             | Action                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consumer validation                       | Reject synchronously with 400 and actionable field details.                                                                                                      |
| Unsupported or disabled courier           | Reject with a normalized client-facing code and configured partners.                                                                                             |
| Courier 4xx                               | Persist sanitized attempt; do not retry blindly; return a normalized provider-validation or rejection code.                                                      |
| Retryable dispatch failure                | Retry in-process up to `DISPATCH_MAX_ATTEMPTS` with deterministic exponential delay from `DISPATCH_RETRY_BASE_DELAY_MS`; record each attempt in PostgreSQL mode. |
| Timeout, network failure, or provider 5xx | The durable worker will use bounded backoff with jitter, retry state, and a dead-letter/reconciliation path.                                                     |
| Authentication rejection                  | Invalidate cached token, re-authenticate once, retry the original operation once.                                                                                |
| Timeout after ambiguous create            | Do not create a second shipment unless provider idempotency is proven. Mark for reconciliation by order ID.                                                      |

The current adapter provides a timeout and safe provider error mapping. The dispatcher retries only transient-looking dispatch failures; unsupported-adapter and client-side application errors do not loop. It is not a queue: a process crash can still lose scheduled work, and token-refresh retry, jitter, dead lettering, and reconciliation remain planned rather than implied.

## Security and operability

- **Input safety:** global validation transforms, whitelists, and rejects unknown properties; nested DTOs bound field length, type, numeric, phone, and country constraints.
- **Security headers:** Helmet is enabled before application routes.
- **CORS:** disabled by default rather than opened with a wildcard.
- **Correlation:** valid caller-provided **x-request-id** values are propagated; otherwise a UUID is created and returned.
- **Log redaction:** authorization, cookies, password, and API-key paths are censored in structured logs.
- **Secret handling:** UrbaneBolt credentials are environment-only and never appear in source, tests, or Postman examples.
- **Failure safety:** raw provider bodies and stack traces are kept out of client responses; the controller maps tracking to an API-owned safe shape.
- **Audit minimization:** durable attempt metadata is an allow-list of operational scalars; raw request/response bodies and address PII are not stored as audit metadata.

## Key trade-offs

| Decision                         | Benefit                                                    | Cost                                                        |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Normalized internal API          | Consumers and routes stay stable as providers change       | Adapter mapping work is required per provider.              |
| Order-ID fingerprint idempotency | Prevents accidental duplicate shipment admission           | Requires clear client ownership of order IDs.               |
| In-process async dispatcher      | Keeps HTTP admission fast and adds bounded transient retry | Loses work on crash; needs an outbox/worker for durability. |
| Memory default + PostgreSQL mode | Fast deterministic review plus durable order/audit history | Batch state and dispatch handoff are still not durable.     |
| No live UAT test in CI           | Reproducible tests without secrets or provider flakiness   | UAT smoke tests must be opt-in and separately recorded.     |

## Verification strategy

Unit and HTTP-contract tests are designed around observable behavior: create/replay/conflict, PostgreSQL unique-key recovery, audit/event persistence, tracking-response containment, batch admission and partial outcomes, the 100-order limit, bounded retry, invalid payload rejection, error shape, mock lifecycle, and UrbaneBolt mapping. The CI workflow runs formatting, linting, compilation, coverage, and a container build on pushes and pull requests. A disposable Compose proof exercises migration, API health, bulk admission, and restart-safe PostgreSQL replay.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the latest recorded command result and [docs/ASSIGNMENT-COVERAGE.md](docs/ASSIGNMENT-COVERAGE.md) for the implementation status of each assignment requirement.

## Production completion path

The clean next step is not to rewrite controllers. It is to make the existing `outbox_events`, `batches`, and `batch_items` schema provisions live behind the dispatcher and batch ports: atomic order-plus-outbox admission, an idempotent BullMQ worker, durable batch projections, and reconciliation for ambiguous provider outcomes. The public API and adapter contract stay stable while delivery becomes crash-safe.
