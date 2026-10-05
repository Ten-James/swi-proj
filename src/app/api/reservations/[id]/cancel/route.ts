import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getCurrentUser } from "@/lib/auth";
import { cancelReservation } from "@/lib/reservation-service";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const result = await cancelReservation(id, actor);
    if (result.expired) {
      return NextResponse.json(
        {
          error: "Pending Reservation expired at startTime and cannot be cancelled",
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
