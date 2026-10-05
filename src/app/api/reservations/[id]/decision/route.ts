import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getCurrentUser } from "@/lib/auth";

interface DecisionBody {
  decision?: "APPROVE" | "REJECT";
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
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: { agent: true },
      });
      if (!reservation) {
        throw new ApiError(404, "Reservation not found");
      }
      if (reservation.status !== "PENDING_APPROVAL") {
        throw new ApiError(409, `Reservation is ${reservation.status}, not PENDING_APPROVAL`);
      }

      if (now >= reservation.startTime) {
        const expired = await tx.reservation.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
        return { reservation: expired, expired: true };
      }

      if (decision === "REJECT") {
        const rejected = await tx.reservation.update({
          where: { id },
          data: { status: "REJECTED" },
        });
        return { reservation: rejected, expired: false };
      }

      if (!reservation.agent.isActive) {
        throw new ApiError(409, "Agent is inactive; approval rejected");
      }

      const overlap = await tx.reservation.findFirst({
        where: {
          id: { not: id },
          agentId: reservation.agentId,
          status: "CONFIRMED",
          startTime: { lt: reservation.endTime },
          endTime: { gt: reservation.startTime },
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ApiError(409, "Agent is no longer available; approval rejected");
      }

      const confirmed = await tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
      });
      return { reservation: confirmed, expired: false };
    });

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

    return NextResponse.json({
      id: result.reservation.id,
      status: result.reservation.status,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
