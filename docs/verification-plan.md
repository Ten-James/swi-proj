# UC1 — Vyhledávání / Gantt přehled

## Positive

V systému existují Reservation několika různých Userů a Agentů.

Expected:
- User vidí všechny Reservation;
- Reservation jsou seskupeny podle AI Agenta;
- intervaly jsou zobrazeny na časové ose jako Ganttův diagram.

## Boundary

Systém nemá žádné Reservation.

Expected:
- zobrazí se prázdný Ganttův přehled bez chyby.

## Cross-user visibility

Existují dvě Reservation:
- Reservation A patří Userovi A;
- Reservation B patří Userovi B.

Expected:
- User A při otevření přehledu vidí A i B.

---

# Verification plan

These examples must be actually executed before C03 and then recorded in evidence.

# OP-01 — Create Reservation

## Positive

- active Agent;
- valid free interval;
- User below limit.

Expected:
- HTTP / interface success;
- exactly one Reservation is persisted;
- state is `CONFIRMED`;
- returned Reservation ID equals persisted Reservation ID.

## Negative / boundary

- `startTime == endTime` → reject, no Reservation created.

Additional:
- overlap with existing `CONFIRMED` → reject;
- inactive Agent → reject;
- User already at limit → reject.

---

# OP-02 — Check Availability

Existing `CONFIRMED`: `[10:00,11:00)`.

## Positive

`[11:00,12:00)` → `AVAILABLE`

## Negative

`[10:30,11:30)` → `UNAVAILABLE`

## Boundary

`[09:00,10:00)` → `AVAILABLE`

---

# OP-03 — Confirm Reservation

In v0.1 confirmation is executed inside Create.

## Positive

valid Create → Reservation is persisted as `CONFIRMED`.

## Negative

overlapping Create → rejected; no conflicting Reservation is created.

## Concurrency

two simultaneous conflicting requests → at most one `CONFIRMED`.

---

# OP-04 — Cancel Reservation

## Positive

future `CONFIRMED` → `CANCELLED`

## Negative / boundary

`currentTime == startTime` → rejected

Additional:
already `CANCELLED` → idempotent success.

---

# UC4 — Edit Reservation

## Positive

future `CONFIRMED`, new interval is free → same Reservation updated and remains `CONFIRMED`.

## Negative

new interval overlaps another `CONFIRMED` Reservation → rejected, old values unchanged.

---

# Baseline v0.2 — changed behavior

## OP-01 — Create requiring approval

### Positive

Valid request + `Agent.requiresApproval = true` → one `PENDING_APPROVAL`
Reservation is persisted; it is not yet a committed allocation.

### Negative

Invalid interval, inactive Agent, current overlap or User at limit → rejected;
no Reservation is created.

## OP-02 — Availability while approval is pending

Existing `PENDING_APPROVAL` for `[10:00,11:00)` and no `CONFIRMED` overlap:

- query `[10:30,10:45)` → `AVAILABLE`;
- after that Reservation is approved → the same query returns `UNAVAILABLE`.

## OP-04 — Cancel pending approval

- `PENDING_APPROVAL` before `startTime` → `CANCELLED`;
- `PENDING_APPROVAL` at `startTime` → cancellation rejected and Reservation is
  treated as `EXPIRED`.

## OP-05 — Approve / Reject Reservation

### Positive approval

`PENDING_APPROVAL` + authorized Admin + `currentTime < startTime` + active Agent
and no overlap → `CONFIRMED`.

### Rejection

Authorized Admin rejects before `startTime` → `REJECTED`.

### Negative

- conflict appeared while waiting → approval rejected, remains `PENDING_APPROVAL`;
- inactive Agent → approval rejected, remains `PENDING_APPROVAL`;
- unauthorized User → rejected, state unchanged.

### Time boundary

Approval attempted with `currentTime == startTime` → `EXPIRED`; approval rejected.

### Concurrency

Two conflicting Create / Approve operations execute concurrently → at most one
Reservation reaches `CONFIRMED`.
