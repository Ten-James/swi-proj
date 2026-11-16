/**
 * C08 stepwise regression test cases TC-C08-01 and TC-C08-02.
 *
 * Test basis: Specification v0.2.1 — BR-01 (half-open [start, end)), BR-02 (no two
 * overlapping CONFIRMED Reservations of one Agent), OP-01 / REQ-01..REQ-03.
 * Expected values below were written from that specification before the first run
 * (docs/evidence-and-evolution.md, section C08). The oracle reads committed state
 * through scripts/lib/db-oracle.ts, never through the application response alone.
 *
 * Requires a running application (`npm run build && npm start`) on API_URL and the
 * same DATABASE_URL as the server, prepared with `npm run db:deploy && npm run db:seed`.
 */
import { confirmedOverlapPairs, describe, readAgentReservations, readReservation } from "./lib/db-oracle";
import { disconnect, fixtureScope, runHeader, step, testCase, type StepRecord } from "./lib/e2e";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2035, 2, 12, hour, minute)).toISOString();

const B1 = { startTime: at(10), endTime: at(11) };
const ADJACENT_B2 = { startTime: at(11), endTime: at(12) };
const OVERLAPPING_B2 = { startTime: at(10, 30), endTime: at(11, 30) };

async function main() {
  runHeader("C08 baseline regression test cases (TC-C08-01, TC-C08-02)");
  const scope = fixtureScope("c08");
  const results: Array<{ id: string; verdict: string }> = [];

  try {
    const owner = await scope.user("owner-b1");
    const requester = await scope.user("requester-b2");

    results.push(
      await testCase("TC-C08-01", "positive adjacent Create keeps BR-02", async (records: StepRecord[]) => {
        const r1 = await scope.agent("R1 adjacent");
        for (const round of [1, 2]) {
          const tag = round === 1 ? "" : " (repeat after reset)";
          await scope.resetReservations();
          const b1 = await scope.existingReservation({ userId: owner.id, agentId: r1.id, ...B1, status: "CONFIRMED" });
          step(records, `1${tag} reset and prepare R1 with B1 CONFIRMED [10:00,11:00)`,
            "fixture committed", `B1 id ${b1.id}`, true);

          const initial = await readAgentReservations(r1.id);
          step(records, `2${tag} independently read stored rows of R1`,
            "exactly 1 row: CONFIRMED [10:00,11:00), no overlapping CONFIRMED pair",
            initial.map(describe).join("; ") || "no rows",
            initial.length === 1 && initial[0].status === "CONFIRMED"
              && initial[0].startTime.toISOString() === B1.startTime && initial[0].endTime.toISOString() === B1.endTime);

          const created = await scope.createReservation(requester.cookie, { agentId: r1.id, ...ADJACENT_B2 });
          step(records, `3${tag} POST /api/reservations B2 [11:00,12:00) as another User`,
            "201, status CONFIRMED (adjacent half-open intervals do not overlap)",
            `${created.status} ${JSON.stringify(created.body)}`,
            created.status === 201 && created.body.status === "CONFIRMED");

          const after = await readAgentReservations(r1.id);
          const b2 = await readReservation(String(created.body.id));
          const pairs = await confirmedOverlapPairs(r1.id);
          step(records, `4${tag} read committed state of R1 in the test process`,
            "2 rows, both CONFIRMED: [10:00,11:00) and [11:00,12:00); stored B2 = returned id; 0 overlapping CONFIRMED pairs",
            `${after.map(describe).join("; ")}; B2=${describe(b2)}; overlapPairs=${pairs.length}`,
            after.length === 2 && after.every((row) => row.status === "CONFIRMED") && b2?.status === "CONFIRMED"
              && b2.startTime.toISOString() === ADJACENT_B2.startTime && pairs.length === 0);
        }
        await scope.resetReservations();
        const cleared = await readAgentReservations(r1.id);
        step(records, "5 reset test data", "R1 has no rows; the case can be repeated with the same inputs",
          `${cleared.length} rows`, cleared.length === 0);
      }),
    );

    results.push(
      await testCase("TC-C08-02", "negative overlapping Create is rejected (BR-02)", async (records: StepRecord[]) => {
        const r1 = await scope.agent("R1 overlap");
        for (const round of [1, 2]) {
          const tag = round === 1 ? "" : " (repeat after reset)";
          await scope.resetReservations();
          const b1 = await scope.existingReservation({ userId: owner.id, agentId: r1.id, ...B1, status: "CONFIRMED" });
          step(records, `1${tag} reset and prepare R1 with B1 CONFIRMED [10:00,11:00)`,
            "fixture committed", `B1 id ${b1.id}`, true);

          const initial = await readAgentReservations(r1.id);
          step(records, `2${tag} independently read initial stored state`,
            "exactly 1 row: B1 CONFIRMED [10:00,11:00)",
            initial.map(describe).join("; ") || "no rows",
            initial.length === 1 && initial[0].id === b1.id && initial[0].status === "CONFIRMED");

          const created = await scope.createReservation(requester.cookie, { agentId: r1.id, ...OVERLAPPING_B2 });
          step(records, `3${tag} POST /api/reservations B2 [10:30,11:30) as another User`,
            "409 with code AGENT_UNAVAILABLE; no Reservation id returned",
            `${created.status} ${JSON.stringify(created.body)}`,
            created.status === 409 && created.body.code === "AGENT_UNAVAILABLE" && created.body.id === undefined);

          const after = await readAgentReservations(r1.id);
          const storedB1 = await readReservation(b1.id);
          const pairs = await confirmedOverlapPairs(r1.id);
          step(records, `4${tag} read committed state after the rejected request`,
            "B1 unchanged CONFIRMED [10:00,11:00); R1 still has exactly 1 row (B2 not persisted); 0 overlapping CONFIRMED pairs",
            `B1=${describe(storedB1)}; rows=${after.length}; overlapPairs=${pairs.length}`,
            storedB1?.status === "CONFIRMED" && storedB1.startTime.toISOString() === B1.startTime
              && storedB1.endTime.toISOString() === B1.endTime && after.length === 1 && pairs.length === 0);
        }
        await scope.resetReservations();
        const cleared = await readAgentReservations(r1.id);
        step(records, "5 reset test data", "R1 has no rows; the outcome is reproducible",
          `${cleared.length} rows`, cleared.length === 0);
      }),
    );
  } finally {
    await scope.cleanup();
  }

  console.log("\nSummary");
  for (const result of results) console.log(`  ${result.id}: ${result.verdict}`);
  const failed = results.length !== 2 || results.some((result) => result.verdict !== "PASS");
  console.log(failed ? "\nC08 baseline regression FAILED" : "\nC08 baseline regression PASSED");
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("\nC08 baseline regression FAILED (harness error)");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnect);
