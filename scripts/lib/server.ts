/**
 * Starts and stops the production Next.js server as a child process (C09 verify, C10 trials).
 *
 * The child's stdout/stderr are written unchanged to `logFile`, i.e. exactly what the
 * application itself prints; callers keep their own timeline of what they observed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

export interface StoppedServer {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface ManagedServer {
  child: ChildProcess;
  url: string;
  logFile: string;
  /** Sends SIGTERM (SIGKILL after 10 s) and resolves once the process and its log are closed. */
  stop(): Promise<StoppedServer>;
}

export interface StartOptions {
  port: string;
  env: NodeJS.ProcessEnv;
  logFile: string;
  say: (line: string) => void;
  root?: string;
  readyTimeoutSeconds?: number;
}

export async function urlAnswers(url: string): Promise<boolean> {
  try {
    await fetch(`${url}/api/agents`);
    return true;
  } catch {
    return false;
  }
}

/** Returns null (and explains why through `say`) when the server cannot be started. */
export async function startNextServer(options: StartOptions): Promise<ManagedServer | null> {
  const root = options.root ?? process.cwd();
  const url = `http://localhost:${options.port}`;
  if (await urlAnswers(url)) {
    options.say(`Something already answers on ${url}; stop it or choose another port (tests must hit this build)`);
    return null;
  }

  mkdirSync(path.dirname(options.logFile), { recursive: true });
  const log = createWriteStream(options.logFile);
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", options.port], { cwd: root, env: options.env });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });

  const closed = new Promise<StoppedServer>((resolve) => {
    child.on("close", (code, signal) => {
      log.end(() => resolve({ code, signal }));
    });
  });

  async function stop(): Promise<StoppedServer> {
    if (child.exitCode === null && child.signalCode === null) {
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 10_000);
      child.kill("SIGTERM");
      const result = await closed;
      clearTimeout(forceKill);
      return result;
    }
    return closed;
  }

  const deadline = Date.now() + (options.readyTimeoutSeconds ?? 60) * 1000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      options.say(`Server exited before it became ready; see ${path.relative(root, options.logFile)}`);
      await closed;
      return null;
    }
    try {
      const response = await fetch(`${url}/api/agents`);
      if (response.ok) {
        options.say(`Server ready at ${url} (pid ${child.pid})`);
        return { child, url, logFile: options.logFile, stop };
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  options.say(`Server did not answer GET /api/agents at ${url} in time`);
  await stop();
  return null;
}
