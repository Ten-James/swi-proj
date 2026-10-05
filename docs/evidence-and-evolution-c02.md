# Evidence C02: specification → running application

## Accepted baseline

Baseline v0.1: implemented and verified; formal team approval remains open.

Baseline v0.2: implemented and verified; formal team approval remains open.

## Demonstrated core operations

- OP-01 Create creates either `CONFIRMED` or `PENDING_APPROVAL` according to
  `Agent.requiresApproval`.
- OP-02 Check Availability reports `AVAILABLE` / `UNAVAILABLE` using half-open
  interval semantics and only `CONFIRMED` Reservations as blockers.
- OP-03 Confirm is the atomic commit step inside Create for Agents without approval;
  for approval-required Agents it is completed by OP-05.
- OP-04 Cancel authorizes the owner or an Admin, observes the `startTime` boundary,
  and is idempotent for an already cancelled Reservation.
- OP-05 Approve / Reject authorizes an Admin and persists `CONFIRMED`, `REJECTED`,
  or `EXPIRED` according to the accepted rules.
- UC1 presents the global Reservation overview grouped by Agent without exposing
  Reservation owner identity.
- Registration and login create server-side Sessions; Create, Cancel and OP-05 derive
  the actor from the Session instead of trusting a submitted email address.
- Approval and the full administrative Reservation list are exposed on the separate,
  Admin-only `/admin` page.

## Actually executed verification examples

Executed on 2026-10-03 against the running application with:

`npm run test:c02`

Observed result: `C02 verification PASSED` with all automated cases passing:

- registration created a User and authenticated Session;
- login with an invalid password was rejected;
- logout invalidated the active Session;
- anonymous Create and normal-User access to the Admin API were rejected;
- an authenticated Admin could access the Admin API;
- successful immediate Create persisted `CONFIRMED`;
- zero-length interval and inactive Agent were rejected;
- active Reservation limit was enforced for both `CONFIRMED` and
  `PENDING_APPROVAL` Reservations;
- adjacent half-open intervals were available and overlapping intervals unavailable;
- two concurrent conflicting Create requests produced one success and one conflict;
- a future `CONFIRMED` Reservation was cancelled, unauthorized cancellation was
  rejected, and repeated cancellation remained idempotent;
- cancellation at or after `startTime` was rejected;
- approval-required Create persisted `PENDING_APPROVAL` without blocking availability;
- future pending cancellation produced `CANCELLED`, while cancellation at the time
  boundary persisted `EXPIRED`;
- valid approval produced `CONFIRMED` and the interval then became unavailable;
- unauthorized approval was rejected without changing the pending state;
- Admin rejection persisted `REJECTED`;
- overlap and inactive-Agent conditions appearing before approval were rechecked and
  left the Reservation pending;
- an approval attempt at or after `startTime` persisted `EXPIRED`;
- two conflicting concurrent approvals produced one confirmation and one conflict;
- the global overview returned Reservations without User identity or free-text notes.

Supporting quality checks also passed:

- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run build`.

## Mismatch found and resolution

Known modeling decision already resolved:
the accepted specification uses immediate validation and direct creation as `CONFIRMED`;
confirmation is not a separate User action in baseline v0.1.

Remaining mismatches after verification: none found.

## Change impact summary

Approval-required Agents introduce `PENDING_APPROVAL` and Admin / Approver behavior.

`PENDING_APPROVAL` does not block the Resource.
Availability is rechecked when approval occurs.

## Remaining assumption / unknown

No unresolved behavior remains in the accepted v0.2 model.
Approval expires when `currentTime >= Reservation.startTime`.

## Architectural drivers transferred to C03

- concurrent Create / Approve consistency;
- persistent asynchronous approval;
- time-dependent expiration at `Reservation.startTime`.

## Application commit / tag

TBD — record after the implementation is committed by the team.
