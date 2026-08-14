# Assignment Coverage and Evidence

This document is the reviewer-facing scope statement for the backend assignment. It distinguishes verified behavior from the remaining production slices. It is intentionally evidence-led: a capability is marked implemented only when there is direct source and test or deployment proof; a guarantee is never inferred from an in-memory demonstration or an unused table.

## Status legend

| Status      | Meaning                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Implemented | Present in the repository with direct source and/or automated-test evidence.                                         |
| Partial     | The boundary or part of the behavior is implemented, but an assignment-critical production property remains missing. |
| Planned     | The implementation is deliberately not present yet; the intended design is documented.                               |

## Requirement matrix

| Assignment requirement                                                     | Status      | Evidence                                                                                                                                                                                                                    | Notes                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Courier-agnostic create endpoint                                           | Implemented | [OrdersController](../src/orders/api/orders.controller.ts), [DTO](../src/orders/api/create-order.dto.ts)                                                                                                                    | POST /api/v1/orders receives a normalized payload and courierPartner.                                                                                                       |
| Courier-agnostic tracking and cancellation                                 | Implemented | [OrdersController](../src/orders/api/orders.controller.ts), [Fulfilment service](../src/orders/fulfillment/order-fulfillment.service.ts)                                                                                    | Uses internal order ID; provider details remain behind adapters.                                                                                                            |
| UrbaneBolt authentication, create, track, cancel                           | Implemented | [Adapter](../src/couriers/urbanebolt.adapter.ts), [contract test](../src/couriers/urbanebolt.adapter.spec.ts)                                                                                                               | Uses the supplied UAT endpoint shapes. Live UAT credentials are intentionally not used in CI.                                                                               |
| Future courier added without controller/DTO/business-logic changes         | Implemented | [CourierAdapter](../src/couriers/courier-adapter.ts), [registry](../src/couriers/courier-adapter.registry.ts), [MockCourier](../src/couriers/mock-courier.adapter.ts)                                                       | Adapter contract makes a provider an additive integration.                                                                                                                  |
| Second mock adapter as bonus                                               | Implemented | [MockCourierAdapter](../src/couriers/mock-courier.adapter.ts)                                                                                                                                                               | Deterministic, secret-free local lifecycle.                                                                                                                                 |
| Nested validation and a normalized error envelope                          | Implemented | [DTO](../src/orders/api/create-order.dto.ts), [exception filter](../src/common/all-exceptions.filter.ts), [API tests](../src/orders/orders.api.spec.ts)                                                                     | Validation rejects unknown fields and errors carry request ID and optional details.                                                                                         |
| Idempotency on order ID                                                    | Implemented | [OrderService](../src/orders/application/order.service.ts), [fingerprint](../src/orders/domain/request-fingerprint.ts)                                                                                                      | Identical retry is replayed; changed payload returns 409.                                                                                                                   |
| Per-order persistence, courier IDs/AWB, audit request/response, timestamps | Implemented | [Prisma schema](../prisma/schema.prisma), [PostgreSQL repository](../src/orders/infrastructure/postgres-order.repository.ts), [repository tests](../src/orders/infrastructure/postgres-order.repository.spec.ts)            | `PERSISTENCE_MODE=postgres` retains orders and allow-listed lifecycle metadata across API restart. The default memory mode is intentionally ephemeral.                      |
| Append-only tracking-history storage                                       | Implemented | [Tracking event schema](../prisma/schema.prisma), [fulfilment service](../src/orders/fulfillment/order-fulfillment.service.ts), [repository tests](../src/orders/infrastructure/postgres-order.repository.spec.ts)          | Normalized events are fingerprint-deduplicated by `(orderId, fingerprint)`; raw adapter payloads are not returned to API callers.                                           |
| Bulk endpoint for up to 100 orders                                         | Partial     | [Batch controller](../src/orders/api/orders.controller.ts), [batch service](../src/orders/application/batch.service.ts), [HTTP test](../src/orders/orders.api.spec.ts)                                                      | POST /orders/bulk accepts 1–100 orders and GET /batches/:batchId exposes per-item admission/current state. Batch state is process-local.                                    |
| Concurrent, asynchronous bulk dispatch with partial results                | Partial     | [Batch service](../src/orders/application/batch.service.ts), [in-process dispatcher](../src/orders/fulfillment/in-process-order.dispatcher.ts), [retry test](../src/orders/fulfillment/in-process-order.dispatcher.spec.ts) | Admission is concurrent; dispatch is deferred and has bounded retry. There is no durable queue or restart recovery yet.                                                     |
| Configurable retry/backoff, auth retry, reconciliation                     | Partial     | [Environment validation](../src/config/environment.ts), [dispatcher](../src/orders/fulfillment/in-process-order.dispatcher.ts), [retry test](../src/orders/fulfillment/in-process-order.dispatcher.spec.ts)                 | `DISPATCH_MAX_ATTEMPTS` and `DISPATCH_RETRY_BASE_DELAY_MS` bound in-process retries. Auth-refresh retry, jitter, a dead-letter path, and reconciliation remain future work. |
| Env-driven configuration and no committed secrets                          | Implemented | [.env.example](../.env.example), [environment validation](../src/config/environment.ts)                                                                                                                                     | Provider configuration is env-driven; test transport prevents CI secrets.                                                                                                   |
| Clear setup, design, test, and extension documentation                     | Implemented | [README](../README.md), [design](../DESIGN.md), [Postman collection](../postman/Multi%20Courier%20Platform.postman_collection.json)                                                                                         | The documents intentionally point to gaps rather than obscure them.                                                                                                         |

## Test evidence

The current automated suite covers:

- HTTP validation, request IDs, normalized errors, admission, replay, conflict, tracking, cancellation, batch submission, batch lookup, and the 100-order boundary;
- order-service idempotency behavior;
- item-level batch partial admission and batch state projection;
- deferred local dispatch and dispatch-failure logging without an unhandled rejection;
- bounded exponential retry for retryable in-process dispatch failures;
- fulfilment dispatch behavior and unavailable-courier failure isolation;
- PostgreSQL order admission/replay/conflict, sanitized attempts, and duplicate tracking-event suppression;
- tracking response containment: provider-only `raw` data cannot escape the controller;
- UrbaneBolt token acquisition, manifest mapping, tracking URL/status mapping, and AWB cancellation;
- health behavior.

Run the repository's quality gate with:

```bash
npm run verify
```

For the latest result and coverage threshold note, see [VERIFICATION.md](VERIFICATION.md).

## Remaining production slices

1. **Transactional dispatch outbox** - write an outbox record in the same transaction as admission, then publish it through an idempotent worker. This closes the crash window after a 202 response.
2. **Durable batch state** - make the existing `batches` and `batch_items` schema live, atomically retaining per-item admission and completion state across restart.
3. **Provider-aware reliability** - add jitter, one token-invalidating auth retry, dead-letter visibility, and reconciliation for ambiguous create results.
4. **UAT smoke profile** - add an opt-in, secret-backed environment that proves provider interoperability outside deterministic CI.

Each slice stays behind the existing repository, dispatcher, and adapter ports; it does not require changing consumer routes or courier adapters.
