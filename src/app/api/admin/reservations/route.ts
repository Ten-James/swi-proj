import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const now = new Date();
  await prisma.reservation.updateMany({
    where: { status: "PENDING_APPROVAL", startTime: { lte: now } },
    data: { status: "EXPIRED" },
  });

  const reservations = await prisma.reservation.findMany({
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      note: true,
      user: { select: { id: true, name: true, email: true } },
      agent: { select: { id: true, name: true, requiresApproval: true } },
    },
  });

  return NextResponse.json(reservations);
}
