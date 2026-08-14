# Verification report

## Verdict: PARTIAL — code quality gate green; container smoke pending

Verified on 2026-08-14 (Node 20+ compatible):

- `npm run verify` — formatting, lint, TypeScript build, 11 tests, and coverage gates pass.
- Coverage gate — statements/lines: 86%+, functions: 90%+, branches: 65% minimum (current 67%+).
- `docker compose up --build` — first image build began successfully; complete the health probe after the image layer build finishes.

The test suite covers idempotent create/replay/conflict, strict input validation, safe error envelopes, tracking/cancellation, mock-courier lifecycle behavior, and Urbanebolt UAT request/token mapping.
