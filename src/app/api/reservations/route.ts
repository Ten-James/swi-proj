import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getCurrentUser } from "@/lib/auth";

interface CreateReservationBody {
  agentId?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export async function GET() {
  const now = new Date();

  await prisma.reservation.updateMany({
    where: {
      status: "PENDING_APPROVAL",
      startTime: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

  const reservations = await prisma.reservation.findMany({
    orderBy: [{ agent: { name: "asc" } }, { startTime: "asc" }],
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      agent: {
        select: {
          id: true,
          name: true,
          requiresApproval: true,
        },
      },
    },
  });

  return NextResponse.json(reservations);
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
    const now = new Date();
    const reservation = await prisma.$transaction(async (tx) => {
      await tx.reservation.updateMany({
        where: {
          status: "PENDING_APPROVAL",
          startTime: { lte: now },
        },
        data: { status: "EXPIRED" },
      });

      // 1) Agent exists, is active and has no committed overlap.
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

      // 2) User remains under the active Reservation limit.
      const user = await tx.user.findUnique({ where: { id: currentUser.id } });
      if (!user) throw new ApiError(401, "Authenticated User no longer exists");

      const activeReservationCount = await tx.reservation.count({
        where: {
          userId: user.id,
          status: { in: ["PENDING_APPROVAL", "CONFIRMED"] },
          endTime: { gt: now },
        },
      });
      if (activeReservationCount >= user.maxReservations) {
        throw new ApiError(
          403,
          `User already has ${activeReservationCount} active reservation(s), the maximum is ${user.maxReservations}`,
        );
      }

      // 3) Commit immediately or persist the request for Admin approval.
      return tx.reservation.create({
        data: {
          userId: user.id,
          agentId,
          startTime: start,
          endTime: end,
          note,
          status: agent.requiresApproval ? "PENDING_APPROVAL" : "CONFIRMED",
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
