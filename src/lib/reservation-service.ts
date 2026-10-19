import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  assertCanConfirm,
  assertNoConfirmedOverlap,
  assertStartsInFuture,
  assertWithinQuota,
  initialStatus,
  overlapBounds,
  planCancel,
  planDecision,
  type PolicyActor,
  type TimeInterval,
} from "@/lib/reservation-policy";

export interface CreateReservationInput {
  userId: string;
  agentId: string;
  startTime: Date;
  endTime: Date;
  note?: string;
}

export type ReservationDecision = "APPROVE" | "REJECT";

type ReservationClient = Prisma.TransactionClient;

/** Persists REQ-12 in bulk; `startTime <= now` mirrors `isPendingExpired`. */
async function expirePendingReservations(client: ReservationClient, now: Date, userId?: string) {
  await client.reservation.updateMany({
    where: {
      ...(userId ? { userId } : {}),
      status: "PENDING_APPROVAL",
      startTime: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
}

/** BR-02: first CONFIRMED Reservation of the Agent overlapping `interval` (BR-01 bounds). */
function findConfirmedOverlap(
  client: ReservationClient,
  agentId: string,
  interval: TimeInterval,
  excludeReservationId?: string,
) {
  const bounds = overlapBounds(interval);
  return client.reservation.findFirst({
    where: {
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      agentId,
      status: "CONFIRMED",
      startTime: { lt: bounds.startsBefore },
      endTime: { gt: bounds.endsAfter },
    },
    select: { id: true },
  });
}

export async function listPublicReservations(now = new Date()) {
  await expirePendingReservations(prisma, now);
  return prisma.reservation.findMany({
    orderBy: [{ agent: { name: "asc" } }, { startTime: "asc" }],
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      agent: {
        select: { id: true, name: true, requiresApproval: true },
      },
    },
  });
}

export async function listUserReservations(userId: string, now = new Date()) {
  await expirePendingReservations(prisma, now, userId);
  return prisma.reservation.findMany({
    where: { userId },
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
}

export async function listAdminReservations(now = new Date()) {
  await expirePendingReservations(prisma, now);
  return prisma.reservation.findMany({
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
}

export async function checkAgentAvailability(
  agentId: string,
  startTime: Date,
  endTime: Date,
) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new ApiError(404, "Agent not found");
  if (!agent.isActive) return "UNAVAILABLE" as const;

  const overlap = await findConfirmedOverlap(prisma, agentId, { startTime, endTime });

  return overlap ? ("UNAVAILABLE" as const) : ("AVAILABLE" as const);
}

export async function createReservation(input: CreateReservationInput, now = new Date()) {
  assertStartsInFuture(input, now);

  return prisma.$transaction(async (tx) => {
    await expirePendingReservations(tx, now);

    // BR-05 at Create: an inactive Agent is reported like an unknown one (OP-01 card).
    const agent = await tx.agent.findUnique({ where: { id: input.agentId } });
    if (!agent || !agent.isActive) {
      throw new ApiError(404, "Agent not found or inactive");
    }

    const overlapping = await findConfirmedOverlap(tx, input.agentId, input);
    assertNoConfirmedOverlap(overlapping !== null);

    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new ApiError(401, "Authenticated User no longer exists");

    const activeReservationCount = await tx.reservation.count({
      where: {
        userId: user.id,
        status: { in: ["PENDING_APPROVAL", "CONFIRMED"] },
        endTime: { gt: now },
      },
    });
    assertWithinQuota(activeReservationCount, user.maxReservations);

    return tx.reservation.create({
      data: {
        userId: user.id,
        agentId: input.agentId,
        startTime: input.startTime,
        endTime: input.endTime,
        note: input.note,
        status: initialStatus(agent),
      },
    });
  });
}

export async function cancelReservation(
  reservationId: string,
  actor: PolicyActor,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new ApiError(404, "Reservation not found");

    const plan = planCancel(reservation, actor, now);
    if (plan === "ALREADY_CANCELLED") return { reservation, expired: false };
    if (plan === "EXPIRE") {
      const expired = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "EXPIRED" },
      });
      return { reservation: expired, expired: true };
    }

    const cancelled = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
    });
    return { reservation: cancelled, expired: false };
  });
}

export async function decideReservation(
  reservationId: string,
  decision: ReservationDecision,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { agent: true },
    });
    if (!reservation) throw new ApiError(404, "Reservation not found");

    const plan = planDecision(reservation, decision, now);
    if (plan === "EXPIRE") {
      const expired = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "EXPIRED" },
      });
      return { reservation: expired, expired: true };
    }

    if (plan === "REJECT") {
      const rejected = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "REJECTED" },
      });
      return { reservation: rejected, expired: false };
    }

    const overlap = await findConfirmedOverlap(tx, reservation.agentId, reservation, reservationId);
    assertCanConfirm(reservation.agent.isActive, overlap !== null);

    const confirmed = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CONFIRMED" },
    });
    return { reservation: confirmed, expired: false };
  });
}
