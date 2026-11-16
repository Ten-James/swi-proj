/**
 * C10 operational trials: success, rejected conflict, database outage + recovery, restart.
 *
 *   npm run build            # the trials run against the production build
 *   npm run trial:c10        # optional: C10_ROUND=1 for a labelled output directory
 *
 * Isolation: its own SQLite file (default ./c10.db, deleted and recreated, never dev.db)
 * and its own `next start` on port 3200. The raw application output is kept unchanged in
 * release/c10/<round>/server-*.log; the harness keeps its own timeline (timeline.md) so
 * that what the application logged and what the tester observed are never mixed.
 *
 * Every situation states its expected result before it runs and checks the persisted
 * state through scripts/lib/db-oracle.ts. The outage holds a SQLite lock from a separate
 * connection: EXCLUSIVE (database unavailable for reads and writes) and IMMEDIATE (writes
 * unavailable). A write is retried only after the oracle has shown that it did not commit.
 *
 * Exit code 1 when a situation deviates from its expectation or when the log contract
 * (technical failure diagnosable, no personal data or secrets, start/stop visible) fails.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { startNextServer, type ManagedServer } from "./lib/server";

const root = process.cwd();
const port = process.env.C10_PORT ?? "3200";
const dbFile = path.resolve(root, process.env.C10_DATABASE_FILE ?? "c10.db");
const round = process.env.C10_ROUND ?? "latest";
const outDir = path.join(root, "release", "c10", round);
const apiUrl = `http://localhost:${port}`;

if (path.basename(dbFile) === "dev.db") {
  console.error("Refusing to inject faults into dev.db; use an isolated C10_DATABASE_FILE");
  process.exit(1);
}

// Before any import of the Prisma client: the harness reads the same isolated database.
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.API_URL = apiUrl;
const env = { ...process.env };

interface SqliteHandle {
  exec(sql: string): void;
  pragma(sql: string, options: { simple: true }): unknown;
  close(): void;
}
type SqliteConstructor = new (file: string, options?: { timeout?: number }) => SqliteHandle;
// better-sqlite3 is already installed as the driver of @prisma/adapter-better-sqlite3.
const Sqlite = createRequire(path.join(root, "package.json"))("better-sqlite3") as SqliteConstructor;

interface TimelineEntry {
  ts: string;
  situation: string;
  action: string;
  observation: string;
}

interface Situation {
  id: string;
  title: string;
  expected: string;
  actual: string[];
  verified: string[];
  logs: string;
  pass: boolean;
}

const timeline: TimelineEntry[] = [];
const situations: Situation[] = [];

function note(situation: string, action: string, observation: string) {
  const entry = { ts: new Date().toISOString(), situation, action, observation };
  timeline.push(entry);
  console.log(`[${entry.ts}] ${situation} | ${action} | ${observation}`);
}

function npmRun(script: string) {
  const result = spawnSync("npm", ["run", script], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`npm run ${script} failed`);
}

function logSize(file: string) {
  return existsSync(file) ? statSync(file).size : 0;
}

/** Text the application printed to `file` since byte `from` (waits briefly for buffered output). */
async function logSince(file: string, from: number) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return existsSync(file) ? readFileSync(file).subarray(from).toString("utf8") : "";
}

function excerpt(text: string, maxLines = 12) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return "(no application output)";
  const shown = lines.slice(0, maxLines).map((line) => (line.length > 220 ? `${line.slice(0, 220)}…` : line));
  return lines.length > maxLines ? [...shown, `… (${lines.length - maxLines} more lines)`].join("\n") : shown.join("\n");
}

async function timed<T>(work: () => Promise<T>) {
  const started = Date.now();
  const value = await work();
  return { value, ms: Date.now() - started };
}

function check(list: string[], ok: boolean, text: string) {
  list.push(`${ok ? "OK" : "NOT OK"} — ${text}`);
  return ok;
}

// Log contract — evaluated on the raw application output, the same way in every round.
const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const FAILURE_TYPE = /SQLITE_BUSY|database is locked|SocketTimeout|P1008|timed out|DriverAdapterError/i;
const OPERATION = /(POST|GET|PATCH)\s*\/api\/|"operation"\s*:\s*"[^"]+"|"routePath"\s*:\s*"[^"]+"/;
const OUTCOME = /"outcome"\s*:\s*"[^"]+"/;

