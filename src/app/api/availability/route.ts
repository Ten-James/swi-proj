import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { checkAgentAvailability } from "@/lib/reservation-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");

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
    const availability = await checkAgentAvailability(agentId, start, end);
    return NextResponse.json({ agentId, availability });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
