import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { ReservationRuleViolation, type ReservationRuleCode } from "@/lib/reservation-policy";

const ruleViolationStatus: Record<ReservationRuleCode, number> = {
  NOT_OWNER: 403,
  QUOTA_EXCEEDED: 403,
  INVALID_STATE: 409,
  AFTER_START: 409,
  START_IN_PAST: 400,
  AGENT_INACTIVE: 409,
  AGENT_UNAVAILABLE: 409,
};

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ReservationRuleViolation) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: ruleViolationStatus[error.code] },
    );
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
