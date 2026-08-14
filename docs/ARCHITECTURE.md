# Architecture notes

## Request path

`HTTP DTO + validation pipe → OrderService admission → OrderRepository / dispatch port → OrderFulfillmentService → CourierAdapter`.

The boundary is deliberately small: providers implement `create`, `track`, and `cancel`; only normalized domain types reach controllers. Adding a provider is a new adapter plus registry registration, not an API rewrite.

## Reliability choices

- A canonical SHA-256 fingerprint makes an identical `orderId` request a safe replay and a changed payload a `409 IDEMPOTENCY_CONFLICT`.
- The API rejects unknown fields instead of silently ignoring ambiguous input.
- The request-context middleware emits/accepts `x-request-id`; structured Pino logs redact authorization, cookies, passwords, and API keys.
- Provider calls use a bounded `AbortController` timeout and surface safe provider errors.

## Production evolution

The submitted local mode is intentionally dependency-free and uses the deterministic mock adapter. For a production deployment, replace `InMemoryOrderRepository` and `PendingOrderDispatcher` with the already-defined `OrderRepository` / `OrderDispatcher` ports backed by PostgreSQL, a transactional outbox, and BullMQ/Redis. That preserves the public API and adapter contracts while adding durable retries, batch processing, and reconciliation.
