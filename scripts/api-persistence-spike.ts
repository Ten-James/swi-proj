import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";

const API_URL = "http://localhost:3000";

async function main() {
  // Testovací resource.
  // To je pouze fixture; samotná rezervace musí vzniknout přes API.
  const agent = await prisma.agent.create({
    data: {
      name: `C01 Test Agent ${Date.now()}`,
      description: "Agent for API persistence spike",
      isActive: true,
    },
  });

  const email = `c01-${Date.now()}@test.local`;

  const startTime = "2030-01-01T10:00:00.000Z";
  const endTime = "2030-01-01T11:00:00.000Z";
  const note = "C01 API persistence spike";

  let reservationId: string | undefined;

  try {
    // ACT - rezervaci vytváříme přes skutečné HTTP API
    const response = await fetch(`${API_URL}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "C01 Test User",
        email,
        agentId: agent.id,
        startTime,
        endTime,
        note,
      }),
    });

    assert.equal(response.status, 201);

    const body = await response.json();

    // Kontrola API response
    assert.ok(body.id, "API did not return reservation ID");
    assert.equal(body.agentId, agent.id);
    assert.equal(body.status, "CONFIRMED");

    reservationId = body.id;

    // ASSERT - načtení stejné Reservation přímo ze skutečné DB
    const stored = await prisma.reservation.findUnique({
      where: {
        id: body.id,
      },
    });

    assert.ok(stored, "Reservation returned by API does not exist in DB");

    // ID z API musí být stejné jako ID v databázi
    assert.equal(stored.id, body.id);

    assert.equal(stored.agentId, agent.id);
    assert.equal(stored.status, "CONFIRMED");
    assert.equal(stored.note, note);

    assert.equal(stored.startTime.toISOString(), startTime);
    assert.equal(stored.endTime.toISOString(), endTime);

    // Zkontrolujeme i uživatele vytvořeného API endpointem
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    assert.ok(user, "User was not persisted");
    assert.equal(stored.userId, user.id);

    console.log("C01 API persistence spike PASSED");
    console.log(`API reservation ID: ${body.id}`);
    console.log(`DB  reservation ID: ${stored.id}`);
  } finally {
    // Cleanup
    if (reservationId) {
      await prisma.reservation.deleteMany({
        where: { id: reservationId },
      });
    }

    await prisma.user.deleteMany({
      where: { email },
    });

    await prisma.agent.deleteMany({
      where: { id: agent.id },
    });
  }
}

main()
  .catch((error) => {
    console.error("C01 API persistence spike FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });