import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { logTechnicalFailure } from "@/lib/ops-log";
import { ReservationRuleViolation, type ReservationRuleCode } from "@/lib/reservation-policy";

const ruleViolationStatus: Record<ReservationRuleCode, number> = {
  NOT_OWNER: 403,
  QUOTA_EXCEEDED: 403,
  INVALID_STATE: 409,
  AFTER_START: 409,
  START_IN_PAST: 400,
  NOT_SLOT_ALIGNED: 400,
  DURATION_EXCEEDED: 400,
  AGENT_INACTIVE: 409,
  AGENT_UNAVAILABLE: 409,
};

/**
 * Maps an error to the HTTP response. Domain rejections and client errors are answered
 * without logging; anything else is a technical failure and leaves one diagnostic event.
 * `operation` names the route, e.g. "POST /api/reservations".
 */
export function apiErrorResponse(error: unknown, operation: string) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ReservationRuleViolation) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: ruleViolationStatus[error.code] },
    );
  }
  logTechnicalFailure(operation, error, "HTTP 500 Internal server error");
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
