export type ReservationStatus =
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export interface TimeInterval {
  startTime: Date;
  endTime: Date;
}

export interface PolicyActor {
  id: string;
  role: "USER" | "ADMIN";
}

export interface CancellableReservation {
  userId: string;
  status: ReservationStatus;
  startTime: Date;
}

export type CancelPlan = "CANCEL" | "ALREADY_CANCELLED" | "EXPIRE";
export type DecisionPlan = "EXPIRE" | "REJECT" | "CONFIRM_CHECKS";

/** Domain reasons for a refused lifecycle step; adapters map them to transport codes. */
export type ReservationRuleCode =
  | "NOT_OWNER"
  | "QUOTA_EXCEEDED"
  | "INVALID_STATE"
  | "AFTER_START"
  | "START_IN_PAST"
  | "AGENT_INACTIVE"
  | "AGENT_UNAVAILABLE";

export class ReservationRuleViolation extends Error {
  code: ReservationRuleCode;

  constructor(code: ReservationRuleCode, message: string) {
    super(message);
    this.name = "ReservationRuleViolation";
    this.code = code;
  }
}

/**
 * BR-01: bounds an existing interval must satisfy to overlap `interval`
 * under half-open [start, end) semantics. Single source for the in-memory
 * check below and for the persistence query in reservation-service.
 */
export function overlapBounds(interval: TimeInterval): { startsBefore: Date; endsAfter: Date } {
  return { startsBefore: interval.endTime, endsAfter: interval.startTime };
}

/** BR-01 / BR-02: half-open intervals [start, end) overlap. */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  const bounds = overlapBounds(b);
  return a.startTime < bounds.startsBefore && a.endTime > bounds.endsAfter;
}

/** v0.2 change (OP-01): Agent configuration decides the first state of a new Reservation. */
export function initialStatus(agent: { requiresApproval: boolean }): ReservationStatus {
  return agent.requiresApproval ? "PENDING_APPROVAL" : "CONFIRMED";
}

/** REQ-12: a pending Reservation expires once currentTime >= startTime. */
export function isPendingExpired(
  reservation: { status: ReservationStatus; startTime: Date },
  now: Date,
): boolean {
  return reservation.status === "PENDING_APPROVAL" && now >= reservation.startTime;
}

/** BR-06: a new Reservation must start strictly after currentTime. */
export function assertStartsInFuture(interval: { startTime: Date }, now: Date): void {
  if (interval.startTime <= now) {
    throw new ReservationRuleViolation(
      "START_IN_PAST",
      "Reservation must start after the current time",
    );
  }
}

/** BR-04: active Reservations must stay below the User limit before a new one. */
export function assertWithinQuota(activeCount: number, maxReservations: number): void {
  if (activeCount >= maxReservations) {
    throw new ReservationRuleViolation(
      "QUOTA_EXCEEDED",
      `User already has ${activeCount} active reservation(s), the maximum is ${maxReservations}`,
    );
  }
}

/** REQ-08 + BR-03 + REQ-12: decides what a cancel request does to a Reservation. */
export function planCancel(
  reservation: CancellableReservation,
  actor: PolicyActor,
  now: Date,
): CancelPlan {
  if (actor.id !== reservation.userId && actor.role !== "ADMIN") {
    throw new ReservationRuleViolation("NOT_OWNER", "Actor is not authorized to cancel this Reservation");
  }
  if (reservation.status === "CANCELLED") return "ALREADY_CANCELLED";
  if (isPendingExpired(reservation, now)) return "EXPIRE";
  if (reservation.status !== "CONFIRMED" && reservation.status !== "PENDING_APPROVAL") {
    throw new ReservationRuleViolation(
      "INVALID_STATE",
      `Reservation in state ${reservation.status} cannot be cancelled`,
    );
  }
  if (now >= reservation.startTime) {
    throw new ReservationRuleViolation("AFTER_START", "Reservation cannot be cancelled at or after startTime");
  }
  return "CANCEL";
}

/**
 * REQ-09 / REQ-11 / REQ-12: first phase of Approve/Reject. Needs no database
 * state besides the Reservation itself. `CONFIRM_CHECKS` means the caller must
 * still verify Agent activity and overlap with {@link assertCanConfirm}.
 */
export function planDecision(
  reservation: { status: ReservationStatus; startTime: Date },
  decision: "APPROVE" | "REJECT",
  now: Date,
): DecisionPlan {
  if (reservation.status !== "PENDING_APPROVAL") {
    throw new ReservationRuleViolation(
      "INVALID_STATE",
      `Reservation is ${reservation.status}, not PENDING_APPROVAL`,
    );
  }
  if (now >= reservation.startTime) return "EXPIRE";
  return decision === "REJECT" ? "REJECT" : "CONFIRM_CHECKS";
}

/** BR-02: an overlapping CONFIRMED Reservation blocks both Create and Approve. */
export function assertNoConfirmedOverlap(
  hasConfirmedOverlap: boolean,
  message = "Agent is not free in the requested time window",
): void {
  if (hasConfirmedOverlap) {
    throw new ReservationRuleViolation("AGENT_UNAVAILABLE", message);
  }
}

/** REQ-09 + BR-02 / BR-05: second phase of Approve, evaluated against current state. */
export function assertCanConfirm(agentIsActive: boolean, hasConfirmedOverlap: boolean): void {
  if (!agentIsActive) {
    throw new ReservationRuleViolation("AGENT_INACTIVE", "Agent is inactive; approval rejected");
  }
  assertNoConfirmedOverlap(hasConfirmedOverlap, "Agent is no longer available; approval rejected");
}
