# Verification Report

## Verdict: GREEN — durable order mode is reproducible

Verified on 2026-08-14 against the current source tree. The evidence below covers the normal local reviewer path and the PostgreSQL deployment path: schema migration, API health, batch admission, and idempotent replay after an API restart.

It proves durable **orders**, sanitized courier **attempts**, and append-only normalized **tracking events** when `PERSISTENCE_MODE=postgres`. It does not claim a transactional dispatch outbox, durable batch summaries, a worker/dead-letter queue, provider-auth retry, or reconciliation. Those remain intentionally visible in [ASSIGNMENT-COVERAGE.md](ASSIGNMENT-COVERAGE.md).

| Check                       | Result | Evidence                                                                                                                            |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Formatting                  | Passed | Prettier checked the complete repository.                                                                                           |
| Lint                        | Passed | ESLint completed with zero warnings.                                                                                                |
| TypeScript build            | Passed | NestJS application compiled successfully.                                                                                           |
| Automated tests             | Passed | 10 test files, 30 tests.                                                                                                            |
| Coverage                    | Passed | 85.89% statements/lines, 73.30% branches, 88.88% functions.                                                                         |
| Prisma schema               | Passed | `prisma validate` and client generation completed against `prisma/schema.prisma`.                                                   |
| Compose configuration       | Passed | `docker compose -f compose.yml config --quiet` succeeded.                                                                           |
| Compose migration/API smoke | Passed | PostgreSQL became healthy, `prisma migrate deploy` completed, and the API returned 200 from its liveness route.                     |
| Durable restart replay      | Passed | A two-order bulk submission was accepted, the API restarted, and submitting the exact same example produced two `replayed` results. |

## Commands used

```bash
npm run verify
DATABASE_URL='postgresql://courier:courier@localhost:5432/courier_platform?schema=public' npx prisma validate
DATABASE_URL='postgresql://courier:courier@localhost:5432/courier_platform?schema=public' npm run prisma:generate
docker compose -f compose.yml config --quiet
COMPOSE_PROJECT_NAME=multi_courier_final docker compose -f compose.yml up --build --detach
curl --fail --silent --show-error http://localhost:3000/api/v1/health/live
curl --fail --silent --show-error --request POST http://localhost:3000/api/v1/orders/bulk --header 'Content-Type: application/json' --data @examples/bulk-orders.json
COMPOSE_PROJECT_NAME=multi_courier_final docker compose -f compose.yml restart api
curl --fail --silent --show-error --request POST http://localhost:3000/api/v1/orders/bulk --header 'Content-Type: application/json' --data @examples/bulk-orders.json
COMPOSE_PROJECT_NAME=multi_courier_final docker compose -f compose.yml down --volumes
```

The disposable Compose project was removed after the proof, including its test-only volume. A normal reviewer invocation of `docker compose down` preserves the named data volume; `--volumes` is deliberately not suggested for ordinary use.

## Observable proof

The first bulk request accepted both example orders. After restarting only the API service, the second request returned `disposition: "replayed"` for both `ORDER-BULK-EXAMPLE-1001` and `ORDER-BULK-EXAMPLE-1002`. That is evidence that the idempotency decision survived the API process, rather than residing in a Node map.

Focused tests additionally prove:

- PostgreSQL admission create/replay/conflict behavior, including unique-key race recovery;
- persistence of safe `DISPATCH`, `TRACK`, and `CANCEL` attempt outcomes;
- duplicate tracking-event suppression through a stable SHA-256 fingerprint;
- bounded exponential retry for retryable in-process dispatch failures;
- controller response mapping that excludes an adapter-only `raw` field;
- strict nested validation, normalized errors and request IDs, batch boundaries, mock lifecycle behavior, and the UrbaneBolt contract through an injected transport.

## Reliability boundary

The durable repository closes the state-loss problem for orders, audit attempts, and tracking observations. The dispatcher intentionally remains process-local: it schedules after the HTTP response and retries transient failures with configurable bounded backoff, but a process crash can still occur between admission and a successful courier side effect. The next production slice is therefore an atomic order-plus-outbox write and an idempotent worker—not a claim that a timer is durable delivery infrastructure.

## UAT boundary

The suite does not call live UrbaneBolt UAT endpoints or use real credentials. Provider behavior is verified at the typed adapter boundary with an injected transport, keeping CI deterministic and keeping secrets out of logs and repository history. A secret-backed UAT smoke profile is a deliberate follow-up, not silently simulated by unit tests.
