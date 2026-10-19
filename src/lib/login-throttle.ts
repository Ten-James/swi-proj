/**
 * In-memory limit of failed logins per email. Valid only for the single-process
 * deployment accepted in ADR-001; a multi-instance runtime needs a shared store.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 10_000;

const failures = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key);
  }
  // Still full: drop the oldest entries (Map keeps insertion order) to bound memory.
  for (const key of failures.keys()) {
    if (failures.size < MAX_TRACKED) break;
    failures.delete(key);
  }
}

/**
 * Counts the attempt before the password is checked, so a burst of parallel
 * requests cannot all pass the limit while scrypt is running. Returns seconds
 * until the next attempt is allowed, or 0 when this attempt may proceed.
 * A successful login must call {@link clearLoginFailures}.
 */
export function beginLoginAttempt(email: string, now = Date.now()): number {
  const entry = failures.get(email);
  if (entry && entry.resetAt > now) {
    if (entry.count >= MAX_FAILURES) return Math.ceil((entry.resetAt - now) / 1000);
    entry.count += 1;
    return 0;
  }
  if (failures.size >= MAX_TRACKED) prune(now);
  failures.set(email, { count: 1, resetAt: now + WINDOW_MS });
  return 0;
}

export function clearLoginFailures(email: string) {
  failures.delete(email);
}
