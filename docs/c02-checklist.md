# C02 completion checklist

## Specification
- [x] Baseline explicitly states immediate validation and direct `CONFIRMED` creation.
- [x] All four mandatory operations have a textual specification.
- [x] Shared domain rules are defined once.
- [x] Use-case model is based on the team's existing UC1–UC6 diagram.
- [x] State diagrams are prepared for v0.1 and v0.2.
- [x] Activity diagrams are prepared.
- [x] Change-impact analysis for approval process is prepared.
- [x] Changed and unaffected parts of baseline v0.2 are identified explicitly.
- [x] Approve / Reject operation is specified.
- [x] REQ-09 to REQ-12 passed the requirement acceptance review.
- [x] Approval expiration boundary and clock source are defined.
- [x] Architectural drivers for C03 are identified.
- [ ] Team explicitly approves baseline v0.1.
- [ ] Team explicitly approves baseline v0.2.

## Running application / evidence
- [x] Application demonstrates Create Reservation.
- [x] Application demonstrates Check Availability.
- [x] Application demonstrates Confirm behavior.
- [x] Application demonstrates Cancel Reservation.
- [x] Positive and negative/boundary example was executed for Create.
- [x] Positive and negative/boundary example was executed for Availability.
- [x] Positive and negative/boundary example was executed for Confirm behavior.
- [x] Positive and negative/boundary example was executed for Cancel.
- [x] Running application is updated for baseline v0.2.
- [x] Changed v0.2 examples are actually executed.
- [x] Evidence file contains real observed results.
- [x] Create and Cancel derive the User from an authenticated Session.
- [x] OP-05 and the administrative Reservation view require role `ADMIN`.
- [x] Registration, login and logout are implemented and verified.
- [x] Admin operations are separated onto `/admin`.
- [ ] Application commit/tag is recorded.
