import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getCurrentUser } from "@/lib/auth";
import { INVALID_RANGE, optionalString, parseInterval, readJsonObject } from "@/lib/request-body";
import { createReservation, listPublicReservations } from "@/lib/reservation-service";

const MAX_NOTE_LENGTH = 500;

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

  const interval = parseInterval(startTime, endTime);
  if (!interval) {
    return NextResponse.json({ error: INVALID_RANGE }, { status: 400 });
  }
  if (note !== undefined && note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `note must have at most ${MAX_NOTE_LENGTH} characters` },
      { status: 400 },
    );
  }

  try {
    const reservation = await createReservation({
      userId: currentUser.id,
      agentId,
      ...interval,
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
