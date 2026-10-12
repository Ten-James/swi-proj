import { ApiError } from "./api-error";

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

/** BR-01 / BR-02: half-open intervals [start, end) overlap. */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

/** REQ-09: Agent configuration decides the first state of a new Reservation. */
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

/** BR-04: active Reservations must stay below the User limit before a new one. */
export function assertWithinQuota(activeCount: number, maxReservations: number): void {
  if (activeCount >= maxReservations) {
    throw new ApiError(
      403,
      `User already has ${activeCount} active reservation(s), the maximum is ${maxReservations}`,
    );
  }
}

/** BR-03 + REQ-12: decides what a cancel request does to a Reservation. */
export function planCancel(
  reservation: CancellableReservation,
  actor: PolicyActor,
  now: Date,
): CancelPlan {
  if (actor.id !== reservation.userId && actor.role !== "ADMIN") {
    throw new ApiError(403, "Actor is not authorized to cancel this Reservation");
  }
  if (reservation.status === "CANCELLED") return "ALREADY_CANCELLED";
  if (isPendingExpired(reservation, now)) return "EXPIRE";
  if (reservation.status !== "CONFIRMED" && reservation.status !== "PENDING_APPROVAL") {
    throw new ApiError(409, `Reservation in state ${reservation.status} cannot be cancelled`);
  }
  if (now >= reservation.startTime) {
    throw new ApiError(409, "Reservation cannot be cancelled at or after startTime");
  }
  return "CANCEL";
}

/**
 * REQ-10 / REQ-11 / REQ-12: first phase of Approve/Reject. Needs no database
 * state besides the Reservation itself. `CONFIRM_CHECKS` means the caller must
 * still verify Agent activity and overlap with {@link assertCanConfirm}.
 */
export function planDecision(
  reservation: { status: ReservationStatus; startTime: Date },
  decision: "APPROVE" | "REJECT",
  now: Date,
): DecisionPlan {
  if (reservation.status !== "PENDING_APPROVAL") {
    throw new ApiError(409, `Reservation is ${reservation.status}, not PENDING_APPROVAL`);
  }
  if (now >= reservation.startTime) return "EXPIRE";
  return decision === "REJECT" ? "REJECT" : "CONFIRM_CHECKS";
}

/** BR-02 / BR-05: second phase of Approve, evaluated against current state. */
export function assertCanConfirm(agentIsActive: boolean, hasConfirmedOverlap: boolean): void {
  if (!agentIsActive) throw new ApiError(409, "Agent is inactive; approval rejected");
  if (hasConfirmedOverlap) {
    throw new ApiError(409, "Agent is no longer available; approval rejected");
  }
}
