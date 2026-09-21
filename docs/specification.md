# Reservation System — Specification

> **Accepted modeling decision:** The system does not persist an intermediate draft state.
> A create request is validated immediately. If all rules pass, the Reservation is stored
> directly as `CONFIRMED`. If validation fails, no Reservation is created.
>
> In baseline v0.1, **Confirm Reservation is therefore a logical confirmation step performed
> atomically inside Create Reservation**, not a separate persisted state transition.
> This decision is used consistently throughout the specification and diagrams.

# Specification Baseline v0.1

## Domain

The system allows Users to reserve compute time of a concrete AI Agent.

Each AI Agent is treated as an exclusive Resource in baseline v0.1:
at one moment, its compute time may be allocated by at most one overlapping
`CONFIRMED` Reservation.

---

# Domain rules

## BR-01 — Interval semantics

Reservation intervals use half-open semantics:

`[startTime, endTime)`

and must satisfy:

`startTime < endTime`

Therefore `[10:00,11:00)` and `[11:00,12:00)` do not overlap.

## BR-02 — Exclusive Agent invariant

At no committed system state may two `CONFIRMED` Reservations overlap
for the same AI Agent.

Two intervals overlap exactly when:

`existing.startTime < requested.endTime`
and
`existing.endTime > requested.startTime`

## BR-03 — Cancellation policy

A `CONFIRMED` Reservation can be cancelled only before its `startTime`.

If:

`currentTime < startTime`

the Reservation may transition to `CANCELLED`.

If:

`currentTime >= startTime`

cancellation is rejected.

Repeated cancellation of an already `CANCELLED` Reservation is idempotent:
the operation succeeds without another state change.

The source of `currentTime` is the reservation application's system clock.

## BR-04 — Maximum active reservations

A User may have at most `N` active Reservations.

In baseline v0.1, an active Reservation means a `CONFIRMED` Reservation
whose `endTime` has not yet passed.

`CANCELLED` Reservations do not count toward the limit.

`N` is configurable.

Concurrent requests must not allow a User to exceed `N`.

## BR-05 — Active Agent

Only an active AI Agent may receive a new `CONFIRMED` Reservation.

If the Agent is inactive, creation is rejected and no Reservation is created.

---

# OP-01 — Create Reservation

## Goal / user value

A User reserves compute time of an AI Agent in one operation.

## Trigger

A User submits an Agent, time interval and optional note.

## Observable requirements

**REQ-01:**  
For an existing active Agent and valid interval, the system shall create
a Reservation only if all confirmation rules are satisfied.

**REQ-02:**  
A successfully created Reservation shall be stored directly as `CONFIRMED`.

**REQ-03:**  
If any validation or business rule fails, no Reservation shall be created.

**REQ-04:**  
The system shall not create a Reservation if doing so would exceed BR-04.

## Preconditions

- User is identified by the submitted user data.
- Agent exists.
- Agent is active.
- `startTime < endTime`.
- User remains within the active Reservation limit.
- requested interval does not overlap another `CONFIRMED` Reservation
  of the same Agent.

## Success postcondition

- exactly one new Reservation exists;
- `Reservation.state = CONFIRMED`;
- the Reservation has a User and Agent;
- the returned Reservation ID equals the persisted Reservation ID;
- the interval now blocks the Agent.

## State change

`[none] → CONFIRMED`

## Referenced rules

BR-01, BR-02, BR-04, BR-05.

## Main success scenario

1. User submits Agent, interval and optional note.
2. System validates required input.
3. System validates the interval.
4. System verifies that the Agent exists and is active.
5. System checks for an overlapping `CONFIRMED` Reservation.
6. System verifies the User's active Reservation limit.
7. System creates the Reservation as `CONFIRMED`.
8. System returns the Reservation identifier, Agent identifier and state.

## Alternative / failure outcomes

- unknown or inactive Agent → reject; no Reservation created;
- invalid interval → reject; no Reservation created;
- overlapping `CONFIRMED` Reservation → reject; no Reservation created;
- active Reservation limit exceeded → reject; no Reservation created;
- persistence failure → no successful result is reported.

## Verification examples

- active Agent + free `[10:00,11:00)` → one `CONFIRMED` Reservation is created;
- `startTime == endTime` → rejected;
- inactive Agent → rejected;
- overlap with an existing `CONFIRMED` Reservation → rejected;
- User already has `N` active Reservations → rejected.

## Rationale

The current system has no persisted intermediate state. Validation and confirmation
are performed before the Reservation is committed.

---

# OP-02 — Check Availability

## Goal / user value

A User can determine whether an AI Agent is available for a requested interval.

## Trigger

A User requests availability for an Agent and interval.

## Observable requirement

**REQ-05:**  
For a valid interval, the system reports an active Agent as `UNAVAILABLE`
if the interval overlaps any `CONFIRMED` Reservation of that Agent;
otherwise it reports `AVAILABLE`.

