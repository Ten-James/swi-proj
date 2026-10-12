import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  assertCanConfirm,
  assertWithinQuota,
  initialStatus,
  planCancel,
  planDecision,
} from "@/lib/reservation-policy";

export interface ReservationActor {
  id: string;
  role: "USER" | "ADMIN";
}

export interface CreateReservationInput {
  userId: string;
  agentId: string;
  startTime: Date;
  endTime: Date;
  note?: string;
}

export type ReservationDecision = "APPROVE" | "REJECT";

async function expirePendingReservations(now: Date, userId?: string) {
  await prisma.reservation.updateMany({
    where: {
      ...(userId ? { userId } : {}),
      status: "PENDING_APPROVAL",
      startTime: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
}

export async function listPublicReservations(now = new Date()) {
  await expirePendingReservations(now);
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
  await expirePendingReservations(now, userId);
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
  await expirePendingReservations(now);
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

  const overlap = await prisma.reservation.findFirst({
    where: {
      agentId,
      status: "CONFIRMED",
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });

  return overlap ? ("UNAVAILABLE" as const) : ("AVAILABLE" as const);
}

export async function createReservation(input: CreateReservationInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.reservation.updateMany({
      where: { status: "PENDING_APPROVAL", startTime: { lte: now } },
      data: { status: "EXPIRED" },
    });

    const agent = await tx.agent.findUnique({ where: { id: input.agentId } });
    if (!agent || !agent.isActive) {
      throw new ApiError(404, "Agent not found or inactive");
    }

    const overlapping = await tx.reservation.findFirst({
      where: {
        agentId: input.agentId,
        status: "CONFIRMED",
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new ApiError(409, "Agent is not free in the requested time window");
    }

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
  actor: ReservationActor,
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

    const overlap = await tx.reservation.findFirst({
      where: {
        id: { not: reservationId },
        agentId: reservation.agentId,
        status: "CONFIRMED",
        startTime: { lt: reservation.endTime },
        endTime: { gt: reservation.startTime },
      },
      select: { id: true },
    });
    assertCanConfirm(reservation.agent.isActive, overlap !== null);

    const confirmed = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CONFIRMED" },
    });
    return { reservation: confirmed, expired: false };
  });
}
