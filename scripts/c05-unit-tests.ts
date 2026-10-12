import assert from "node:assert/strict";
import { ApiError } from "../src/lib/api-error";
import {
  assertCanConfirm,
  assertWithinQuota,
  initialStatus,
  intervalsOverlap,
  planCancel,
  planDecision,
} from "../src/lib/reservation-policy";

const at = (hour: number) => new Date(Date.UTC(2026, 9, 20, hour));
const owner = { id: "u1", role: "USER" as const };
const stranger = { id: "u2", role: "USER" as const };
const admin = { id: "a1", role: "ADMIN" as const };

function expectApiError(work: () => unknown, status: number, pattern: RegExp) {
  assert.throws(work, (error) => {
    assert.ok(error instanceof ApiError, "expected ApiError");
    assert.equal(error.status, status);
    assert.match(error.message, pattern);
    return true;
  });
}

const cases: Array<[string, () => void]> = [
  // DD-T1 — BR-01: half-open intervals
  ["overlap: intersecting intervals overlap", () => {
    assert.equal(intervalsOverlap({ startTime: at(9), endTime: at(11) }, { startTime: at(10), endTime: at(12) }), true);
  }],
  ["overlap: touching boundary [9,10) and [10,11) does not overlap", () => {
    assert.equal(intervalsOverlap({ startTime: at(9), endTime: at(10) }, { startTime: at(10), endTime: at(11) }), false);
    assert.equal(intervalsOverlap({ startTime: at(10), endTime: at(11) }, { startTime: at(9), endTime: at(10) }), false);
  }],
  ["overlap: containment overlaps", () => {
    assert.equal(intervalsOverlap({ startTime: at(8), endTime: at(14) }, { startTime: at(10), endTime: at(11) }), true);
  }],

  // DD-T2 — REQ-09: initial state
  ["initialStatus: approval agent starts PENDING_APPROVAL, others CONFIRMED", () => {
    assert.equal(initialStatus({ requiresApproval: true }), "PENDING_APPROVAL");
    assert.equal(initialStatus({ requiresApproval: false }), "CONFIRMED");
  }],

  // DD-T3 — BR-04: quota
  ["quota: below limit passes, at limit fails with 403", () => {
    assert.doesNotThrow(() => assertWithinQuota(1, 2));
    expectApiError(() => assertWithinQuota(2, 2), 403, /maximum is 2/);
  }],

  // DD-T4 — BR-03 / REQ-12: cancel transitions
  ["cancel: owner cancels CONFIRMED before startTime", () => {
    assert.equal(planCancel({ userId: "u1", status: "CONFIRMED", startTime: at(10) }, owner, at(9)), "CANCEL");
  }],
  ["cancel: cancellation exactly at startTime is rejected (409)", () => {
    expectApiError(
      () => planCancel({ userId: "u1", status: "CONFIRMED", startTime: at(10) }, owner, at(10)),
      409,
      /at or after startTime/,
    );
  }],
  ["cancel: repeated cancel is idempotent", () => {
    assert.equal(planCancel({ userId: "u1", status: "CANCELLED", startTime: at(10) }, owner, at(11)), "ALREADY_CANCELLED");
  }],
  ["cancel: stranger gets 403, admin may cancel", () => {
    const reservation = { userId: "u1", status: "CONFIRMED" as const, startTime: at(10) };
    expectApiError(() => planCancel(reservation, stranger, at(9)), 403, /not authorized/);
    assert.equal(planCancel(reservation, admin, at(9)), "CANCEL");
  }],
  ["cancel: stale PENDING_APPROVAL at startTime expires instead of failing", () => {
    assert.equal(planCancel({ userId: "u1", status: "PENDING_APPROVAL", startTime: at(10) }, owner, at(10)), "EXPIRE");
  }],
  ["cancel: terminal states REJECTED/EXPIRED cannot be cancelled (409)", () => {
    for (const status of ["REJECTED", "EXPIRED"] as const) {
      expectApiError(() => planCancel({ userId: "u1", status, startTime: at(10) }, owner, at(9)), 409, /cannot be cancelled/);
    }
  }],

  // DD-T5 — REQ-10 / REQ-11 / REQ-12: decision planning
  ["decision: only PENDING_APPROVAL can be decided (409)", () => {
    expectApiError(() => planDecision({ status: "CONFIRMED", startTime: at(10) }, "APPROVE", at(9)), 409, /not PENDING_APPROVAL/);
  }],
  ["decision: at startTime pending expires regardless of decision", () => {
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "APPROVE", at(10)), "EXPIRE");
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "REJECT", at(10)), "EXPIRE");
  }],
  ["decision: before startTime REJECT is final, APPROVE needs confirm checks", () => {
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "REJECT", at(9)), "REJECT");
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "APPROVE", at(9)), "CONFIRM_CHECKS");
  }],

  // DD-T6 — BR-02 / BR-05: confirm preconditions
  ["confirm: inactive agent and later overlap both yield 409; clean state passes", () => {
    assert.doesNotThrow(() => assertCanConfirm(true, false));
    expectApiError(() => assertCanConfirm(false, false), 409, /inactive/);
    expectApiError(() => assertCanConfirm(true, true), 409, /no longer available/);
    expectApiError(() => assertCanConfirm(false, true), 409, /inactive/);
  }],
];

let failed = 0;
for (const [name, work] of cases) {
  try {
    work();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`C05 unit tests FAILED: ${failed}/${cases.length}`);
  process.exit(1);
}
console.log(`C05 unit tests PASSED: ${cases.length}/${cases.length}`);
