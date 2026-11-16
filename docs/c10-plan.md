# C10 — implementation plan (operational situations and logs)

Plan for a later Claude session. Analysis was done on `main` @ `61b4b4c`
(2026-11-16). Nothing in this plan has been executed yet; items marked
**HYPOTHESIS** were derived from reading code and must be confirmed by running.

Assignment summary: on a local, isolated instance exercise four situations
(successful confirm, rejected collision, technical fault + recovery, restart),
decide what deserves a log record, add the minimum missing logging, and append
one short record to `docs/evidence-and-evolution.md`.

## 1. What the code does today

| Area | Finding | Where |
|---|---|---|
| Logging | The only application log is a bare `console.error(error)` for unexpected errors. No timestamp, no operation name, no component, no outcome. | `src/lib/api-error-response.ts:25` |
| Domain rejections | `ApiError` and `ReservationRuleViolation` are turned into 4xx responses and are not logged at all. | `src/lib/api-error-response.ts:16-24` |
| Auth lookup outside `try` | `getCurrentUser()` queries the DB before the `try` block. A DB failure there never reaches `apiErrorResponse`. | `src/app/api/reservations/route.ts:14`, `src/app/api/reservations/[id]/decision/route.ts:11` (check the other 9 route files too) |
| Unguarded GET | `GET /api/reservations` has no `try/catch` at all. | `src/app/api/reservations/route.ts:9-11` |
| Start / stop | No `instrumentation.ts`, no signal handlers. Only Next.js's own startup banner exists. | `src/` |
| Persistence | SQLite file through `@prisma/adapter-better-sqlite3`; path from `DATABASE_URL`, default `file:./dev.db`. One Node.js process (ADR-001). | `src/lib/prisma.ts` |
| In-memory state | Login throttle lives in process memory, so it is lost on restart. Sessions are in the DB, so they survive. | `src/lib/login-throttle.ts`, `src/lib/auth.ts` |

Consequences for C10:

- **HYPOTHESIS:** with the DB unavailable, most requests fail inside
  `getCurrentUser()`, so the client gets Next.js's generic 500 (not the JSON
  `{ "error": "Internal server error" }`) and the log shows a raw stack trace
  with no operation and no timestamp. That is the "important information is
  missing" case the assignment describes.
- "Confirm" in this system is either the commit step inside Create
  (`[none] → CONFIRMED`) or Admin Approve (`PENDING_APPROVAL → CONFIRMED`, OP-05).
  The Approve path matches "vytvořte a potvrďte" most literally, and its
  collision case is "zkuste potvrdit překrývající se rezervaci". Use it.

## 2. Decisions to make (with recommendation)

1. **How to make SQLite unavailable.** The DB is a file, so it cannot be
   "disconnected". Recommended: a second process holds an exclusive lock on the
   test DB file for longer than the app's busy timeout, the operation is fired
   meanwhile, then the lock is released. This is a real temporary outage with no
   restart and no risk to the data. Fallback, explicitly allowed by the
   assignment: start the instance with an invalid `DATABASE_URL` (a directory
   that does not exist), run the operation, restart with the valid one.
   Do **not** rename or delete the DB file under a running app: on Windows the
   open handle makes it unreliable, and SQLite may silently create an empty file
   at the old path.
   - Check `PRAGMA journal_mode` on the test DB first. In WAL mode an exclusive
     lock does not block readers, so reads succeed and only the write inside the
     transaction fails. Either result is usable; record which one happened.
   - Find the actual busy timeout (better-sqlite3 default is 5000 ms; what the
     Prisma adapter sets is not verified). Hold the lock clearly longer.
   - If neither approach can be done safely, mark the situation `BLOCKED` with
     the reason. Never `PASS`.
2. **Log a domain rejection?** Recommended: **no**. A collision is expected
   behaviour, the response already carries the status and `code`
   (`AGENT_UNAVAILABLE`), no operator action follows, and the specification has
   no audit requirement. Logging every 4xx would bury the rare technical fault.
   Write this reasoning into the deliverable. If the team wants an audit trail,
   the alternative is one `info` line for rejected OP-05 decisions only.
3. **Log a success?** Recommended: **no**. The response plus the stored state
   prove it.
4. **Shutdown log.** Recommended: do not add a signal handler. On Windows
   `Stop-Process` terminates without delivering a signal, so the handler could
   not be verified. Report honestly that a stop is visible only as the end of
   the log followed by a new startup line.

## 3. Code changes (minimum)

Read the relevant guides in `node_modules/next/dist/docs/` before writing code
(`AGENTS.md` requires it): `01-app/03-api-reference/03-file-conventions/instrumentation.md`
and the Route Handlers reference.

1. `src/lib/log.ts` — tiny logger, no new dependency. One JSON line per event:
   `ts` (ISO), `level`, `component`, `operation`, `event`, `errorType`
   (error name and code), `message`, `outcome`. Never log request bodies,
   cookies, tokens, e-mails, names, or the reservation `note`. Reservation and
   Agent ids are fine.
2. `src/lib/api-error-response.ts` — replace the bare `console.error(error)`
   with a structured `error` record that names the operation and the outcome
   (`500 returned, no state change reported`). Add a wrapper, for example
   `withApiErrors(operation, handler)`, that puts the **whole** handler,
   including `getCurrentUser()`, inside the guard.
