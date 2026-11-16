/**
 * Minimal operational log (C10): one JSON line per event, only for events an operator
 * needs to reconstruct what happened — technical failures and process start/stop.
 * Successful operations and ordinary business rejections (e.g. 409 AGENT_UNAVAILABLE)
 * are deliberately not logged: the HTTP response and the persisted state are their record.
 *
 * Never log request bodies, error messages of the data layer (they may echo query
 * arguments), e-mail addresses, notes, passwords, session tokens or their hashes.
 */
export type OpsEvent = "technical_failure" | "app_start" | "app_stop";

type Field = string | number | boolean | null | undefined;

export function opsLog(level: "info" | "error", event: OpsEvent, fields: Record<string, Field>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

interface PrismaLikeError {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  meta?: {
    modelName?: unknown;
    driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } };
  };
}

const asText = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Diagnostic classification of an error without its free-text message. */
export function failureFields(error: unknown): Record<string, Field> {
  const candidate = (typeof error === "object" && error !== null ? error : {}) as PrismaLikeError;
  const name = asText(candidate.name) ?? typeof error;
  const message = asText(candidate.message) ?? "";
  const cause = candidate.meta?.driverAdapterError?.cause;
  const isDataLayer = name.startsWith("PrismaClient") || cause !== undefined;
  return {
    errorType: name,
    errorCode: asText(candidate.code),
    // e.g. "session.findUnique" — taken from Prisma's "Invalid `prisma.x.y()` invocation" header only.
    dbCall: /prisma\.([\w$]+\.\w+)\(\)/.exec(message)?.[1],
    dbModel: asText(candidate.meta?.modelName),
    driverError: [asText(cause?.originalCode), asText(cause?.kind)].filter(Boolean).join("/") || undefined,
    // Programming errors (TypeError, …) keep a short first line; data-layer messages are never logged.
    detail: isDataLayer ? undefined : message.split("\n", 1)[0].slice(0, 200) || undefined,
  };
}

export function logTechnicalFailure(operation: string, error: unknown, outcome: string) {
  opsLog("error", "technical_failure", { component: "api", operation, ...failureFields(error), outcome });
}
