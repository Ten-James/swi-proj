/**
 * Independent persisted-state oracle for C08/C09 test cases.
 *
 * Reads committed rows with plain SQL over the test process's own database
 * connection (the application server runs in a different process), so a passing
 * check never depends on the application's response or on its domain code.
 * The overlap condition is written out here again on purpose instead of calling
 * `reservation-policy.ts`: the oracle must not share the implementation under test.
 */
import { prisma } from "../../src/lib/prisma";

export interface StoredReservation {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date;
}

interface RawRow {
  id: string;
  status: string;
  startTime: Date | string;
  endTime: Date | string;
}

function toStored(row: RawRow): StoredReservation {
  return {
    id: row.id,
    status: row.status,
    startTime: new Date(row.startTime),
    endTime: new Date(row.endTime),
  };
}

export async function readReservation(id: string): Promise<StoredReservation | null> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT id, status, startTime, endTime FROM Reservation WHERE id = ${id}`;
  return rows[0] ? toStored(rows[0]) : null;
}

export async function readAgentReservations(agentId: string): Promise<StoredReservation[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT id, status, startTime, endTime FROM Reservation
    WHERE agentId = ${agentId} ORDER BY startTime`;
  return rows.map(toStored);
}

/** BR-02 oracle (C04 QC-04): pairs of CONFIRMED rows of one Agent with a.start < b.end and b.start < a.end. */
export async function confirmedOverlapPairs(agentId: string): Promise<Array<[string, string]>> {
  const confirmed = (await readAgentReservations(agentId)).filter((row) => row.status === "CONFIRMED");
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < confirmed.length; i += 1) {
    for (let j = i + 1; j < confirmed.length; j += 1) {
      const a = confirmed[i];
      const b = confirmed[j];
      if (a.startTime.getTime() < b.endTime.getTime() && b.startTime.getTime() < a.endTime.getTime()) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs;
}

export function describe(row: StoredReservation | null | undefined) {
  if (!row) return "no row";
  return `${row.status} [${row.startTime.toISOString()}, ${row.endTime.toISOString()})`;
}