An inactive Agent is `UNAVAILABLE`.

## Preconditions

- Agent exists.
- `startTime < endTime`.

## Success postcondition

- availability result is returned;
- no Reservation state is changed.

## State change

None.

## Referenced rules

BR-01, BR-02, BR-05.

## Main success scenario

1. User supplies Agent and interval.
2. System validates the interval.
3. System checks whether the Agent is active.
4. System checks overlap with `CONFIRMED` Reservations.
5. System returns `AVAILABLE` or `UNAVAILABLE`.

## Alternative / failure outcomes

- unknown Agent → reject;
- invalid interval → reject;
- inactive Agent → `UNAVAILABLE`.

## Verification examples

Existing `CONFIRMED`: `[10:00,11:00)`

- `[09:00,10:00)` → `AVAILABLE`
- `[10:30,11:30)` → `UNAVAILABLE`
- `[11:00,12:00)` → `AVAILABLE`

---

# OP-03 — Confirm Reservation

## Goal / user value

The system accepts a Reservation as a committed allocation of the Agent.

## Accepted baseline semantics

Baseline v0.1 does not expose a separate persisted pre-confirmation state.

Confirmation is performed **inside the Create Reservation transaction**.
A create request either:

- passes all confirmation checks and is stored as `CONFIRMED`; or
- fails and creates no Reservation.

Therefore OP-03 is an explicit business operation / decision, but not a separate
user-visible state transition in v0.1.

## Observable requirements

**REQ-06:**  
A Reservation may become committed only when:

- the Agent is active;
- the interval is valid;
- no overlapping `CONFIRMED` Reservation exists for the same Agent;
- the User does not exceed BR-04.

**REQ-07:**  
For concurrent conflicting create/confirm attempts, at most one Reservation
may be committed as `CONFIRMED`.

## Success postcondition

- exactly one persisted Reservation is `CONFIRMED`;
- the Reservation blocks the Agent for its interval;
- BR-02 remains true.

## Failure outcomes

- inactive Agent → no Reservation created;
- overlap exists → no Reservation created;
- invalid interval → no Reservation created;
- User limit exceeded → no Reservation created;
- concurrent conflict → at most one request succeeds.

## Verification examples

- valid create + active Agent + no overlap → `CONFIRMED`;
- overlapping create → rejected, no second Reservation created;
- two concurrent conflicting requests → at most one `CONFIRMED`.

## Rationale

The current API performs confirmation checks immediately during creation,
so introducing an artificial stored intermediate state would not describe
the actual accepted system behavior.

---

# OP-04 — Cancel Reservation

## Goal / user value

A User can withdraw an existing Reservation and release the Agent's interval.

## Trigger

A User requests cancellation of an existing Reservation.

## Observable requirement

**REQ-08:**  
A `CONFIRMED` Reservation can transition to `CANCELLED`
when `currentTime < startTime`.

## Preconditions

- Reservation exists.
- actor is authorized to cancel it.
- Reservation is `CONFIRMED` or already `CANCELLED`.

## Success postcondition

- `Reservation.state = CANCELLED`;
- the Reservation no longer blocks Agent availability.

## State change

`CONFIRMED → CANCELLED`

Repeated cancel:

`CANCELLED → CANCELLED`

## Referenced rules

BR-02, BR-03.

## Main success scenario

1. User requests cancellation.
2. System loads Reservation.
3. System verifies ownership / authorization.
4. System checks the state and time boundary.
5. System changes the state to `CANCELLED`.
6. System returns the current state.

## Alternative / failure outcomes

- Reservation does not exist → reject;
- unauthorized User → reject;
- `currentTime >= startTime` → reject;
- already `CANCELLED` → idempotent success.

## Verification examples

- `CONFIRMED` before start → `CANCELLED`;
- `CONFIRMED` exactly at start → rejected;
- already `CANCELLED` → success without another state change.

---

# Requirement acceptance review

## REQ-01 to REQ-04 — Create

- Meaning: creation includes immediate validation and commitment.
- Need: describes the current one-step reservation flow.
- Observable result: either one `CONFIRMED` Reservation exists or none exists.
- Feasibility: consistent with current persistence model.
- Verification: API response and persisted record can be compared by ID and values.
- State/time: interval boundaries and current active Reservations matter.
- Concurrency: simultaneous conflicting creates must not both succeed.
- Consistency: same overlap rule is used by Availability and confirmation checks.
- Uncertainty: no stored intermediate state is assumed.

## REQ-05 — Availability

- Meaning: only `CONFIRMED` Reservations block the Agent.
- Need: lets Users inspect availability before attempting creation.
- Observable result: `AVAILABLE` / `UNAVAILABLE`.
- Verification: boundary interval examples.
- State/time: uses `[start,end)`.
- Concurrency: result is a snapshot and may change before a later Create.
- Consistency: uses BR-02.
- Uncertainty: none.