3. All 11 route files under `src/app/api/**/route.ts` — use the wrapper with a
   stable operation name (`OP-01 create`, `OP-05 decide`, `auth login`, ...).
   Observable 2xx/4xx behaviour must not change.
4. `src/instrumentation.ts` — `register()` logs one startup line: `ts`, `pid`,
   `NODE_ENV`, and the DB file name (not a full connection string).
5. Keep the architecture rules: no logging import in
   `src/lib/reservation-policy.ts` (must stay import-free); no Reservation
   mutation outside `src/lib/reservation-service.ts`.

## 4. Test instance

- Own DB file, for example `DATABASE_URL="file:./c10-test.db"`, own port
  (`3010`). Never the developer's `dev.db`. Confirm the file is git-ignored.
- `npm run db:deploy` and `npm run db:seed` against that URL (seed creates
  Admin `admin@agents.local`; password is in `prisma/seed.ts`, do not copy it
  into the docs).
- `npm run build`, then `next start -p 3010` with stdout and stderr redirected
  to a log file outside the repo, so excerpts can be quoted.
- Fixtures: one dedicated Agent with `requiresApproval = true`, two registered
  test Users, start times in the future with explicit `Z` (`BR-01`, `BR-06`).
- Optional but recommended: `scripts/c10-operations.ts` with phases
  (`confirm-and-collision`, `fault`, `after-restart`), reusing the helpers
  pattern of `scripts/c02-verification.ts` (`API_URL`, direct Prisma reads for
  the independent state check). State between phases goes to a small JSON file
  outside the repo.

## 5. Experiment protocol

Write the expected result down **before** each run (the table below is that
record). After each run note the actual response and check the state directly
in the DB, not through the log.

| # | Situation | Steps | Expected | State check |
|---|---|---|---|---|
| S1 | Successful confirm | User creates Reservation A on the approval Agent; Admin `PATCH /api/reservations/{A}/decision` `APPROVE` | Create `201 PENDING_APPROVAL`; Approve `200 { status: "CONFIRMED" }` | DB row A is `CONFIRMED`; A appears in `GET /api/reservations` |
| S2 | Rejected collision | Second User creates overlapping Reservation B (allowed, pending does not block); Admin approves B | `409`, `code: "AGENT_UNAVAILABLE"` | B still `PENDING_APPROVAL`; A still `CONFIRMED`; exactly one `CONFIRMED` for that interval |
| S3 | Fault and recovery | Create pending Reservation C (non-overlapping); make DB unavailable; Admin approves C; restore DB | `500`; structured error record with time, operation, error type, outcome; no state change | C still `PENDING_APPROVAL`. Only after this check, retry Approve: `200 CONFIRMED` |
| S4 | Restart | Stop the process; start it again; read A; create a new Reservation D | A still `CONFIRMED`; D `201`; pre-restart session cookie still accepted | DB rows A and D; note that the login throttle counter was reset |

Order of work for S3, because the assignment asks to add logging and repeat:

1. Run S3 on the unmodified baseline (`61b4b4c`). Save the raw log and the
   response. This confirms or refutes the hypothesis in section 1.
2. Apply section 3, commit, rebuild.
3. Run S1 to S4 on the new commit. Save the log excerpts.

Rule for an unknown outcome: after any 5xx or timeout on a write, query the DB
for the row before doing anything else. Never resend the write blind.

Regression after the code change, against the test instance (`API_URL` and
`DATABASE_URL` both pointing at it): `npm run lint`, `npm run typecheck`,
`npm run test:c05`, `npm run test:architecture`, `npm run test:c02`,
`npm run test:api-persistence`, `npm run build`.

## 6. Deliverable

Append `## C10 — Provozní situace a logy` to `docs/evidence-and-evolution.md`,
in Czech, short, in the style of the existing sections:

- the four-row table from the assignment (Situace / Očekávaný a skutečný
  výsledek / Jak jste správnost ověřili / Co ukazují logy, je log potřeba?);
- only the relevant log excerpts: S3 before and after the change, the startup
  line from S4. No passwords, tokens, cookies, e-mails;
- a short answer to: which events are worth logging, what the logs really
  showed, what had to be verified another way (DB query, API read);
- the tested commit (the one containing the logging change) and the baseline
  commit used for the "before" run;
- `BLOCKED` with a reason for anything that could not be done safely;
- remaining risk, for example: stop is not logged; the log proves the reaction,
  not the DB state.

Also update `docs/verification-plan.md` if it lists per-exercise checks.

## 7. Git

Branch from `main` (for example `feat/c10-operations-logging`). Two commits so
the docs can cite a real hash: first the code, then the evidence. Existing
message style: `feat(0.2.1): ...`. Commit and push only when the user asks.

## 8. Done when

- S1 to S4 each have expected result, actual result, and an independent state
  check, or are marked `BLOCKED` with a reason.
- A technical fault produces one record with time, operation, error type and
  outcome, and the client gets the JSON 500.
- Regression commands in section 5 pass, with real counts recorded.
- The C10 section is in `docs/evidence-and-evolution.md` with the tested commit.
