# Multi-Courier Platform

A production-minded TypeScript/NestJS take-home that gives clients one normalized order API while isolating courier-specific integrations behind adapters.

## Why this design

- Stable client contract: validation, request IDs, predictable errors, and idempotent order admission.
- Extensible integrations: `CourierAdapter` keeps Urbanebolt mapping out of controllers and domain services.
- Operationally honest: a deterministic mock courier runs locally; Urbanebolt activates only when its UAT credentials are supplied.
- Evidence first: unit and HTTP contract tests demonstrate duplicate, validation, tracking, cancellation, and provider flows.

## Run it

```bash
npm ci
npm run start:dev
curl http://localhost:3000/api/v1/health/live
```

Or run the containerized local mock mode:

```bash
docker compose up --build
```

The API is documented through Swagger metadata in code. Import [`postman/Multi Courier Platform.postman_collection.json`](postman/Multi%20Courier%20Platform.postman_collection.json) to exercise the complete local journey.

## API

| Method | Endpoint                         | Purpose                                              |
| ------ | -------------------------------- | ---------------------------------------------------- |
| `POST` | `/api/v1/orders`                 | Validate and idempotently accept a normalized order. |
| `GET`  | `/api/v1/orders/:orderId/track`  | Return normalized provider state and events.         |
| `POST` | `/api/v1/orders/:orderId/cancel` | Cancel a pending/created order.                      |
| `GET`  | `/api/v1/health/live`            | Liveness probe.                                      |

Error responses have the shape `{ "error": { "code", "message", "requestId", "details?" } }`. Return `x-request-id` from callers to preserve correlation across systems.

## Courier configuration

`mock` requires no setup. To activate `urbanebolt`, copy `.env.example` and set:

```bash
URBANEBOLT_USERNAME=...
URBANEBOLT_PASSWORD=...
```

The adapter targets the supplied UAT endpoints, requests and caches a token, and applies an 8-second timeout by default. Credentials are never committed or logged.

## Quality gates

```bash
npm run verify
docker compose up --build
```

Architecture decisions, extension points, and intentional next production steps are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The reproducible final results are in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
