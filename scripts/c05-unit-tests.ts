import assert from "node:assert/strict";
import { beginLoginAttempt, clearLoginFailures } from "../src/lib/login-throttle";
import { parseInstant, parseInterval } from "../src/lib/request-body";
import {
  assertCanConfirm,
  assertNoConfirmedOverlap,
  assertStartsInFuture,
  assertWithinQuota,
  initialStatus,
  intervalsOverlap,
  overlapBounds,
  planCancel,
  planDecision,
  ReservationRuleViolation,
  type ReservationRuleCode,
} from "../src/lib/reservation-policy";

const at = (hour: number) => new Date(Date.UTC(2026, 9, 20, hour));
const owner = { id: "u1", role: "USER" as const };
const stranger = { id: "u2", role: "USER" as const };
const admin = { id: "a1", role: "ADMIN" as const };

function expectViolation(work: () => unknown, code: ReservationRuleCode, pattern: RegExp) {
  assert.throws(work, (error) => {
    assert.ok(error instanceof ReservationRuleViolation, "expected ReservationRuleViolation");
    assert.equal(error.code, code);
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
  ["overlap: query bounds are strict (startTime < end, endTime > start)", () => {
    // reservation-service builds the CONFIRMED-overlap query from these bounds with lt/gt.
    assert.deepEqual(overlapBounds({ startTime: at(10), endTime: at(11) }), { startsBefore: at(11), endsAfter: at(10) });
  }],

  // DD-T2 — v0.2 OP-01 change: initial state
  ["initialStatus: approval agent starts PENDING_APPROVAL, others CONFIRMED", () => {
    assert.equal(initialStatus({ requiresApproval: true }), "PENDING_APPROVAL");
    assert.equal(initialStatus({ requiresApproval: false }), "CONFIRMED");
  }],

  // DD-T3 — BR-04: quota
  ["quota: below limit passes, at limit fails (QUOTA_EXCEEDED)", () => {
    assert.doesNotThrow(() => assertWithinQuota(1, 2));
    expectViolation(() => assertWithinQuota(2, 2), "QUOTA_EXCEEDED", /maximum is 2/);
  }],

  // DD-T4 — REQ-08 / BR-03 / REQ-12: cancel transitions
  ["cancel: owner cancels CONFIRMED before startTime", () => {
    assert.equal(planCancel({ userId: "u1", status: "CONFIRMED", startTime: at(10) }, owner, at(9)), "CANCEL");
  }],
  ["cancel: cancellation exactly at startTime is rejected (AFTER_START)", () => {
    expectViolation(
      () => planCancel({ userId: "u1", status: "CONFIRMED", startTime: at(10) }, owner, at(10)),
      "AFTER_START",
      /at or after startTime/,
    );
  }],
  ["cancel: repeated cancel is idempotent", () => {
    assert.equal(planCancel({ userId: "u1", status: "CANCELLED", startTime: at(10) }, owner, at(11)), "ALREADY_CANCELLED");
  }],
  ["cancel: stranger is refused (NOT_OWNER), admin may cancel", () => {
    const reservation = { userId: "u1", status: "CONFIRMED" as const, startTime: at(10) };
    expectViolation(() => planCancel(reservation, stranger, at(9)), "NOT_OWNER", /not authorized/);
    assert.equal(planCancel(reservation, admin, at(9)), "CANCEL");
  }],
  ["cancel: stale PENDING_APPROVAL at startTime expires instead of failing", () => {
    assert.equal(planCancel({ userId: "u1", status: "PENDING_APPROVAL", startTime: at(10) }, owner, at(10)), "EXPIRE");
  }],
  ["cancel: terminal states REJECTED/EXPIRED cannot be cancelled (INVALID_STATE)", () => {
    for (const status of ["REJECTED", "EXPIRED"] as const) {
      expectViolation(() => planCancel({ userId: "u1", status, startTime: at(10) }, owner, at(9)), "INVALID_STATE", /cannot be cancelled/);
    }
  }],

  // DD-T5 — REQ-09 / REQ-11 / REQ-12: decision planning
  ["decision: only PENDING_APPROVAL can be decided (INVALID_STATE)", () => {
    expectViolation(() => planDecision({ status: "CONFIRMED", startTime: at(10) }, "APPROVE", at(9)), "INVALID_STATE", /not PENDING_APPROVAL/);
  }],
  ["decision: at startTime pending expires regardless of decision", () => {
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "APPROVE", at(10)), "EXPIRE");
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "REJECT", at(10)), "EXPIRE");
  }],
  ["decision: before startTime REJECT is final, APPROVE needs confirm checks", () => {
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "REJECT", at(9)), "REJECT");
    assert.equal(planDecision({ status: "PENDING_APPROVAL", startTime: at(10) }, "APPROVE", at(9)), "CONFIRM_CHECKS");
  }],

  // DD-T6 — REQ-09 / BR-02 / BR-05: confirm preconditions
  ["confirm: inactive agent and later overlap are refused; activity is checked first", () => {
    assert.doesNotThrow(() => assertCanConfirm(true, false));
    expectViolation(() => assertCanConfirm(false, false), "AGENT_INACTIVE", /inactive/);
    expectViolation(() => assertCanConfirm(true, true), "AGENT_UNAVAILABLE", /no longer available/);
    expectViolation(() => assertCanConfirm(false, true), "AGENT_INACTIVE", /inactive/);
  }],

  // DD-T7 — BR-02: Create and Approve share one overlap rule
  ["overlap rule: Create reports AGENT_UNAVAILABLE with its own message", () => {
    assert.doesNotThrow(() => assertNoConfirmedOverlap(false));
    expectViolation(() => assertNoConfirmedOverlap(true), "AGENT_UNAVAILABLE", /not free/);
  }],

  // DD-T8 — BR-06: a new Reservation starts strictly in the future
  ["future start: startTime at or before now is refused (START_IN_PAST)", () => {
    assert.doesNotThrow(() => assertStartsInFuture({ startTime: at(10) }, at(9)));
    expectViolation(() => assertStartsInFuture({ startTime: at(10) }, at(10)), "START_IN_PAST", /after the current time/);
    expectViolation(() => assertStartsInFuture({ startTime: at(9) }, at(10)), "START_IN_PAST", /after the current time/);
  }],

  // Adapter — BR-01 input format: explicit offset required, start < end
  ["interval input: offsets required, start < end", () => {
    assert.equal(parseInstant("2030-01-01T10:00:00Z")?.toISOString(), "2030-01-01T10:00:00.000Z");
    assert.equal(parseInstant("2030-01-01T11:00:00+01:00")?.toISOString(), "2030-01-01T10:00:00.000Z");
    assert.equal(parseInstant("2030-01-01T10:00:00"), null);
    assert.equal(parseInstant("2030-01-01"), null);
    assert.equal(parseInstant("not a date"), null);
    assert.equal(parseInstant("2030-02-31T10:00:00Z"), null);
    assert.equal(parseInstant("2030-01-01T24:00Z"), null);
    assert.ok(parseInstant("2028-02-29T10:00Z"));
    assert.equal(parseInterval("2030-01-01T10:00Z", "2030-01-01T10:00Z"), null);
    assert.ok(parseInterval("2030-01-01T10:00Z", "2030-01-01T11:00Z"));
  }],

  // Adapter — login throttle: five failures lock the email until the window ends
  ["login throttle: 5 attempts pass, 6th is locked; success or window end unlocks", () => {
    const email = "throttle@test.local";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) assert.equal(beginLoginAttempt(email, t0), 0);
    assert.equal(beginLoginAttempt(email, t0), 15 * 60);
    assert.equal(beginLoginAttempt(email, t0 + 15 * 60 * 1000), 0);
    clearLoginFailures(email);
    for (let i = 0; i < 5; i += 1) beginLoginAttempt(email, t0);
    clearLoginFailures(email);
    assert.equal(beginLoginAttempt(email, t0), 0);
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
