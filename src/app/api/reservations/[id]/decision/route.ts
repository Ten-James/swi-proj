import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

interface DecisionBody {
  adminEmail?: string;
  decision?: "APPROVE" | "REJECT";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: DecisionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const adminEmail = body.adminEmail?.trim().toLowerCase();
  const decision = body.decision?.toUpperCase();
  if (!adminEmail || (decision !== "APPROVE" && decision !== "REJECT")) {
    return NextResponse.json(
      { error: "adminEmail and decision APPROVE or REJECT are required" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const admin = await tx.user.findUnique({ where: { email: adminEmail } });
      if (!admin || admin.role !== "ADMIN") {
        throw new ApiError(403, "Only an authorized Admin may decide a Reservation");
      }

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
