import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (!agent.isActive) {
    return NextResponse.json({ agentId, availability: "UNAVAILABLE" });
  }

  const overlap = await prisma.reservation.findFirst({
    where: {
      agentId,
      status: "CONFIRMED",
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { id: true },
  });

  return NextResponse.json({
    agentId,
    availability: overlap ? "UNAVAILABLE" : "AVAILABLE",
  });
}
