import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const runId = Date.now().toString(36);
const testEmails: string[] = [];
const testAgentIds: string[] = [];
const sessionCookies = new Map<string, string>();
const TEST_PASSWORD = "C02Test123!";
let adminCookie = "";

interface ApiResult {
  response: Response;
  body: Record<string, unknown>;
}

async function api(path: string, init?: RequestInit, sessionCookie?: string): Promise<ApiResult> {
  const headers = new Headers(init?.headers);
  if (sessionCookie) headers.set("Cookie", sessionCookie);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = (await response.json()) as Record<string, unknown>;
  return { response, body };
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function createAgent(label: string, requiresApproval: boolean, isActive = true) {
  const agent = await prisma.agent.create({
    data: {
      name: `C02 ${label} ${runId}`,
      description: `C02 verification fixture: ${label}`,
      capacity: 1,
      isActive,
      requiresApproval,
    },
  });
  testAgentIds.push(agent.id);
  return agent;
}

function testEmail(label: string) {
  const email = `c02-${label}-${runId}@test.local`;
  testEmails.push(email);
  return email;
}

function responseCookie(response: Response) {
  const value = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(value, "Authentication response must set a session cookie");
  return value;
}

async function authenticate(email: string, name = "C02 Verification User") {
  const existing = sessionCookies.get(email);
  if (existing) return existing;

  const result = await api(
    "/api/auth/register",
    json("POST", { name, email, password: TEST_PASSWORD }),
  );
  assert.equal(result.response.status, 201);
  const cookie = responseCookie(result.response);
  sessionCookies.set(email, cookie);
  return cookie;
}

async function createViaApi(input: {
  email: string;
  agentId: string;
  startTime: string;
  endTime: string;
  name?: string;
}) {
  const cookie = await authenticate(input.email, input.name);
  return api(
    "/api/reservations",
    json("POST", {
      agentId: input.agentId,
      startTime: input.startTime,
      endTime: input.endTime,
      note: `verification ${runId}`,
    }),
    cookie,
  );
}

function iso(hour: number, minute = 0) {
  return new Date(Date.UTC(2035, 0, 15, hour, minute)).toISOString();
}

async function runCase(name: string, work: () => Promise<void>) {
  await work();
  console.log(`PASS  ${name}`);
}

async function main() {
  const adminLogin = await api(
    "/api/auth/login",
    json("POST", { email: "admin@agents.local", password: "Admin123!" }),
  );
  assert.equal(adminLogin.response.status, 200);
  adminCookie = responseCookie(adminLogin.response);

  const immediate = await createAgent("Immediate", false);
  const immediateTwo = await createAgent("Immediate Two", false);
  const approval = await createAgent("Approval", true);
  const approvalConflict = await createAgent("Approval Conflict", true);
  const approvalConcurrent = await createAgent("Approval Concurrent", true);
  const inactive = await createAgent("Inactive", false, false);

  await runCase("Authentication registers a User and returns the current session", async () => {
    const email = testEmail("auth");
    const cookie = await authenticate(email, "Authenticated User");
    const me = await api("/api/auth/me", undefined, cookie);
    assert.equal(me.response.status, 200);
    assert.equal((me.body.user as Record<string, unknown>).email, email);
    assert.equal((me.body.user as Record<string, unknown>).role, "USER");
  });

  await runCase("Authentication rejects an invalid password", async () => {
    const email = testEmail("bad-password");
    await authenticate(email);
    const login = await api(
      "/api/auth/login",
      json("POST", { email, password: "wrong-password" }),
    );
    assert.equal(login.response.status, 401);
  });

  await runCase("Logout invalidates the active Session", async () => {
    const email = testEmail("logout");
    const cookie = await authenticate(email);
    const logout = await api("/api/auth/logout", { method: "POST" }, cookie);
    assert.equal(logout.response.status, 200);
    const me = await api("/api/auth/me", undefined, cookie);
    assert.equal(me.response.status, 401);
    sessionCookies.delete(email);
  });

  await runCase("Reservation creation requires authentication", async () => {
    const result = await api(
      "/api/reservations",
      json("POST", { agentId: immediate.id, startTime: iso(6), endTime: iso(7) }),
    );
    assert.equal(result.response.status, 401);
  });

  await runCase("Admin API requires the ADMIN role", async () => {
    const email = testEmail("admin-access");
    const userCookie = await authenticate(email);
    const forbidden = await api("/api/admin/reservations", undefined, userCookie);
    assert.equal(forbidden.response.status, 403);

    const allowed = await api("/api/admin/reservations", undefined, adminCookie);
    assert.equal(allowed.response.status, 200);
  });

  await runCase("OP-01 creates a CONFIRMED Reservation without approval", async () => {
    const result = await createViaApi({
      email: testEmail("create-positive"),
      agentId: immediate.id,
      startTime: iso(8),
      endTime: iso(9),
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.status, "CONFIRMED");
    assert.ok(result.body.id);
  });

  await runCase("OP-01 rejects an invalid zero-length interval", async () => {
    const result = await createViaApi({
      email: testEmail("invalid-interval"),
      agentId: immediate.id,
      startTime: iso(10),
      endTime: iso(10),
    });
    assert.equal(result.response.status, 400);
  });

  await runCase("OP-01 rejects an inactive Agent", async () => {
    const result = await createViaApi({
      email: testEmail("inactive"),
      agentId: inactive.id,
      startTime: iso(10),
      endTime: iso(11),
    });
    assert.equal(result.response.status, 404);
  });

  await runCase("OP-01 enforces the active Reservation limit", async () => {
    const email = testEmail("limit");
    const first = await createViaApi({
      email,
      agentId: immediate.id,
      startTime: iso(12),
      endTime: iso(13),
    });
    assert.equal(first.response.status, 201);
    await prisma.user.update({ where: { email }, data: { maxReservations: 1 } });
    const second = await createViaApi({
      email,
      agentId: immediateTwo.id,
      startTime: iso(14),
      endTime: iso(15),
    });
    assert.equal(second.response.status, 403);
  });

  await runCase("OP-02 applies half-open interval boundaries", async () => {
    const adjacent = await api(
      `/api/availability?${new URLSearchParams({
        agentId: immediate.id,
        startTime: iso(9),
        endTime: iso(10),
      })}`,
    );
    assert.equal(adjacent.response.status, 200);
    assert.equal(adjacent.body.availability, "AVAILABLE");

    const overlap = await api(
      `/api/availability?${new URLSearchParams({
        agentId: immediate.id,
        startTime: iso(8, 30),
        endTime: iso(9, 30),
      })}`,
    );
    assert.equal(overlap.body.availability, "UNAVAILABLE");
  });

  await runCase("OP-03 allows at most one concurrent conflicting Create", async () => {
    const input = {
      agentId: immediateTwo.id,
      startTime: iso(16),
      endTime: iso(17),
    };
    const [left, right] = await Promise.all([
      createViaApi({ ...input, email: testEmail("concurrent-left") }),
      createViaApi({ ...input, email: testEmail("concurrent-right") }),
    ]);
    const statuses = [left.response.status, right.response.status].sort();
    assert.deepEqual(statuses, [201, 409]);
  });

  await runCase("OP-04 cancels a future CONFIRMED Reservation idempotently", async () => {
    const email = testEmail("cancel-confirmed");
    const created = await createViaApi({
      email,
      agentId: immediate.id,
      startTime: iso(18),
      endTime: iso(19),
    });
    assert.equal(created.response.status, 201);
    const id = String(created.body.id);

    const unauthorizedEmail = testEmail("cancel-unauthorized");
    const unauthorizedCookie = await authenticate(unauthorizedEmail);
    const unauthorized = await api(
      `/api/reservations/${id}/cancel`,
      { method: "PATCH" },
      unauthorizedCookie,
    );
    assert.equal(unauthorized.response.status, 403);

    const ownerCookie = await authenticate(email);
    const cancelled = await api(
      `/api/reservations/${id}/cancel`,
      { method: "PATCH" },
      ownerCookie,
    );
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.status, "CANCELLED");

    const repeated = await api(
      `/api/reservations/${id}/cancel`,
      { method: "PATCH" },
      ownerCookie,
    );
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.body.status, "CANCELLED");
  });

  await runCase("OP-04 rejects cancellation at or after startTime", async () => {
    const email = testEmail("cancel-started");
    const user = await prisma.user.create({
      data: { name: "Started fixture", email },
    });
    const started = await prisma.reservation.create({
      data: {
        userId: user.id,
        agentId: immediate.id,
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 60_000),
        status: "CONFIRMED",
      },
    });

    const result = await api(
      `/api/reservations/${started.id}/cancel`,
      { method: "PATCH" },
      await authenticate(email),
    );
    assert.equal(result.response.status, 409);
    const stored = await prisma.reservation.findUnique({ where: { id: started.id } });
    assert.equal(stored?.status, "CONFIRMED");
  });

  await runCase("v0.2 Create persists PENDING_APPROVAL without blocking availability", async () => {
    const created = await createViaApi({
      email: testEmail("pending-availability"),
      agentId: approval.id,
      startTime: iso(8),
      endTime: iso(9),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.status, "PENDING_APPROVAL");

    const availability = await api(
      `/api/availability?${new URLSearchParams({
        agentId: approval.id,
        startTime: iso(8, 15),
        endTime: iso(8, 45),
      })}`,
    );
    assert.equal(availability.body.availability, "AVAILABLE");
  });

  await runCase("BR-04 counts PENDING_APPROVAL toward the User limit", async () => {
    const email = testEmail("pending-limit");
    const pending = await createViaApi({
      email,
      agentId: approval.id,
      startTime: iso(23),
      endTime: iso(24),
    });
    assert.equal(pending.response.status, 201);
    assert.equal(pending.body.status, "PENDING_APPROVAL");
    await prisma.user.update({ where: { email }, data: { maxReservations: 1 } });

    const overLimit = await createViaApi({
      email,
      agentId: immediateTwo.id,
      startTime: iso(23),
      endTime: iso(24),
    });
    assert.equal(overLimit.response.status, 403);
  });

  await runCase("OP-04 cancels a future PENDING_APPROVAL Reservation", async () => {
    const email = testEmail("cancel-pending");
    const created = await createViaApi({
      email,
      agentId: approval.id,
      startTime: iso(10),
      endTime: iso(11),
    });
    const cancelled = await api(
      `/api/reservations/${String(created.body.id)}/cancel`,
      { method: "PATCH" },
      await authenticate(email),
    );
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.status, "CANCELLED");
  });

  await runCase("OP-04 expires PENDING_APPROVAL at the cancellation boundary", async () => {
    const email = testEmail("cancel-expired-pending");
    const user = await prisma.user.create({
      data: { name: "Pending expiration fixture", email },
    });
    const pending = await prisma.reservation.create({
      data: {
        userId: user.id,
        agentId: approval.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + 60_000),
        status: "PENDING_APPROVAL",
      },
    });

    const result = await api(
      `/api/reservations/${pending.id}/cancel`,
      { method: "PATCH" },
      await authenticate(email),
    );
    assert.equal(result.response.status, 409);
    assert.equal(result.body.status, "EXPIRED");
    const stored = await prisma.reservation.findUnique({ where: { id: pending.id } });
    assert.equal(stored?.status, "EXPIRED");
  });

  await runCase("OP-05 approves a valid pending Reservation", async () => {
    const created = await createViaApi({
      email: testEmail("approve"),
      agentId: approval.id,
      startTime: iso(12),
      endTime: iso(13),
    });
    const decision = await api(
      `/api/reservations/${String(created.body.id)}/decision`,
      json("PATCH", { decision: "APPROVE" }),
      adminCookie,
    );
    assert.equal(decision.response.status, 200);
    assert.equal(decision.body.status, "CONFIRMED");

    const availability = await api(
      `/api/availability?${new URLSearchParams({
        agentId: approval.id,
        startTime: iso(12, 15),
        endTime: iso(12, 45),
      })}`,
    );
    assert.equal(availability.body.availability, "UNAVAILABLE");
  });

  await runCase("OP-05 rejects an unauthorized decision", async () => {
    const email = testEmail("unauthorized-decision");
    const created = await createViaApi({
      email,
      agentId: approval.id,
      startTime: iso(14),
      endTime: iso(15),
    });
    const decision = await api(
      `/api/reservations/${String(created.body.id)}/decision`,
      json("PATCH", { decision: "APPROVE" }),
      await authenticate(email),
    );
    assert.equal(decision.response.status, 403);
    const stored = await prisma.reservation.findUnique({
      where: { id: String(created.body.id) },
    });
    assert.equal(stored?.status, "PENDING_APPROVAL");
  });

  await runCase("OP-05 persists an Admin rejection", async () => {
    const created = await createViaApi({
      email: testEmail("reject"),
      agentId: approval.id,
      startTime: iso(16),
      endTime: iso(17),
    });
    const decision = await api(
      `/api/reservations/${String(created.body.id)}/decision`,
      json("PATCH", { decision: "REJECT" }),
      adminCookie,
    );
    assert.equal(decision.response.status, 200);
    assert.equal(decision.body.status, "REJECTED");
  });

  await runCase("OP-05 rechecks overlap that appeared while waiting", async () => {
    const created = await createViaApi({
      email: testEmail("appeared-overlap"),
      agentId: approvalConflict.id,
      startTime: iso(18),
      endTime: iso(19),
    });
    const conflictUser = await prisma.user.create({
      data: {
        name: "Conflict fixture",
        email: testEmail("conflict-fixture"),
      },
    });
    await prisma.reservation.create({
      data: {
        userId: conflictUser.id,
        agentId: approvalConflict.id,
        startTime: new Date(iso(18, 30)),
        endTime: new Date(iso(19, 30)),
        status: "CONFIRMED",
      },
    });
    const decision = await api(
      `/api/reservations/${String(created.body.id)}/decision`,
      json("PATCH", { decision: "APPROVE" }),
      adminCookie,
    );
    assert.equal(decision.response.status, 409);
    const stored = await prisma.reservation.findUnique({
      where: { id: String(created.body.id) },
    });
    assert.equal(stored?.status, "PENDING_APPROVAL");
  });

  await runCase("OP-05 rechecks Agent activity at decision time", async () => {
    const created = await createViaApi({
      email: testEmail("inactive-at-decision"),
      agentId: approval.id,
      startTime: iso(22),
      endTime: iso(23),
    });
    await prisma.agent.update({
      where: { id: approval.id },
      data: { isActive: false },
    });

    try {
      const decision = await api(
        `/api/reservations/${String(created.body.id)}/decision`,
        json("PATCH", { decision: "APPROVE" }),
        adminCookie,
      );
      assert.equal(decision.response.status, 409);
      const stored = await prisma.reservation.findUnique({
        where: { id: String(created.body.id) },
      });
      assert.equal(stored?.status, "PENDING_APPROVAL");
    } finally {
      await prisma.agent.update({
        where: { id: approval.id },
        data: { isActive: true },
      });
    }
  });

  await runCase("REQ-12 expires pending approval at the start boundary", async () => {
    const userEmail = testEmail("expired");
    const user = await prisma.user.create({
      data: { name: "Expired fixture", email: userEmail },
    });
    const expired = await prisma.reservation.create({
      data: {
        userId: user.id,
        agentId: approval.id,
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 60_000),
        status: "PENDING_APPROVAL",
      },
    });
    const decision = await api(
      `/api/reservations/${expired.id}/decision`,
      json("PATCH", { decision: "APPROVE" }),
      adminCookie,
    );
    assert.equal(decision.response.status, 409);
    assert.equal(decision.body.status, "EXPIRED");
  });

  await runCase("REQ-10 allows at most one conflicting concurrent approval", async () => {
    const left = await createViaApi({
      email: testEmail("approval-left"),
      agentId: approvalConcurrent.id,
      startTime: iso(20),
      endTime: iso(21),
    });
    const right = await createViaApi({
      email: testEmail("approval-right"),
      agentId: approvalConcurrent.id,
      startTime: iso(20, 15),
      endTime: iso(21, 15),
    });
    assert.equal(left.body.status, "PENDING_APPROVAL");
    assert.equal(right.body.status, "PENDING_APPROVAL");

    const [leftDecision, rightDecision] = await Promise.all([
      api(
        `/api/reservations/${String(left.body.id)}/decision`,
        json("PATCH", { decision: "APPROVE" }),
        adminCookie,
      ),
      api(
        `/api/reservations/${String(right.body.id)}/decision`,
        json("PATCH", { decision: "APPROVE" }),
        adminCookie,
      ),
    ]);
    const statuses = [leftDecision.response.status, rightDecision.response.status].sort();
    assert.deepEqual(statuses, [200, 409]);
  });

  await runCase("Global overview omits Reservation owner identity", async () => {
    const result = await api("/api/reservations");
    assert.equal(result.response.status, 200);
    const rows = result.body as unknown as Array<Record<string, unknown>>;
    assert.ok(rows.length > 0);
    assert.equal("user" in rows[0], false);
    assert.equal("userId" in rows[0], false);
    assert.equal("note" in rows[0], false);
  });

  console.log("\nC02 verification PASSED");
}

main()
  .catch((error) => {
    console.error("\nC02 verification FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (adminCookie) {
      await api("/api/auth/logout", { method: "POST" }, adminCookie).catch(() => undefined);
    }
    await prisma.reservation.deleteMany({
      where: { agentId: { in: testAgentIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });
    await prisma.agent.deleteMany({
      where: { id: { in: testAgentIds } },
    });
    await prisma.$disconnect();
  });
