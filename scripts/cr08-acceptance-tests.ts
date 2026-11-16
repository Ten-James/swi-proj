/**
 * C09 acceptance test cases TC-CR08-01 … 06 for CR-08 (BR-07 / REQ-13, Specification v0.3).
 *
 * Test basis: docs/intent-and-change.md (C08 / CR-08, AC-01 … AC-07) and
 * docs/specification.md (BR-07). Expected values come from that accepted contract and
 * were written before the implementation; this script was first executed against the
 * unchanged code and failed there (docs/evidence-and-evolution.md, section C09).
 * TC-CR08-07 (AC-04, BR-02 regression) is `npm run test:c08`, run in the same pipeline.
 *
 * Integration boundary: HTTP → Next.js Route Handler → Reservation Service → SQLite.
 * Every case reads committed rows independently through scripts/lib/db-oracle.ts.
 * Requires a running application on API_URL with the same DATABASE_URL.
 */
import { describe, readAgentReservations, readReservation } from "./lib/db-oracle";
import { disconnect, fixtureScope, runHeader, step, testCase, type StepRecord } from "./lib/e2e";

const day = (hour: number, minute = 0, second = 0, ms = 0) =>
  new Date(Date.UTC(2035, 2, 20, hour, minute, second, ms)).toISOString();

function isRejected(result: { status: number; body: Record<string, unknown> }, code: string) {
  return result.status === 400 && result.body.code === code && result.body.id === undefined;
}

function show(result: { status: number; body: Record<string, unknown> }) {
  return `${result.status} ${JSON.stringify(result.body)}`;
}

