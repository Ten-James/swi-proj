/**
 * Shared HTTP + fixture helpers for the stepwise C08/C09 test cases.
 *
 * The test process talks to the running application only through its public HTTP
 * API. Fixtures (Agents, pre-existing Reservations) are written directly with Prisma,
 * the same way `scripts/c02-verification.ts` does, because the application has no
 * Agent administration API. `scripts/c02-verification.ts` itself is left untouched.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { prisma } from "../../src/lib/prisma";

export const API_URL = process.env.API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "C08Test123!";

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export interface StepRecord {
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
}

/** Creates a fixture namespace so parallel or repeated runs never share rows. */
export function fixtureScope(prefix: string) {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const agentIds: string[] = [];
  const emails: string[] = [];
  const cookies = new Map<string, string>();
  let adminCookie = "";

  async function api(path: string, init?: RequestInit, cookie?: string): Promise<ApiResult> {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  }

  function cookieOf(response: Response) {
    const value = response.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(value, "Authentication response must set a session cookie");
    return value;
  }

  function email(label: string) {
    const value = `${prefix}-${label}-${runId}@test.local`;
    emails.push(value);
    return value;
  }

  /** Registers a new User through `/api/auth/register` and returns its session cookie. */
  async function user(label: string) {
    const address = email(label);
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${prefix} ${label}`, email: address, password: TEST_PASSWORD }),
    });
    assert.equal(response.status, 201, `registration of ${address} must succeed`);
    const cookie = cookieOf(response);
    cookies.set(address, cookie);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    return { id: row.id, email: address, cookie };
  }

  /** Logs in the seeded demo Admin (README) and returns its session cookie. */
  async function admin() {
    if (adminCookie) return adminCookie;
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@agents.local", password: "Admin123!" }),
    });
    assert.equal(response.status, 200, "seeded Admin must be able to log in (run db:seed)");
    adminCookie = cookieOf(response);
    return adminCookie;
  }

  async function agent(label: string, options: { requiresApproval?: boolean; isActive?: boolean } = {}) {
    const row = await prisma.agent.create({
      data: {
        name: `${prefix} ${label} ${runId}`,
        description: `${prefix} fixture: ${label}`,
        capacity: 1,
        isActive: options.isActive ?? true,
        requiresApproval: options.requiresApproval ?? false,
      },
    });
    agentIds.push(row.id);
    return row;
  }

  /** Fixture writer: a Reservation that already exists before the step under test. */
  async function existingReservation(input: {
    userId: string;
    agentId: string;
    startTime: string;
    endTime: string;
    status: "CONFIRMED" | "PENDING_APPROVAL";
  }) {
    return prisma.reservation.create({
      data: {
        userId: input.userId,
        agentId: input.agentId,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        status: input.status,
        note: `${prefix} fixture ${runId}`,
      },
    });
  }

  function createReservation(cookie: string, input: { agentId: string; startTime: string; endTime: string }) {
    return api(
      "/api/reservations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, note: `${prefix} ${runId}` }),
      },
      cookie,
    );
  }

  function decide(id: string, decision: "APPROVE" | "REJECT", cookie: string) {
    return api(
      `/api/reservations/${id}/decision`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      },
      cookie,
    );
  }

  function cancel(id: string, cookie: string) {
    return api(`/api/reservations/${id}/cancel`, { method: "PATCH" }, cookie);
  }

  /** Removes every Reservation of the fixture Agents (the "reset" step of a test case). */
  async function resetReservations() {
    await prisma.reservation.deleteMany({ where: { agentId: { in: agentIds } } });
  }

  async function cleanup() {
    for (const cookie of [...cookies.values(), adminCookie].filter(Boolean)) {
      await api("/api/auth/logout", { method: "POST" }, cookie).catch(() => undefined);
    }
    await prisma.reservation.deleteMany({ where: { agentId: { in: agentIds } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.agent.deleteMany({ where: { id: { in: agentIds } } });
  }

  return {
    runId,
    api,
    user,
    admin,
    agent,
    existingReservation,
    createReservation,
    decide,
    cancel,
    resetReservations,
    cleanup,
  };
}

/** Records one executed step: `expected` was written before the run, `actual` is observed. */
export function step(records: StepRecord[], name: string, expected: string, actual: string, pass: boolean) {
  records.push({ step: name, expected, actual, pass });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
}

/** Runs a test case, prints a verdict and never stops the remaining cases. */
export async function testCase(id: string, title: string, work: (records: StepRecord[]) => Promise<void>) {
  console.log(`\n${id} — ${title}`);
  const records: StepRecord[] = [];
  try {
    await work(records);
  } catch (error) {
    records.push({ step: "unexpected error", expected: "no exception", actual: String(error), pass: false });
    console.log(`  FAIL  unexpected error: ${error instanceof Error ? error.stack : String(error)}`);
  }
  const verdict = records.length > 0 && records.every((record) => record.pass) ? "PASS" : "FAIL";
  console.log(`${id} verdict: ${verdict}`);
  return { id, verdict, records };
}

/** Prints the run header used as evidence: commit, target, DB and time source. */
export function runHeader(title: string) {
  let commit = "unknown";
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain -- src prisma", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    commit = dirty ? `${sha} (src/prisma modified)` : sha;
  } catch {
    // Not a git checkout (e.g. exported archive): the run header says so.
  }
  console.log(`${title}`);
  console.log(`  commit       = ${commit}`);
  console.log(`  API_URL      = ${API_URL}`);
  console.log(`  DATABASE_URL = ${process.env.DATABASE_URL ?? "file:./dev.db (default)"}`);
  console.log(`  started      = ${new Date().toISOString()}`);
}

export async function disconnect() {
  await prisma.$disconnect();
}
