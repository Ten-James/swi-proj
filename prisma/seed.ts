import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const presetAgents = [
  {
    name: "Claude Sonnet 5",
    description: "General-purpose coding and reasoning agent.",
    capacity: 4,
  },
  {
    name: "Claude Opus 5",
    description: "High-capability agent for complex, long-running tasks.",
    capacity: 2,
  },
  {
    name: "Vision Analyst",
    description: "Specializes in image and document analysis.",
    capacity: 3,
  },
  {
    name: "Data Pipeline Bot",
    description: "Runs scheduled data-processing jobs.",
    capacity: 1,
  },
];

async function main() {
  for (const agent of presetAgents) {
    await prisma.agent.upsert({
      where: { name: agent.name },
      update: {},
      create: agent,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
