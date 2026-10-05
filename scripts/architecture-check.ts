import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.join(process.cwd(), "src");
const lifecycleOwner = path.normalize(path.join(sourceRoot, "lib", "reservation-service.ts"));
const mutationPattern = /\b(?:prisma|tx)\.reservation\.(?:create|update|updateMany|delete|deleteMany|upsert)\s*\(/g;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== "generated")
      .map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(fullPath);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
      }),
  );
  return nested.flat();
}

async function main() {
  const violations: string[] = [];
  for (const file of await sourceFiles(sourceRoot)) {
    if (path.normalize(file) === lifecycleOwner) continue;
    const source = await readFile(file, "utf8");
    if (mutationPattern.test(source)) {
      violations.push(path.relative(process.cwd(), file));
    }
    mutationPattern.lastIndex = 0;
  }

  assert.deepEqual(
    violations,
    [],
    `Reservation lifecycle mutation found outside its owner: ${violations.join(", ")}`,
  );

  const ownerSource = await readFile(lifecycleOwner, "utf8");
  assert.match(ownerSource, /prisma\.\$transaction\s*\(/, "Lifecycle owner must enforce transaction boundaries");
  console.log("C03 architecture check PASSED");
  console.log("Rule: only src/lib/reservation-service.ts may persist Reservation lifecycle changes.");
}

main().catch((error) => {
  console.error("C03 architecture check FAILED");
  console.error(error);
  process.exit(1);
});
