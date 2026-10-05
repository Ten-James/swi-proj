import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getCurrentUser } from "@/lib/auth";
import { createReservation, listPublicReservations } from "@/lib/reservation-service";

interface CreateReservationBody {
  agentId?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export async function GET() {
  return NextResponse.json(await listPublicReservations());
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: CreateReservationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, startTime, endTime, note } = body;
  if (!agentId || !startTime || !endTime) {
    return NextResponse.json(
      { error: "agentId, startTime and endTime are required" },
      { status: 400 },
    );
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  try {
    const reservation = await createReservation({
      userId: currentUser.id,
      agentId,
      startTime: start,
      endTime: end,
      note,
    });
    return NextResponse.json(
      { id: reservation.id, agentId: reservation.agentId, status: reservation.status },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
