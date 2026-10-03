import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const now = new Date();
  await prisma.reservation.updateMany({
    where: {
      userId: user.id,
      status: "PENDING_APPROVAL",
      startTime: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

  const reservations = await prisma.reservation.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      note: true,
      agent: {
        select: { id: true, name: true, requiresApproval: true },
      },
    },
  });

  return NextResponse.json(reservations);
}
