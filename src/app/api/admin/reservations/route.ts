import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAdminReservations } from "@/lib/reservation-service";

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return NextResponse.json(await listAdminReservations());
}
