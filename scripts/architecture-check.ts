import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.join(process.cwd(), "src");
const lifecycleOwner = path.normalize(path.join(sourceRoot, "lib", "reservation-service.ts"));
// Any receiver (prisma, tx, aliases) plus raw SQL, which bypasses the model delegate.
const mutationPattern =
  /\.reservation\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(|\$executeRaw(?:Unsafe)?\b/g;

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
  const policySource = await readFile(path.join(sourceRoot, "lib", "reservation-policy.ts"), "utf8");
  assert.doesNotMatch(
    policySource,
    /^\s*import\b|\brequire\s*\(|\bimport\s*\(/m,
    "C05: reservation-policy must stay pure (no imports: no Prisma, service, HTTP or framework dependency)",
  );
  console.log("C03 architecture check PASSED");
  console.log("Rule: only src/lib/reservation-service.ts may persist Reservation lifecycle changes.");
  console.log("Rule (C05): src/lib/reservation-policy.ts has no imports (pure domain rules).");
}

main().catch((error) => {
  console.error("C03 architecture check FAILED");
  console.error(error);
  process.exit(1);
});