function technicalFailureContract(text: string) {
  return {
    timestamp: ISO_TS.test(text),
    operation: OPERATION.test(text),
    failureType: FAILURE_TYPE.test(text),
    outcome: OUTCOME.test(text),
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) throw new Error("No production build: run npm run build first");

  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${dbFile}${suffix}`, { force: true });
  npmRun("db:deploy");
  npmRun("db:seed");

  const { fixtureScope, TEST_PASSWORD } = await import("./lib/e2e");
  const { confirmedOverlapPairs, describe, readAgentReservations, readReservation } = await import("./lib/db-oracle");
  const { prisma } = await import("../src/lib/prisma");

  const say = (line: string) => note("harness", "server", line);
  const log1 = path.join(outDir, "server-1.log");
  const log2 = path.join(outDir, "server-2.log");
  let server: ManagedServer | null = await startNextServer({ port, env, logFile: log1, say });
  if (!server) throw new Error("server 1 did not start");
  const startupText1 = await logSince(log1, 0);

  const scope = fixtureScope("c10");
  const secrets: string[] = [TEST_PASSWORD, "Admin123!", "admin@agents.local"];
  const day = (hour: number, minute = 0) => new Date(Date.UTC(2035, 5, 1, hour, minute)).toISOString();

  try {
    const owner = await scope.user("owner");
    const second = await scope.user("second");
    for (const person of [owner, second]) {
      const token = person.cookie.split("=").slice(1).join("=");
      secrets.push(person.email, token, createHash("sha256").update(token).digest("hex"));
    }
    secrets.push(`c10 ${scope.runId}`); // note text sent with every Create
    const admin = await scope.admin();
    const agent = await scope.agent("Approval agent", { requiresApproval: true });

    // S1 — successful create + confirm
    const s1: Situation = {
      id: "S1", title: "Úspěšné vytvoření a potvrzení",
      expected: "Create → 201 PENDING_APPROVAL; Admin APPROVE → 200 CONFIRMED; DB: CONFIRMED [10:00,11:00), 0 překryvů; aplikace nic nelogovat nemusí",
      actual: [], verified: [], logs: "", pass: true,
    };
    let from = logSize(log1);
    const created = await scope.createReservation(owner.cookie, { agentId: agent.id, startTime: day(10), endTime: day(11) });
    note("S1", "POST /api/reservations [10:00,11:00)", `${created.status} ${JSON.stringify(created.body)}`);
    const b1 = String(created.body.id);
    // S2 precondition, made while B1 is still pending: PENDING does not block (BR-02 counts CONFIRMED only).
    const pending = await scope.createReservation(second.cookie, { agentId: agent.id, startTime: day(10, 30), endTime: day(11, 30) });
    note("S2", "precondition: POST /api/reservations B2 [10:30,11:30) while B1 is pending", `${pending.status} ${JSON.stringify(pending.body)}`);
    const b2 = String(pending.body.id);
    const approved = await scope.decide(b1, "APPROVE", admin);
    note("S1", "PATCH decision APPROVE", `${approved.status} ${JSON.stringify(approved.body)}`);
    s1.actual.push(`Create ${created.status} ${String(created.body.status)}`, `APPROVE ${approved.status} ${String(approved.body.status)}`);
    const storedB1 = await readReservation(b1);
    const pairs1 = await confirmedOverlapPairs(agent.id);
    s1.pass = check(s1.verified, created.status === 201 && created.body.status === "PENDING_APPROVAL", "Create vrátil 201 PENDING_APPROVAL") && s1.pass;
    s1.pass = check(s1.verified, approved.status === 200 && approved.body.status === "CONFIRMED", "APPROVE vrátil 200 CONFIRMED") && s1.pass;
    s1.pass = check(s1.verified, storedB1?.status === "CONFIRMED", `DB (vlastní SQL čtení): ${describe(storedB1)}`) && s1.pass;
    s1.pass = check(s1.verified, pairs1.length === 0, `překrývající se CONFIRMED dvojice: ${pairs1.length}`) && s1.pass;
    s1.logs = await logSince(log1, from);
    situations.push(s1);

    // S2 — rejected conflict
    const s2: Situation = {
      id: "S2", title: "Zamítnutá kolize",
      expected: "B2 [10:30,11:30) vznikla jako PENDING_APPROVAL ještě před potvrzením B1; APPROVE B2 → 409 AGENT_UNAVAILABLE; nový Create [10:30,11:30) → 409 AGENT_UNAVAILABLE; DB: B2 PENDING_APPROVAL, B1 CONFIRMED beze změny, žádný nový řádek, 0 překryvů; doménové zamítnutí není technická chyba",
      actual: [], verified: [], logs: "", pass: true,
    };
    from = logSize(log1);
    const rowsBeforeS2 = (await readAgentReservations(agent.id)).length;
    const rejected = await scope.decide(b2, "APPROVE", admin);
    note("S2", "PATCH decision APPROVE B2 (overlaps confirmed B1)", `${rejected.status} ${JSON.stringify(rejected.body)}`);
    const overlapCreate = await scope.createReservation(second.cookie, { agentId: agent.id, startTime: day(10, 30), endTime: day(11, 30) });
    note("S2", "POST /api/reservations [10:30,11:30) (overlaps confirmed B1)", `${overlapCreate.status} ${JSON.stringify(overlapCreate.body)}`);
    s2.actual.push(`B2 ${pending.status} ${String(pending.body.status)}`, `APPROVE B2 ${rejected.status} ${String(rejected.body.code)}`, `Create ${overlapCreate.status} ${String(overlapCreate.body.code)}`);
    const storedB2 = await readReservation(b2);
    const storedB1After = await readReservation(b1);
    const pairs2 = await confirmedOverlapPairs(agent.id);
    s2.pass = check(s2.verified, pending.status === 201 && pending.body.status === "PENDING_APPROVAL", "B2 vytvořena jako PENDING_APPROVAL") && s2.pass;
    s2.pass = check(s2.verified, rejected.status === 409 && rejected.body.code === "AGENT_UNAVAILABLE", "APPROVE B2 zamítnut 409 AGENT_UNAVAILABLE") && s2.pass;
    s2.pass = check(s2.verified, overlapCreate.status === 409 && overlapCreate.body.code === "AGENT_UNAVAILABLE", "překrývající Create zamítnut 409 AGENT_UNAVAILABLE") && s2.pass;
    const rowsAfterS2 = (await readAgentReservations(agent.id)).length;
    s2.pass = check(s2.verified, rowsAfterS2 === rowsBeforeS2, `DB: počet řádků Agenta ${rowsAfterS2} (před ${rowsBeforeS2}) — zamítnutý Create nic neuložil`) && s2.pass;
    s2.pass = check(s2.verified, storedB2?.status === "PENDING_APPROVAL", `DB B2: ${describe(storedB2)}`) && s2.pass;
    s2.pass = check(s2.verified, storedB1After?.status === "CONFIRMED", `DB B1: ${describe(storedB1After)}`) && s2.pass;
    s2.pass = check(s2.verified, pairs2.length === 0, `překrývající se CONFIRMED dvojice: ${pairs2.length}`) && s2.pass;
    s2.logs = await logSince(log1, from);
    situations.push(s2);

    // S3 — database outage and recovery without restart
    const s3: Situation = {
      id: "S3", title: "Technická porucha DB a obnova",
      expected: "S3a EXCLUSIVE zámek: POST Create i GET /api/reservations → 500 po ~5 s (busy timeout), nic se nezapíše. S3b IMMEDIATE zámek (jen zápisy): POST Create → 500, nic se nezapíše. Po uvolnění bez restartu: nezávislé čtení potvrdí 0 nových řádků, teprve pak jeden opakovaný Create → 201 a právě 1 řádek; log musí dát čas, operaci, typ chyby a výsledek",
      actual: [], verified: [], logs: "", pass: true,
    };
    const lock = new Sqlite(dbFile, { timeout: 2000 });
    const journalMode = String(lock.pragma("journal_mode", { simple: true }));
    note("S3", "PRAGMA journal_mode (harness connection)", journalMode);
    const before = (await readAgentReservations(agent.id)).length;
    const target = { agentId: agent.id, startTime: day(13), endTime: day(14) };
    const windows: string[] = [];
    const outageWindows: Array<{ label: string; text: string }> = [];

    for (const mode of ["EXCLUSIVE", "IMMEDIATE"] as const) {
      const label = mode === "EXCLUSIVE" ? "S3a" : "S3b";
      from = logSize(log1);
      lock.exec(`BEGIN ${mode}`);
      note(label, `fault injected: BEGIN ${mode} held by a separate connection`, "lock held");
      const write = await timed(() => scope.createReservation(owner.cookie, target));
      note(label, "POST /api/reservations [13:00,14:00) during outage", `${write.value.status} ${JSON.stringify(write.value.body)} after ${write.ms} ms`);
      const read = await timed(() => scope.api("/api/reservations"));
      note(label, "GET /api/reservations during outage", `${read.value.status} after ${read.ms} ms`);
      lock.exec("ROLLBACK");
      note(label, "fault removed: ROLLBACK", "lock released");
      s3.actual.push(`${label} (${mode}): POST ${write.value.status} za ${write.ms} ms, GET ${read.value.status} za ${read.ms} ms`);
      s3.pass = check(s3.verified, write.value.status === 500, `${label}: POST během výpadku vrátil ${write.value.status} (očekáváno 500)`) && s3.pass;
      check(s3.verified, true, `${label}: GET během výpadku vrátil ${read.value.status}`);
      const afterFault = (await readAgentReservations(agent.id)).length;
      s3.pass = check(s3.verified, afterFault === before, `${label}: po uvolnění nezávislé čtení — řádků Agenta ${afterFault} (před výpadkem ${before}), zápis se neprovedl`) && s3.pass;
      const windowText = await logSince(log1, from);
      outageWindows.push({ label, text: windowText });
      windows.push(`--- ${label} (${mode}) ---\n${windowText}`);
    }
    lock.close();

    from = logSize(log1);
    const retry = await scope.createReservation(owner.cookie, target);
    note("S3", "single deliberate retry POST [13:00,14:00) after recovery", `${retry.status} ${JSON.stringify(retry.body)}`);
    const list = await scope.api("/api/reservations");
    note("S3", "GET /api/reservations after recovery", `${list.status}`);
    const rows = (await readAgentReservations(agent.id)).filter((row) => row.startTime.toISOString() === target.startTime);
    s3.actual.push(`po obnově: POST ${retry.status} ${String(retry.body.status)}, GET ${list.status}`);
    s3.pass = check(s3.verified, retry.status === 201 && list.status === 200, "po obnově bez restartu Create 201 a GET 200") && s3.pass;
    s3.pass = check(s3.verified, rows.length === 1, `DB: Reservation [13:00,14:00) existuje právě ${rows.length}×`) && s3.pass;
    windows.push(`--- after recovery ---\n${await logSince(log1, from)}`);
    s3.logs = windows.join("\n");
    situations.push(s3);

    // S4 — restart
    const s4: Situation = {
      id: "S4", title: "Restart aplikace",
      expected: "SIGTERM → proces skončí; nový start nad stejnou DB; B1 zůstává CONFIRMED (API i DB); další Create → 201 a řádek v DB; posoudit, co je o stopu a startu v záznamech",
      actual: [], verified: [], logs: "", pass: true,
    };
    from = logSize(log1);
    note("S4", "send SIGTERM to server 1", `pid ${server.child.pid}`);
    const stopped = await server.stop();
    server = null;
    note("S4", "server 1 exited", `code=${stopped.code} signal=${stopped.signal}`);
    const stopText = await logSince(log1, from);
    server = await startNextServer({ port, env, logFile: log2, say });
    if (!server) throw new Error("server 2 did not start");
    const startupText2 = await logSince(log2, 0);
    const overview = await scope.api("/api/reservations");
    const listed = (overview.body as unknown as Array<{ id: string; status: string }>).find?.((row) => row.id === b1);
    note("S4", "GET /api/reservations after restart", `${overview.status}; B1 ${listed ? listed.status : "missing"}`);
    const storedAfterRestart = await readReservation(b1);
    const further = await scope.createReservation(second.cookie, { agentId: agent.id, startTime: day(15), endTime: day(16) });
    note("S4", "POST /api/reservations [15:00,16:00) after restart", `${further.status} ${JSON.stringify(further.body)}`);
    const furtherRow = await readReservation(String(further.body.id));
    s4.actual.push(`stop: code=${stopped.code} signal=${stopped.signal}`, `po startu GET ${overview.status}, B1 ${listed?.status ?? "chybí"}`, `další Create ${further.status} ${String(further.body.status)}`);
    s4.pass = check(s4.verified, listed?.status === "CONFIRMED", "API po restartu vrací B1 CONFIRMED") && s4.pass;
    s4.pass = check(s4.verified, storedAfterRestart?.status === "CONFIRMED", `DB B1: ${describe(storedAfterRestart)}`) && s4.pass;
    s4.pass = check(s4.verified, further.status === 201 && furtherRow !== null, `další Create ${further.status}, v DB ${describe(furtherRow)}`) && s4.pass;
    s4.logs = `--- server 1 after SIGTERM ---\n${stopText}\n--- server 2 startup ---\n${startupText2}`;
    situations.push(s4);

    // Log contract over the raw application output.
    const contract: string[] = [];
    const failureText = s3.logs;
    const failure = technicalFailureContract(failureText);
    let contractOk = true;
    contractOk = check(contract, failure.timestamp, "porucha: log obsahuje čas události (ISO 8601)") && contractOk;
    contractOk = check(contract, failure.operation, "porucha: log obsahuje operaci / route") && contractOk;
    contractOk = check(contract, failure.failureType, "porucha: log obsahuje typ problému (zámek / timeout DB)") && contractOk;
    contractOk = check(contract, failure.outcome, "porucha: log obsahuje pozorovaný výsledek (outcome)") && contractOk;
    for (const window of outageWindows) {
      const events = window.text.split("\n").filter((line) => line.includes('"event":"technical_failure"'));
      const operations = events.map((line) => /"operation":"([^"]+)"/.exec(line)?.[1] ?? "?");
      contractOk = check(contract, events.length >= 2,
        `${window.label}: událost technical_failure pro každý selhaný požadavek (${events.length}×: ${operations.join(", ") || "žádná"})`) && contractOk;
    }
    const allLogs = `${readFileSync(log1, "utf8")}\n${await logSince(log2, 0)}`;
    const leaked = secrets.filter((secret) => secret && allLogs.includes(secret));
    contractOk = check(contract, leaked.length === 0, `logy neobsahují e-maily, poznámky, hesla, session tokeny ani jejich hash (${leaked.length} nálezů)`) && contractOk;
    contractOk = check(contract, ISO_TS.test(startupText1) && /"event"\s*:\s*"app_start"/.test(startupText1), "start: událost app_start s časem") && contractOk;
    contractOk = check(contract, /"event"\s*:\s*"app_stop"/.test(stopText) && ISO_TS.test(stopText), "stop: událost app_stop s časem") && contractOk;
    check(contract, s1.logs.trim() === "", `úspěch (S1): aplikace nic nevypsala (${s1.logs.trim() === "" ? "ano" : "ne"})`);
    check(contract, s2.logs.trim() === "", `zamítnutí (S2): aplikace nic nevypsala (${s2.logs.trim() === "" ? "ano" : "ne"})`);

    report(contract, contractOk, { journalMode, startupText1 });
    await scope.cleanup();
    process.exitCode = situations.every((situation) => situation.pass) && contractOk ? 0 : 1;
  } finally {
    if (server) {
      const stopped = await server.stop();
      note("harness", "final stop", `code=${stopped.code} signal=${stopped.signal}`);
    }
    await prisma.$disconnect();
  }
}

function report(contract: string[], contractOk: boolean, context: { journalMode: string; startupText1: string }) {
  const lines: string[] = [];
  lines.push(`# C10 trial — round ${round}`, "");
  lines.push(`- commit: ${spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).stdout?.toString().trim() || "unknown"}`);
  lines.push(`- database: ${path.relative(root, dbFile)} (journal_mode ${context.journalMode}), server ${apiUrl}`, "");
  for (const situation of situations) {
    lines.push(`## ${situation.id} — ${situation.title}: ${situation.pass ? "PASS" : "FAIL"}`, "");
    lines.push(`Expected (před během): ${situation.expected}`, "");
    lines.push(`Actual: ${situation.actual.join("; ")}`, "");
    lines.push(...situation.verified.map((item) => `- ${item}`), "");
    lines.push("Application output during the situation:", "", "```text", excerpt(situation.logs, 30), "```", "");
  }
  lines.push(`## Log contract: ${contractOk ? "PASS" : "FAIL"}`, "", ...contract.map((item) => `- ${item}`), "");
  lines.push("## Server 1 startup output", "", "```text", excerpt(context.startupText1), "```", "");
  lines.push("## Harness timeline", "", "| Time (UTC) | Situation | Action | Observation |", "|---|---|---|---|");
  for (const entry of timeline) {
    lines.push(`| ${entry.ts} | ${entry.situation} | ${entry.action.replace(/\|/g, "\\|")} | ${entry.observation.replace(/\|/g, "\\|").slice(0, 200)} |`);
  }
  writeFileSync(path.join(outDir, "report.md"), `${lines.join("\n")}\n`);
  writeFileSync(path.join(outDir, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);

  console.log("\nC10 summary");
  for (const situation of situations) console.log(`  ${situation.pass ? "PASS" : "FAIL"}  ${situation.id} ${situation.title}`);
  for (const item of contract) console.log(`  ${item}`);
  console.log(`  Log contract: ${contractOk ? "PASS" : "FAIL"}`);
  console.log(`  Report: ${path.relative(root, path.join(outDir, "report.md"))}`);
}

main().catch((error) => {
  console.error("C10 trials aborted (harness error)");
  console.error(error);
  process.exitCode = 1;
});
