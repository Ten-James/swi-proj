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
