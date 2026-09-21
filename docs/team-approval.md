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
