/**
 * One-command build and verification pipeline (C09 step 4), used locally and by CI.
 *
 *   npm run verify
 *
 * Runs static checks and unit tests, prepares an isolated SQLite database, builds the
 * production bundle, starts `next start` as a child process and runs every HTTP + DB
 * integration suite against it. It finishes by writing the release candidate manifest.
 * Fail-fast: the first failing step stops the pipeline and the exit code is 1.
 *
 * Environment (all optional, no secrets):
 *   VERIFY_DATABASE_URL  isolated database, default file:./verify.db (deleted and recreated)
 *   VERIFY_PORT          port for the production server, default 3100
 * Logs and results are written to ./release (git-ignored).
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const port = process.env.VERIFY_PORT ?? "3100";
const databaseUrl = process.env.VERIFY_DATABASE_URL ?? "file:./verify.db";
const apiUrl = `http://localhost:${port}`;
const isGitHub = process.env.GITHUB_ACTIONS === "true";
const env = { ...process.env, DATABASE_URL: databaseUrl, API_URL: apiUrl };

mkdirSync(releaseDir, { recursive: true });
const log = createWriteStream(path.join(releaseDir, "verify.log"));

interface StepResult {
  step: string;
  command: string;
  status: "PASS" | "FAIL" | "NOT RUN";
  exitCode: number | null;
  seconds: number;
}

const results: StepResult[] = [];

function write(text: string) {
  process.stdout.write(text);
  log.write(text);
}

function group(title: string) {
  write(isGitHub ? `::group::${title}\n` : `\n=== ${title} ===\n`);
}

function endGroup() {
  if (isGitHub) write("::endgroup::\n");
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, env, shell: process.platform === "win32" });
    child.stdout.on("data", (chunk: Buffer) => write(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => write(chunk.toString()));
    child.on("error", (error) => {
      write(`${String(error)}\n`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function step(name: string, command: string, work: () => Promise<number>) {
  group(`${name} — ${command}`);
  const started = Date.now();
  const exitCode = await work();
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  results.push({ step: name, command, status: exitCode === 0 ? "PASS" : "FAIL", exitCode, seconds });
  write(`--> ${name}: ${exitCode === 0 ? "PASS" : "FAIL"} (exit ${exitCode}, ${seconds} s)\n`);
  endGroup();
  if (exitCode !== 0) throw new Error(`${name} failed`);
}

const npm = (script: string) => () => run("npm", ["run", script]);

function resetDatabase(): Promise<number> {
  if (!databaseUrl.startsWith("file:")) {
    write(`Refusing to reset non-file database ${databaseUrl}\n`);
    return Promise.resolve(1);
  }
  const file = path.resolve(root, databaseUrl.slice("file:".length));
  if (path.basename(file) === "dev.db") {
    write("Refusing to delete dev.db; set VERIFY_DATABASE_URL to an isolated file\n");
    return Promise.resolve(1);
  }
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${file}${suffix}`, { force: true });
  write(`Removed ${path.relative(root, file)} (fresh isolated database)\n`);
  return Promise.resolve(0);
}

let server: ChildProcess | null = null;

async function portAnswers(): Promise<boolean> {
  try {
    await fetch(`${apiUrl}/api/agents`);
    return true;
  } catch {
    return false;
  }
}

async function startServer(): Promise<number> {
  if (await portAnswers()) {
    write(`Something already answers on ${apiUrl}; stop it or set VERIFY_PORT (tests must hit this build)\n`);
    return 1;
  }
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const serverLog = createWriteStream(path.join(releaseDir, "server.log"));
  server = spawn(process.execPath, [nextBin, "start", "-p", port], { cwd: root, env });
  server.stdout?.pipe(serverLog);
  server.stderr?.pipe(serverLog);
  let exited = false;
  server.on("exit", () => {
    exited = true;
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (exited) {
      write("Server exited before it became ready; see release/server.log\n");
      return 1;
    }
    try {
      const response = await fetch(`${apiUrl}/api/agents`);
      if (response.ok) {
        write(`Server ready at ${apiUrl} (pid ${server.pid})\n`);
        return 0;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  write("Server did not answer GET /api/agents within 60 s\n");
  return 1;
}

function stopServer(): Promise<number> {
  const child = server;
  server = null;
  if (!child || child.exitCode !== null) return Promise.resolve(0);
  return new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(0);
    }, 10_000);
    child.on("exit", () => {
      clearTimeout(forceKill);
      resolve(0);
    });
    child.kill();
  });
}

const pipeline: Array<[string, string, () => Promise<number>]> = [
  ["lint", "npm run lint", npm("lint")],
  ["typecheck", "npm run typecheck", npm("typecheck")],
  ["unit tests (C05 + BR-07)", "npm run test:c05", npm("test:c05")],
  ["architecture rule (C03/C05)", "npm run test:architecture", npm("test:architecture")],
  ["reset isolated database", `rm ${databaseUrl}`, resetDatabase],
  ["apply migrations", "npm run db:deploy", npm("db:deploy")],
  ["seed", "npm run db:seed", npm("db:seed")],
  ["production build", "npm run build", npm("build")],
  ["start production server", `next start -p ${port}`, startServer],
  ["API persistence spike (C01)", "npm run test:api-persistence", npm("test:api-persistence")],
  ["behaviour verification (C02)", "npm run test:c02", npm("test:c02")],
  ["baseline regression TC-C08-01/02", "npm run test:c08", npm("test:c08")],
  ["CR-08 acceptance TC-CR08-01..06", "npm run test:cr08", npm("test:cr08")],
  ["stop production server", "kill", stopServer],
];

function currentCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

function currentBuildId() {
  const file = path.join(root, ".next", "BUILD_ID");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

function saveResults(verdict: "PASS" | "FAIL") {
  const done = new Set(results.map((result) => result.step));
  const all = [
    ...results,
    ...pipeline
      .filter(([name]) => !done.has(name))
      .map(([name, command]): StepResult => ({ step: name, command, status: "NOT RUN", exitCode: null, seconds: 0 })),
  ];
  writeFileSync(
    path.join(releaseDir, "verify-results.json"),
    `${JSON.stringify({ verdict, commit: currentCommit(), buildId: currentBuildId(), finishedAt: new Date().toISOString(), databaseUrl, apiUrl, steps: all }, null, 2)}\n`,
  );
  return all;
}

async function main() {
  write(`verify: DATABASE_URL=${databaseUrl} API_URL=${apiUrl} node=${process.version}\n`);
  let verdict: "PASS" | "FAIL" = "PASS";
  try {
    for (const [name, command, work] of pipeline) await step(name, command, work);
  } catch (error) {
    verdict = "FAIL";
    write(`\n${String(error)}\n`);
    await stopServer();
  }

  const all = saveResults(verdict);
  if (verdict === "PASS") {
    group("release candidate manifest — npm run release:manifest");
    const code = await run("npm", ["run", "release:manifest"]);
    endGroup();
    if (code !== 0) verdict = "FAIL";
  }

  write("\nSummary\n");
  for (const result of all) {
    write(`  ${result.status.padEnd(7)} ${result.step} (${result.command}${result.exitCode === null ? "" : `, exit ${result.exitCode}`}, ${result.seconds} s)\n`);
  }
  write(`\nverify ${verdict}\n`);
  if (!existsSync(path.join(releaseDir, "manifest.json")) && verdict === "PASS") write("warning: manifest missing\n");
  log.end();
  process.exitCode = verdict === "PASS" ? 0 : 1;
}

main();
