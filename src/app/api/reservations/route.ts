import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getCurrentUser } from "@/lib/auth";
import { optionalString, readJsonObject } from "@/lib/request-body";
import { createReservation, listPublicReservations } from "@/lib/reservation-service";

export async function GET() {
  return NextResponse.json(await listPublicReservations());
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = optionalString(body, "agentId");
  const startTime = optionalString(body, "startTime");
  const endTime = optionalString(body, "endTime");
  const note = optionalString(body, "note");
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
