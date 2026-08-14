# Assignment Coverage and Evidence

This document is the reviewer-facing scope statement for the backend assignment. It distinguishes verified behavior from the production slices that are still required. A small, explicit gap is more credible than a broad claim that the repository cannot prove.

## Status legend

| Status      | Meaning                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Implemented | Present in the repository with direct source and/or automated-test evidence.                                         |
| Partial     | The boundary or part of the behavior is implemented, but an assignment-critical production property remains missing. |
| Planned     | The implementation is deliberately not present yet; the intended design is documented.                               |

## Requirement matrix

| Assignment requirement                                                     | Status      | Evidence                                                                                                                                                              | Notes                                                                                                                             |
| -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Courier-agnostic create endpoint                                           | Implemented | [OrdersController](../src/orders/api/orders.controller.ts), [DTO](../src/orders/api/create-order.dto.ts)                                                              | POST /api/v1/orders receives a normalized payload and courierPartner.                                                             |
| Courier-agnostic tracking and cancellation                                 | Implemented | [OrdersController](../src/orders/api/orders.controller.ts), [Fulfilment service](../src/orders/fulfillment/order-fulfillment.service.ts)                              | Uses internal order ID; provider details remain behind adapters.                                                                  |
| UrbaneBolt authentication, create, track, cancel                           | Implemented | [Adapter](../src/couriers/urbanebolt.adapter.ts), [contract test](../src/couriers/urbanebolt.adapter.spec.ts)                                                         | Uses the supplied UAT endpoint shapes. Live UAT credentials are intentionally not used in CI.                                     |
| Future courier added without controller/DTO/business-logic changes         | Implemented | [CourierAdapter](../src/couriers/courier-adapter.ts), [registry](../src/couriers/courier-adapter.registry.ts), [MockCourier](../src/couriers/mock-courier.adapter.ts) | Adapter contract makes a provider an additive integration.                                                                        |
| Second mock adapter as bonus                                               | Implemented | [MockCourierAdapter](../src/couriers/mock-courier.adapter.ts)                                                                                                         | Deterministic, secret-free local lifecycle.                                                                                       |
| Nested validation and a normalized error envelope                          | Implemented | [DTO](../src/orders/api/create-order.dto.ts), [exception filter](../src/common/all-exceptions.filter.ts), [API tests](../src/orders/orders.api.spec.ts)               | Validation rejects unknown fields and errors carry request ID and optional details.                                               |
| Idempotency on order ID                                                    | Implemented | [OrderService](../src/orders/application/order.service.ts), [fingerprint](../src/orders/domain/request-fingerprint.ts)                                                | Identical retry is replayed; changed payload returns 409.                                                                         |
| Per-order persistence, courier IDs/AWB, audit request/response, timestamps | Partial     | [StoredOrder model](../src/orders/domain/order.types.ts), [in-memory repository](../src/orders/infrastructure/in-memory-order.repository.ts)                          | Model includes latest operational fields, but storage is process-local and provider audit payloads are not persistently retained. |
| Append-only tracking-history storage                                       | Planned     | [Design data model](../DESIGN.md#data-model)                                                                                                                          | Current adapter returns normalized events; no persistent event table exists.                                                      |
| Bulk endpoint for up to 100 orders                                         | Planned     | [Design completion path](../DESIGN.md#production-completion-path)                                                                                                     | POST /orders/bulk and batch-resource implementation are not present.                                                              |
| Concurrent, asynchronous bulk dispatch with partial results                | Planned     | [Design production target](../DESIGN.md#data-model)                                                                                                                   | Requires an outbox, worker, queue, batches, and item result persistence.                                                          |
| Configurable retry/backoff, auth retry, reconciliation                     | Partial     | [UrbaneBolt timeout and safe errors](../src/couriers/urbanebolt.adapter.ts)                                                                                           | Bounded timeout and normalized errors are present; durable retries, one auth refresh retry, and reconciliation are next slices.   |
| Env-driven configuration and no committed secrets                          | Implemented | [.env.example](../.env.example), [environment validation](../src/config/environment.ts)                                                                               | Provider configuration is env-driven; test transport prevents CI secrets.                                                         |
| Clear setup, design, test, and extension documentation                     | Implemented | [README](../README.md), [design](../DESIGN.md), [Postman collection](../postman/Multi%20Courier%20Platform.postman_collection.json)                                   | The documents intentionally point to gaps rather than obscure them.                                                               |

## Test evidence

The current automated suite covers:

- HTTP validation, request IDs, normalized errors, admission, replay, conflict, tracking, and cancellation;
- order-service idempotency behavior;
- fulfilment dispatch behavior and unavailable-courier failure isolation;
- UrbaneBolt token acquisition, manifest mapping, tracking URL/status mapping, and AWB cancellation;
- health behavior.

Run the repository's quality gate with:

```bash
npm run verify
```

For the latest result and coverage threshold note, see [VERIFICATION.md](VERIFICATION.md).

## Planned completion slices

1. **Durable order and audit repository** - add Prisma schema/migrations and a PostgreSQL implementation of the existing repository port.
2. **Event history and provider attempts** - add append-only tracking events, sanitized request/response attempts, and reconciliation metadata.
3. **Reliable dispatch** - add transactional outbox records, BullMQ queue, worker, idempotent job keys, retry policy, and safe auth refresh.
4. **Bulk API** - add atomic 1-100 order admission, batch/item tables, a 202 batch response, and per-order completion/read endpoint.
5. **UAT smoke profile** - add an opt-in secret-backed environment that proves provider interoperability outside CI.

Each slice can be added behind the current repository, dispatcher, and adapter ports without changing existing consumer routes or courier adapter implementations.
