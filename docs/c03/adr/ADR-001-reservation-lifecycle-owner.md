# ADR-001 — Where is the authoritative Reservation lifecycle decision owned?

Status: Accepted for the C03 baseline

Date: 2026-10-05

## Context

Baseline v0.2 permits both immediate confirmation and delayed Admin approval.
Create and Approve may execute concurrently, while BR-02 requires that two
overlapping Reservations of one Agent never both become `CONFIRMED`.

The AS-IS implementation placed lifecycle decisions and Prisma writes in several
HTTP route handlers. That made the transport layer a co-owner of the same invariant
and duplicated expiration behavior across query routes.

## Drivers

- BR-02 and REQ-07/REQ-10: preserve the exclusive-Agent invariant under concurrency.
- REQ-09 to REQ-12: delayed approval state must persist and be revalidated later.
- The `currentTime >= startTime` expiration boundary must be applied consistently.
- AR-01: authentication and Admin authorization must remain outside domain decisions.
- The current project uses one Next.js process and SQLite; operational complexity
  must remain proportional to the project.

## Alternative A — Reservation Service inside the current deployable

HTTP adapters authenticate actors, validate transport input and invoke one
`Reservation Service`. The service owns all Reservation lifecycle transitions,
availability rules and transaction boundaries. Prisma/SQLite remains the persistence
adapter in the same process.

## Alternative B — separate Reservation Decision Service

The Next.js application forwards Create, Cancel and Approve commands to a separately
deployed service. That service owns the lifecycle and its own database boundary.

## Decision

Choose Alternative A: a modular monolith with one in-process `Reservation Service`.

## Reason

Both alternatives can provide a single lifecycle owner. Alternative A preserves the
atomic SQLite transaction used by the verified concurrency scenarios, adds no network
failure mode and is directly testable in the existing application. Alternative B
would require an independently owned database or distributed consistency protocol;
with the current load and deployment, that cost has no supporting driver.

## Accepted negative consequences

- Reservation throughput and deployment scale with the whole Next.js process.
- The service currently depends on the Prisma persistence adapter rather than a
  database-independent repository implementation.
- Long-running background workflows would still share the web deployable.
- SQLite remains a single-node persistence boundary.

## Reconsider when

- Reservation decisions require independent scaling or deployment;
- approval processing becomes event-driven or must continue without the web process;
- multiple application instances or a distributed database replace the current
  single-process SQLite runtime;
- an external integration introduces retries or failure isolation that cannot be
  handled safely inside the current deployable.
