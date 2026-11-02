export type ReservationStatus =
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

export const reservationStatuses: ReservationStatus[] = [
  "CONFIRMED",
  "PENDING_APPROVAL",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

export default function StatusBadge({ status }: { status: ReservationStatus }) {
  return <span className={`status status-${status}`}>{status}</span>;
}
