/**
 * Release candidate manifest (C09 step 6): identity of the built product, not only the commit.
 *
 *   npm run release:manifest        (after `npm run build`; `npm run verify` calls it)
 *
 * Writes release/manifest.json with: product version, git commit / dirty flag / tags,
 * runtime, sha256 of the dependency lock and DB schema, every migration with its hash,
 * the Next.js BUILD_ID and a digest of the build output (.next without cache/trace),
 * names of the non-secret configuration and the results of the last verify run.
 * A Next.js build is not bit-reproducible across machines; the digest identifies this
 * concrete build artefact (CI uploads exactly these files next to the manifest).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const buildDir = path.join(root, ".next");
// node_modules holds symlinks to native packages that CI does not upload as part of the artefact.
const EXCLUDED_BUILD_ENTRIES = new Set(["cache", "trace", "trace-build", "diagnostics", "node_modules"]);

function sha256(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

function fileHash(relative: string) {
  const full = path.join(root, relative);
  return existsSync(full) ? sha256(readFileSync(full)) : null;
}

function git(args: string) {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

function buildFiles(directory: string, prefix = ""): string[] {
  const entries = readdirSync(directory).sort();
  const files: string[] = [];
  for (const entry of entries) {
    if (!prefix && EXCLUDED_BUILD_ENTRIES.has(entry)) continue;
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const full = path.join(directory, entry);
    const stat = lstatSync(full);
    if (stat.isDirectory()) files.push(...buildFiles(full, relative));
    else files.push(relative);
  }
  return files;
}

function buildIdentity() {
  if (!existsSync(path.join(buildDir, "BUILD_ID"))) return null;
  const files = buildFiles(buildDir);
  let bytes = 0;
  const lines = files.map((relative) => {
    const full = path.join(buildDir, relative);
    const stat = lstatSync(full);
    const content = stat.isSymbolicLink() ? Buffer.from(`symlink:${readlinkSync(full)}`) : readFileSync(full);
    bytes += content.length;
    return `${sha256(content)}  ${relative}`;
  });
  return {
    buildId: readFileSync(path.join(buildDir, "BUILD_ID"), "utf8").trim(),
    digest: sha256(lines.join("\n")),
    digestScope: ".next/** excluding cache, trace, trace-build, diagnostics, node_modules (links to installed packages)",
    files: files.length,
    bytes,
  };
}

function migrations() {
  const directory = path.join(root, "prisma", "migrations");
  return readdirSync(directory)
    .filter((entry) => lstatSync(path.join(directory, entry)).isDirectory())
    .sort()
    .map((name) => ({ name, sha256: fileHash(path.join("prisma", "migrations", name, "migration.sql")) }));
}

function npmVersion() {
  try {
    return execSync("npm --version", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

function configuration() {
  const databaseUrl = process.env.DATABASE_URL;
  return {
    DATABASE_URL: databaseUrl?.startsWith("file:") ? databaseUrl : databaseUrl ? "<set, not recorded>" : "unset (default file:./dev.db)",
    API_URL: process.env.API_URL ?? "unset (tests default to http://localhost:3000)",
    NODE_ENV: process.env.NODE_ENV ?? "unset (next start runs production)",
    secrets: "none required; demo Admin credentials come from prisma/seed.ts and are documented in README",
  };
}

/** Embeds the last verify run only when it belongs to this commit and this build. */
function lastVerify(commit: string | null, buildId: string | null) {
  const file = path.join(releaseDir, "verify-results.json");
  if (!existsSync(file)) return null;
  const results = JSON.parse(readFileSync(file, "utf8")) as { commit?: string | null; buildId?: string | null; verdict?: string };
  if (results.commit !== commit || results.buildId !== buildId) {
    return { verdict: "STALE", reason: `results belong to commit ${results.commit ?? "?"} / build ${results.buildId ?? "?"}` };
  }
  return results;
}

function main() {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { name: string; version: string };
  const status = git("status --porcelain --untracked-files=no");
  const migrationList = migrations();
  const commit = git("rev-parse HEAD");
  const build = buildIdentity();
  const manifest = {
    product: pkg.name,
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    source: {
      commit,
      dirty: status === null ? null : status.length > 0,
      tags: git("tag --points-at HEAD")?.split("\n").filter(Boolean) ?? [],
      branch: git("rev-parse --abbrev-ref HEAD"),
    },
    runtime: {
      node: process.version,
      npm: npmVersion(),
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      ci: process.env.GITHUB_ACTIONS === "true"
        ? { provider: "github-actions", runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, ref: process.env.GITHUB_REF }
        : null,
    },
    dependencies: { lockfile: "package-lock.json", sha256: fileHash("package-lock.json"), install: "npm ci" },
    database: {
      provider: "sqlite (@prisma/adapter-better-sqlite3)",
      schemaSha256: fileHash(path.join("prisma", "schema.prisma")),
      latestMigration: migrationList.at(-1)?.name ?? null,
      migrations: migrationList,
      apply: "npm run db:deploy",
    },
    configuration: configuration(),
    build,
    verification: lastVerify(commit, build?.buildId ?? null),
  };

  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Release manifest written to release/manifest.json`);
  console.log(`  ${manifest.product}@${manifest.version} commit ${manifest.source.commit}${manifest.source.dirty ? " (dirty)" : ""}`);
  console.log(`  tags: ${manifest.source.tags.join(", ") || "-"}`);
  console.log(`  lock sha256 ${manifest.dependencies.sha256}`);
  console.log(`  schema sha256 ${manifest.database.schemaSha256}, latest migration ${manifest.database.latestMigration}`);
  console.log(manifest.build
    ? `  build ${manifest.build.buildId}, digest ${manifest.build.digest} (${manifest.build.files} files)`
    : "  build: missing (.next/BUILD_ID not found — run npm run build)");
  console.log(`  verify: ${manifest.verification?.verdict ?? "not run"}`);
  if (!manifest.build) process.exitCode = 1;
}

main();
