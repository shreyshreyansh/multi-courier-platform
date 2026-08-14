# Delivery gate

## Goal

Deliver a public, production-minded multi-courier API submission that can be reviewed, run locally, and evaluated from its documentation.

## Green means

- `npm run verify` passes (format, lint, TypeScript build, tests, and coverage threshold).
- Contract/API tests cover the create, track, cancel, and bulk-order journeys plus validation and failure paths.
- `docker compose up --build` starts the API, worker, PostgreSQL, and Redis; a documented health/API smoke check succeeds.
- The repository includes OpenAPI output, a Postman collection, architectural rationale, setup instructions, and an explicit final verification report.
- The complete, committed history is pushed to `github.com/shreyshreyansh/multi-courier-platform`.

## Proof artifact

`docs/VERIFICATION.md` records the commands, results, environment, and final GREEN/RED verdict.

## Initial state

RED — repository created; implementation and proof artifacts have not been produced yet.