async function main() {
  runHeader("C09 CR-08 acceptance test cases (TC-CR08-01 … 06)");
  const scope = fixtureScope("cr08");
  const results: Array<{ id: string; verdict: string }> = [];

  try {
    const alice = await scope.user("alice");
    const bob = await scope.user("bob");
    const carol = await scope.user("carol");

    results.push(
      await testCase("TC-CR08-01", "AC-01 / AC-03: aligned interval and exactly 4 h are created", async (records: StepRecord[]) => {
        const agent = await scope.agent("A1 aligned");
        const before = await readAgentReservations(agent.id);
        step(records, "1 independently read rows of A1", "0 rows", `${before.length} rows`, before.length === 0);

        const hour = await scope.createReservation(alice.cookie, { agentId: agent.id, startTime: day(10), endTime: day(11) });
        step(records, "2 POST [10:00,11:00) as alice", "201, status CONFIRMED", show(hour),
          hour.status === 201 && hour.body.status === "CONFIRMED");

        const four = await scope.createReservation(bob.cookie, { agentId: agent.id, startTime: day(12), endTime: day(16) });
        step(records, "3 POST [12:00,16:00) (exactly 4 h) as bob", "201, status CONFIRMED", show(four),
          four.status === 201 && four.body.status === "CONFIRMED");

        const rows = await readAgentReservations(agent.id);
        const expected = [`CONFIRMED [${day(10)}, ${day(11)})`, `CONFIRMED [${day(12)}, ${day(16)})`];
        step(records, "4 read committed rows of A1", expected.join("; "), rows.map(describe).join("; "),
          rows.map(describe).join("; ") === expected.join("; "));
      }),
    );

    results.push(
      await testCase("TC-CR08-02", "AC-02: unaligned minute / second / millisecond is rejected, nothing stored", async (records: StepRecord[]) => {
        const agent = await scope.agent("A2 unaligned");
        const attempts: Array<[string, string, string]> = [
          ["2 POST [10:07,10:52)", day(10, 7), day(10, 52)],
          ["3 POST [10:00:30,11:00)", day(10, 0, 30), day(11)],
          ["4 POST [10:00:00.001,11:00)", day(10, 0, 0, 1), day(11)],
        ];
        const before = await readAgentReservations(agent.id);
        step(records, "1 independently read rows of A2", "0 rows", `${before.length} rows`, before.length === 0);
        for (const [name, startTime, endTime] of attempts) {
          const result = await scope.createReservation(alice.cookie, { agentId: agent.id, startTime, endTime });
          step(records, name, "400, code NOT_SLOT_ALIGNED, no id", show(result), isRejected(result, "NOT_SLOT_ALIGNED"));
        }
        const after = await readAgentReservations(agent.id);
        step(records, "5 read committed rows of A2", "0 rows (nothing persisted)", `${after.length} rows`, after.length === 0);
      }),
    );

    results.push(
      await testCase("TC-CR08-03", "AC-03: longer than 4 h is rejected, nothing stored", async (records: StepRecord[]) => {
        const agent = await scope.agent("A3 duration");
        const over = await scope.createReservation(alice.cookie, { agentId: agent.id, startTime: day(12), endTime: day(16, 15) });
        step(records, "1 POST [12:00,16:15) (4 h 15 min)", "400, code DURATION_EXCEEDED, no id", show(over),
          isRejected(over, "DURATION_EXCEEDED"));

        const block = await scope.createReservation(alice.cookie, {
          agentId: agent.id,
          startTime: "2035-03-21T00:00:00Z",
          endTime: "2035-03-24T00:00:00Z",
        });
        step(records, "2 POST [2035-03-21T00:00Z, 2035-03-24T00:00Z) (72 h)", "400, code DURATION_EXCEEDED, no id",
          show(block), isRejected(block, "DURATION_EXCEEDED"));

        const after = await readAgentReservations(agent.id);
        step(records, "3 read committed rows of A3", "0 rows", `${after.length} rows`, after.length === 0);
      }),
    );

    results.push(
      await testCase("TC-CR08-04", "AC-05: alignment is judged on the instant, offsets included", async (records: StepRecord[]) => {
        const agent = await scope.agent("A4 offsets");
        const nepal = await scope.createReservation(carol.cookie, {
          agentId: agent.id,
          startTime: "2035-03-20T19:45:00+05:45",
          endTime: "2035-03-20T20:45:00+05:45",
        });
        step(records, "1 POST [19:45+05:45, 20:45+05:45)", "201, status CONFIRMED", show(nepal),
          nepal.status === 201 && nepal.body.status === "CONFIRMED");

        const stored = await readReservation(String(nepal.body.id));
        step(records, "2 read the stored row", `CONFIRMED [${day(14)}, ${day(15)})`, describe(stored),
          describe(stored) === `CONFIRMED [${day(14)}, ${day(15)})`);

        const cet = await scope.createReservation(carol.cookie, {
          agentId: agent.id,
          startTime: "2035-03-20T17:07:00+01:00",
          endTime: "2035-03-20T18:00:00+01:00",
        });
        step(records, "3 POST [17:07+01:00, 18:00+01:00)", "400, code NOT_SLOT_ALIGNED, no id", show(cet),
          isRejected(cet, "NOT_SLOT_ALIGNED"));

        const after = await readAgentReservations(agent.id);
        step(records, "4 read committed rows of A4", "exactly 1 row (the +05:45 Reservation)", `${after.length} rows`,
          after.length === 1);
      }),
    );

    results.push(
      await testCase("TC-CR08-05", "AC-06: Reservations stored before v0.3 stay approvable and cancellable", async (records: StepRecord[]) => {
        const approvalAgent = await scope.agent("A5 approval", { requiresApproval: true });
        const immediateAgent = await scope.agent("A5 immediate");
        const legacyPending = await scope.existingReservation({
          userId: alice.id, agentId: approvalAgent.id, startTime: day(10, 7), endTime: day(10, 52), status: "PENDING_APPROVAL",
        });
        const legacyBlock = await scope.existingReservation({
          userId: bob.id, agentId: immediateAgent.id,
          startTime: "2035-03-21T00:00:00.000Z", endTime: "2035-03-24T00:00:00.000Z", status: "CONFIRMED",
        });
        const initial = [await readReservation(legacyPending.id), await readReservation(legacyBlock.id)];
        step(records, "1 fixture: pre-v0.3 rows written directly, then read independently",
          `PENDING_APPROVAL [${day(10, 7)}, ${day(10, 52)}); CONFIRMED [2035-03-21T00:00:00.000Z, 2035-03-24T00:00:00.000Z)`,
          initial.map(describe).join("; "),
          initial[0]?.status === "PENDING_APPROVAL" && initial[1]?.status === "CONFIRMED");

        const approved = await scope.decide(legacyPending.id, "APPROVE", await scope.admin());
        step(records, "2 Admin PATCH decision APPROVE on the unaligned pending row", "200, status CONFIRMED",
          show(approved), approved.status === 200 && approved.body.status === "CONFIRMED");

        const afterApprove = await readReservation(legacyPending.id);
        step(records, "3 read the approved row", `CONFIRMED [${day(10, 7)}, ${day(10, 52)}) (interval unchanged)`,
          describe(afterApprove), describe(afterApprove) === `CONFIRMED [${day(10, 7)}, ${day(10, 52)})`);

        const cancelled = await scope.cancel(legacyBlock.id, bob.cookie);
        step(records, "4 owner PATCH cancel on the 72 h CONFIRMED row", "200, status CANCELLED", show(cancelled),
          cancelled.status === 200 && cancelled.body.status === "CANCELLED");

        const afterCancel = await readReservation(legacyBlock.id);
        step(records, "5 read the cancelled row", "CANCELLED [2035-03-21T00:00:00.000Z, 2035-03-24T00:00:00.000Z)",
          describe(afterCancel), describe(afterCancel) === "CANCELLED [2035-03-21T00:00:00.000Z, 2035-03-24T00:00:00.000Z)");
      }),
    );

    results.push(
      await testCase("TC-CR08-06", "AC-07: rule order BR-06 → BR-07 → BR-05", async (records: StepRecord[]) => {
        const active = await scope.agent("A6 active");
        const inactive = await scope.agent("A6 inactive", { isActive: false });

        const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
        past.setUTCMinutes(7, 0, 0);
        const pastResult = await scope.createReservation(carol.cookie, {
          agentId: active.id,
          startTime: past.toISOString(),
          endTime: new Date(past.getTime() + 30 * 60 * 1000).toISOString(),
        });
        step(records, `1 POST past and unaligned [${past.toISOString()}, +30 min)`, "400, code START_IN_PAST (BR-06 first)",
          show(pastResult), isRejected(pastResult, "START_IN_PAST"));

        const unalignedInactive = await scope.createReservation(carol.cookie, {
          agentId: inactive.id, startTime: day(10, 7), endTime: day(11),
        });
        step(records, "2 POST unaligned [10:07,11:00) on an inactive Agent", "400, code NOT_SLOT_ALIGNED (not 404)",
          show(unalignedInactive), isRejected(unalignedInactive, "NOT_SLOT_ALIGNED"));

        const alignedInactive = await scope.createReservation(carol.cookie, {
          agentId: inactive.id, startTime: day(10), endTime: day(11),
        });
        step(records, "3 control: aligned [10:00,11:00) on the inactive Agent", "404 (BR-05 still applies after BR-07)",
          show(alignedInactive), alignedInactive.status === 404);

        const rows = [...(await readAgentReservations(active.id)), ...(await readAgentReservations(inactive.id))];
        step(records, "4 read committed rows of both Agents", "0 rows", `${rows.length} rows`, rows.length === 0);
      }),
    );
  } finally {
    await scope.cleanup();
  }

  console.log("\nSummary");
  for (const result of results) console.log(`  ${result.id}: ${result.verdict}`);
  console.log("  TC-CR08-07 (AC-04, BR-02 regression): run `npm run test:c08` in the same pipeline");
  const failed = results.length !== 6 || results.some((result) => result.verdict !== "PASS");
  console.log(failed ? "\nCR-08 acceptance FAILED" : "\nCR-08 acceptance PASSED");
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("\nCR-08 acceptance FAILED (harness error)");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnect);
