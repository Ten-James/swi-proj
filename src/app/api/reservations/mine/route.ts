import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listUserReservations } from "@/lib/reservation-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return NextResponse.json(await listUserReservations(user.id));
}
