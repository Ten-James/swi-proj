import { version } from "../package.json";
import { opsLog } from "./lib/ops-log";

/**
 * Node.js-only part of the C10 lifecycle events (imported from instrumentation.ts when
 * NEXT_RUNTIME is "nodejs"). Next.js prints only "✓ Ready" (no time, no version) on start
 * and nothing on stop; an operator needs both to bound an outage or a restart.
 */
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
opsLog("info", "app_start", {
  version,
  pid: process.pid,
  node: process.version,
  // A file path is not secret; any other URL could carry credentials and is not printed.
  database: databaseUrl.startsWith("file:") ? databaseUrl : "<non-file DATABASE_URL>",
});
// Next.js ends the process with process.exit (143 after SIGTERM, 130 after SIGINT).
process.once("exit", (code) => opsLog("info", "app_stop", { pid: process.pid, exitCode: code }));
