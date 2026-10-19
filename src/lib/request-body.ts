export type JsonObject = Record<string, unknown>;

/** Parses a JSON object body; invalid JSON and non-object payloads (null, arrays, scalars) yield null. */
export async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as JsonObject)
      : null;
  } catch {
    return null;
  }
}

/** Returns the field when it is a string; any other type is treated as missing. */
export function optionalString(body: JsonObject, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

export const INVALID_RANGE =
  "Invalid time range: use ISO 8601 instants with an offset or Z and startTime < endTime";

/** BR-01: instants must be ISO 8601 with an explicit offset or `Z`; local times are ambiguous. */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(value: string | null | undefined): Date | null {
  const match = value ? ISO_INSTANT.exec(value) : null;
  if (!value || !match) return null;
  // Date would silently roll 2030-02-31 over to March and 24:00 to the next day.
  const [year, month, day, hour] = match.slice(1, 5).map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parses a `[startTime, endTime)` pair; null unless both instants are valid and start < end. */
export function parseInterval(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): { startTime: Date; endTime: Date } | null {
  const start = parseInstant(startTime);
  const end = parseInstant(endTime);
  return start && end && start < end ? { startTime: start, endTime: end } : null;
}
