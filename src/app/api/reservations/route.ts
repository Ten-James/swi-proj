import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

interface CreateReservationBody {
  name?: string;
  email?: string;
  agentId?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export async function POST(request: Request) {
  let body: CreateReservationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, email, agentId, startTime, endTime, note } = body;

  if (!name || !email || !agentId || !startTime || !endTime) {
    return NextResponse.json(
      { error: "name, email, agentId, startTime and endTime are required" },
      { status: 400 },
    );
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      // 1) agent exists and is free (active + no overlapping confirmed reservation)
      const agent = await tx.agent.findUnique({ where: { id: agentId } });
      if (!agent || !agent.isActive) {
        throw new ApiError(404, "Agent not found or inactive");
      }

      const overlapping = await tx.reservation.findFirst({
        where: {
          agentId,
          status: "CONFIRMED",
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });
      if (overlapping) {
        throw new ApiError(409, "Agent is not free in the requested time window");
      }

      // 2) user is entitled to reserve (under their active reservation limit)
      const user = await tx.user.upsert({
        where: { email },
        update: { name },
        create: { name, email },
      });

      const activeReservationCount = await tx.reservation.count({
        where: {
          userId: user.id,
          status: { in: ["DRAFT", "CONFIRMED"] },
        },
      });
      if (activeReservationCount >= user.maxReservations) {
        throw new ApiError(
          403,
          `User already has ${activeReservationCount} active reservation(s), the maximum is ${user.maxReservations}`,
        );
      }

      // 3) reserve the agent
      return tx.reservation.create({
        data: {
          userId: user.id,
          agentId,
          startTime: start,
          endTime: end,
          note,
          status: "CONFIRMED",
        },
      });
    });

    // 4) return the id of the reserved agent's reservation
    return NextResponse.json(
      { id: reservation.id, agentId: reservation.agentId, status: reservation.status },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
