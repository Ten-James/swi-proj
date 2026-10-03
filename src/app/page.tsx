import { getCurrentUser } from "@/lib/auth";
import ReservationApp from "./reservation-app";

export default async function Home() {
  const user = await getCurrentUser();
  return <ReservationApp user={user} />;
}
