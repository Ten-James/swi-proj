import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

interface CancelBody {
  email?: string;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: CancelBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { id } = await context.params;
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });
      if (!reservation) {
        throw new ApiError(404, "Reservation not found");
      }

      const actor = await tx.user.findUnique({ where: { email } });
      if (!actor || (actor.id !== reservation.userId && actor.role !== "ADMIN")) {
        throw new ApiError(403, "Actor is not authorized to cancel this Reservation");
      }

      if (reservation.status === "CANCELLED") {
        return { reservation, conflict: false };
      }

      if (reservation.status === "PENDING_APPROVAL" && now >= reservation.startTime) {
        const expired = await tx.reservation.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
        return { reservation: expired, conflict: true };
      }

      if (
        reservation.status !== "CONFIRMED" &&
        reservation.status !== "PENDING_APPROVAL"
      ) {
        throw new ApiError(409, `Reservation in state ${reservation.status} cannot be cancelled`);
      }

      if (now >= reservation.startTime) {
        throw new ApiError(409, "Reservation cannot be cancelled at or after startTime");
      }

      const cancelled = await tx.reservation.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      return { reservation: cancelled, conflict: false };
    });

    if (result.conflict) {
      return NextResponse.json(
        {
          error: "Pending Reservation expired at startTime and cannot be cancelled",
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
