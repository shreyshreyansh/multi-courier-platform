# Architecture Notes

The canonical reviewer-facing design document is [DESIGN.md](../DESIGN.md).

This supporting note records the design boundary that must remain stable as the platform evolves:

```text
HTTP API -> admission service -> repository / dispatcher ports
                                  -> fulfilment service -> courier adapter registry -> adapter
```

- API consumers only use normalized order and error contracts.
- Couriers implement the three-operation adapter contract: create, track, cancel.
- Provider payloads, tokens, raw responses, and status vocabulary never belong in controllers or public DTOs.
- The current process-local repository and no-op dispatcher are intentional local-reference seams. Production work replaces them with PostgreSQL, an outbox, and a worker without rewriting consumer routes.

For the exact implementation status against the assignment, see [ASSIGNMENT-COVERAGE.md](ASSIGNMENT-COVERAGE.md).
