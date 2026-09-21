# Consistency notes

## Baseline v0.1

The accepted system model has no persisted intermediate reservation state.

A Create request:
1. validates input;
2. checks Agent activity;
3. checks interval semantics;
4. checks overlap;
5. checks User limit;
6. persists the Reservation directly as `CONFIRMED`.

If any step fails, no Reservation is created.

## Confirm semantics

The assignment requires the business meaning of Confirm Reservation to be explicit.

In this project, Confirm is not represented by a separate stored transition in v0.1.
It is the commit decision inside Create.

This must be explained consistently in:
- textual specification;
- use-case model;
- state diagram;
- activity diagram;
- verification examples.

## Baseline v0.2

When approval is required, the persisted waiting state is `PENDING_APPROVAL`.

No other intermediate reservation state is introduced.

## Cancel semantics

UC3 from the original team diagram is interpreted as cancellation, not physical deletion.
A Reservation transitions to `CANCELLED` so history is preserved.


## UC1 — global reservation overview

UC1 is intentionally **not scoped to the current User**.

The normal User can see all Reservation time slots in the system.
The UI presents them as a Gantt chart grouped by AI Agent.

This is a read-only overview and does not grant the User permission
to modify Reservations belonging to another User.

The exact owner/User details displayed in the chart remain TBD.
