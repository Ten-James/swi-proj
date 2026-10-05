import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getCurrentUser } from "@/lib/auth";
import { decideReservation, type ReservationDecision } from "@/lib/reservation-service";

interface DecisionBody {
  decision?: ReservationDecision;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (admin.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only an authorized Admin may decide a Reservation" },
      { status: 403 },
    );
  }

  let body: DecisionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const decision = body.decision?.toUpperCase();
  if (decision !== "APPROVE" && decision !== "REJECT") {
    return NextResponse.json(
      { error: "decision APPROVE or REJECT is required" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    const result = await decideReservation(id, decision);
    if (result.expired) {
      return NextResponse.json(
        {
          error: "Reservation expired at startTime and cannot be approved or rejected",
          id: result.reservation.id,
          status: result.reservation.status,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ id: result.reservation.id, status: result.reservation.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
