# Team approval

## Specification Baseline v0.1

Status: [x] Approved by team

Accepted key decision:
- no persisted intermediate reservation state;
- Create validates immediately and successful reservation is stored directly as `CONFIRMED`;
- confirmation is an atomic business step inside Create.

Approved by:
- IND0040

Date: 2026-09-21

Notes: date of baseline commit `cf37879`.

---

## Specification Baseline v0.2

Status: [x] Approved by team

Accepted key decision:
- Agent without approval requirement: successful Create → `CONFIRMED`;
- Agent requiring approval: successful Create → `PENDING_APPROVAL`;
- Approve → `CONFIRMED`;
- Reject → `REJECTED`;
- expiry → `EXPIRED`.

Approved by:
- IND0040
- KOL0603

Date: 2026-10-05

Notes: date of baseline commit `b107a9d`.

---

## Specification Baseline v0.2.1 (code review 2026-10-19)

Status: [x] Approved by team

Accepted key decision:
- `BR-06`: Create requires `currentTime < startTime`;
- `BR-01`: instants must carry an explicit offset or `Z`;
- Reservation note is limited to 500 characters;
- registration never claims an existing account.

Approved by:
- IND0040

Date: 2026-10-19

Notes: date of baseline commit `6fd380f`.