## REQ-06 / REQ-07 — Confirm

- Meaning: confirmation is the commit decision inside Create.
- Need: separates the business meaning of allocation from merely receiving input.
- Observable result: successful Create produces `CONFIRMED`.
- Verification: successful create, conflict rejection, concurrency case.
- State/time: depends on Agent state and interval.
- Concurrency: at most one conflicting request is committed.
- Consistency: uses the same rules as Create and Availability.
- Uncertainty: none in v0.1.

## REQ-08 — Cancel

- Meaning: cancellation changes state; it does not physically delete history.
- Need: releases future reserved compute time while preserving the record.
- Observable result: `CANCELLED`.
- Verification: before start succeeds; at/after start fails.
- State/time: depends on `currentTime < startTime`.
- Concurrency: final state must remain consistent if cancellation races with another operation.
- Consistency: `CANCELLED` does not block availability.
- Uncertainty: none.

---

# Specification Baseline v0.1 — team approval

Status: [ ] Approved by team

Approved by:
- ...
- ...
- ...

Date:
...

---

# C02 change impact — Approval process

## Changed condition

Some AI Agents require approval by an authorized Admin before the Reservation
can become `CONFIRMED`.

Agent has a property:

`requiresApproval`

## Impact analysis before implementation

### Create

The system still validates the request immediately.

If `requiresApproval = false`:
- successful Create stores the Reservation directly as `CONFIRMED`.

If `requiresApproval = true`:
- successful Create stores the Reservation as `PENDING_APPROVAL`.

There is still no separate intermediate draft state.

### Availability

`PENDING_APPROVAL` does not block the Agent.

Only `CONFIRMED` Reservations block availability.

### Confirm

For Agents not requiring approval, confirmation remains an atomic part of Create.

For Agents requiring approval, final confirmation occurs when the authorized
Admin approves the `PENDING_APPROVAL` Reservation.

### Approve

A new operation and actor responsibility appears:
Admin acts as the authorized Approver.

### Cancel

A `PENDING_APPROVAL` Reservation may also be cancelled before its start time.

### State model

New states are introduced:

- `PENDING_APPROVAL`
- `REJECTED`
- `EXPIRED`

## Expiration

A `PENDING_APPROVAL` Reservation has `approvalExpiresAt`.

When the approval deadline is reached, it may no longer be approved
and transitions to `EXPIRED`.

The exact duration / configuration of the approval deadline is **TBD**
until the team explicitly decides it.

---

# OP-03 — Confirm Reservation — baseline v0.2

## Agent does not require approval

`[none] → CONFIRMED`

Confirmation is still performed as part of successful Create.

## Agent requires approval

Create produces:

`[none] → PENDING_APPROVAL`

Final confirmation occurs only after successful approval:

`PENDING_APPROVAL → CONFIRMED`

---

# OP-05 — Approve / Reject Reservation

## Goal / user value

An authorized Admin decides a Reservation waiting for approval.

## Trigger

Admin requests approval or rejection of a `PENDING_APPROVAL` Reservation.

## Observable requirements

**REQ-09:**  
A `PENDING_APPROVAL` Reservation may become `CONFIRMED` only if:

- the approval has not expired;
- Agent is active;
- interval does not overlap a `CONFIRMED` Reservation of the same Agent.

**REQ-10:**  
Two concurrent approvals / creates that conflict under BR-02 must not both
end as `CONFIRMED`.

## Preconditions

- Reservation exists.
- `Reservation.state = PENDING_APPROVAL`.
- actor is an authorized Admin / Approver.

## Successful approval

`PENDING_APPROVAL → CONFIRMED`

## Rejection

`PENDING_APPROVAL → REJECTED`

## Expiration

`PENDING_APPROVAL → EXPIRED`

when:

`currentTime >= approvalExpiresAt`

## Verification examples

- pending + active Agent + no overlap + before expiry → `CONFIRMED`;
- pending + overlap created while waiting → approval rejected;
- Admin rejects → `REJECTED`;
- deadline passed → `EXPIRED`;
- two conflicting approval/creation attempts → at most one `CONFIRMED`.

---

# BR-04 — baseline v0.2

Active Reservations are:

- `PENDING_APPROVAL`
- `CONFIRMED`

`CANCELLED`, `REJECTED` and `EXPIRED` do not count toward the limit.

---

# Architectural drivers for C03

## 1. Concurrent reservation decisions

Concurrent Create and Approve operations must not produce overlapping
`CONFIRMED` Reservations for the same Agent.

## 2. Persistent approval process

`PENDING_APPROVAL` must survive application restart because approval may happen later.

## 3. Time-dependent expiration

The system needs a consistent interpretation of `approvalExpiresAt`.

## 4. External Notification Service boundary

Notification delivery must not be required for persistence consistency.
A Notification Service outage must not create or corrupt Reservation state.
