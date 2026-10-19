# Team approval

## Specification Baseline v0.1

Status: [ ] Approved by team

Accepted key decision:
- no persisted intermediate reservation state;
- Create validates immediately and successful reservation is stored directly as `CONFIRMED`;
- confirmation is an atomic business step inside Create.

Approved by:
- 
- 
- 

Date:

Notes:

---

## Specification Baseline v0.2

Status: [ ] Approved by team

Accepted key decision:
- Agent without approval requirement: successful Create → `CONFIRMED`;
- Agent requiring approval: successful Create → `PENDING_APPROVAL`;
- Approve → `CONFIRMED`;
- Reject → `REJECTED`;
- expiry → `EXPIRED`.

Approved by:
- 
- 
- 

Date:

Notes:

---

## Specification Baseline v0.2.1 (code review 2026-10-19)

Status: [ ] Approved by team

Accepted key decision:
- `BR-06`: Create requires `currentTime < startTime`;
- `BR-01`: instants must carry an explicit offset or `Z`;
- Reservation note is limited to 500 characters;
- registration never claims an existing account.

Approved by:
- 
- 
- 

Date:

Notes:
