import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { INVALID_RANGE, parseInterval } from "@/lib/request-body";
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

  const interval = parseInterval(startTime, endTime);
  if (!interval) {
    return NextResponse.json({ error: INVALID_RANGE }, { status: 400 });
  }

  try {
    const availability = await checkAgentAvailability(agentId, interval.startTime, interval.endTime);
    return NextResponse.json({ agentId, availability });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
