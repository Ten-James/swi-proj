import type { Instrumentation } from "next";

/** C10: process lifecycle events (app_start, app_stop) — Node.js runtime only. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * C10: unhandled errors of route handlers (e.g. a database outage while reading the Session
 * before the handler's own try/catch). Next.js prints the raw error without time or route;
 * this adds one diagnosable event. `routePath` is the route pattern, never IDs or query data.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logTechnicalFailure } = await import("./lib/ops-log");
  logTechnicalFailure(`${request.method} ${context.routePath}`, error, "HTTP 500 (unhandled by the route)");
};
