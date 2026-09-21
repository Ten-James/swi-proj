# Evidence C02: specification → running application

## Accepted baseline

Baseline v0.1: TBD after explicit team approval.

Baseline v0.2: TBD after explicit team approval.

## Demonstrated core operations

TBD after implementation / execution.

## Actually executed verification examples

TBD after execution.

## Mismatch found and resolution

Known modeling decision already resolved:
the accepted specification uses immediate validation and direct creation as `CONFIRMED`;
no persisted intermediate state is part of the system model.

Remaining mismatches: TBD after verification.

## Change impact summary

Approval-required Agents introduce `PENDING_APPROVAL` and Admin / Approver behavior.

`PENDING_APPROVAL` does not block the Resource.
Availability is rechecked when approval occurs.

## Remaining assumption / unknown

Exact approval-expiration configuration is TBD.

## Architectural drivers transferred to C03

- concurrent Create / Approve consistency;
- persistent asynchronous approval;
- time-dependent expiration;
- Notification Service failure must not corrupt reservation consistency.

## Application commit / tag

TBD.
