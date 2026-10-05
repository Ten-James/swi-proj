# C03 — Architecture

Selected slice: **delayed approval of a Reservation, including an overlap that
appears while approval is pending**.

Accepted input baseline: C02 specification v0.2 (`BR-01` to `BR-05`, `AR-01`,
`REQ-09` to `REQ-12`, OP-05 and the v0.2 statechart).

## A. AS-IS implementation evidence

This section records the implementation immediately before the C03 refactor.

### Runtime and technology

| Area | Observed AS-IS |
|---|---|
| Deployable | One Next.js / Node.js application process |
| UI | React client components for User and Admin screens |
| HTTP boundary | Next.js Route Handlers under `src/app/api` |
| Authentication | Database Session selected by an `HttpOnly` cookie |
| Persistence | Prisma client with `better-sqlite3` adapter |
| Database | One local SQLite database file |
| External runtime services | None |

### Significant request paths

| Scenario | AS-IS path | State / rule owner observed in code |
|---|---|---|
| Create | UI → `/api/reservations` → Prisma transaction | Create route handler |
| Availability | UI → `/api/availability` → Prisma query | Availability route handler |
| Cancel | UI → `/api/reservations/{id}/cancel` → Prisma transaction | Cancel route handler |
| Approve / Reject | Admin UI → `/api/reservations/{id}/decision` → Prisma transaction | Decision route handler |
| Expire pending | Public, User and Admin list endpoints → Prisma `updateMany` | Three read route handlers |

### AS-IS findings

1. The database transaction already protected each individual Create, Cancel and
   Approve operation. C02 concurrency tests passed.
2. Lifecycle ownership was nevertheless distributed: three command handlers and
   three list handlers could persist Reservation states.
3. The overlap expression was duplicated between Create, Availability and Approve.
4. HTTP transport, domain decisions and persistence calls were mixed in the same
   files, so a new adapter could accidentally implement different rules.
5. Authentication had a clearer owner (`src/lib/auth.ts`) and did not need structural
   change.
6. No Notification Service exists in the accepted requirements or implementation;
   the notification examples in the assignment are therefore not project drivers.

### AS-IS evidence

- C02 E2E suite covered delayed approval, appeared overlap, expiration and concurrent
  decisions.
- C01 persistence spike demonstrated real API → SQLite persistence.
- Static inspection found Reservation writes in multiple Route Handlers.

## B. Architecture drivers

| Evidence / source | Why it affects architecture | Question the architecture must answer |
|---|---|---|
| `BR-02`, `REQ-07`, `REQ-10`; concurrent C02 tests | Separate requests can observe the same free interval and race to commit. | Where is the authoritative decision made so at most one conflicting Reservation becomes `CONFIRMED`? |
| `REQ-09` to `REQ-11`; approval may occur later | `PENDING_APPROVAL` must survive the initiating request and be revalidated at decision time. | Which element owns pending state and later Approve/Reject transitions? |
| `REQ-12`; `currentTime >= startTime` | Expiration is time-dependent and may be discovered by a read, cancel or decision request. | Which owner applies the expiration transition consistently? |
| `AR-01`; User/Admin roles | Transport input cannot be trusted as identity and OP-05 is Admin-only. | Where is actor authentication separated from lifecycle authorization and business rules? |
| Part A: six handlers could write/read lifecycle directly | Duplicated ownership makes rule drift likely and difficult to verify. | What dependency rule keeps adapters from becoming additional lifecycle owners? |

Drivers are stated as problems and constraints. `Reservation Service`, Prisma
transactions and a separate service are candidate solutions, not drivers.

## C1. Domain class model

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#1-domain-class-model)

Mermaid source: [01-domain-class.mmd](diagrams/01-domain-class.mmd)

The model contains domain concepts only. `Session` establishes the actor, while
`Reservation`, `Agent` and `TimeInterval` carry the selected scenario. An
`ApprovalDecision` requests a transition but does not own the resulting state.

## C2. System responsibilities

| Source | Responsibility | Must decide / own | One clear owner? | Group with | Separate from |
|---|---|---|---|---|---|
| AR-01 | authenticate request actor | Session validity and role claim | Yes | Session persistence | Reservation lifecycle rules |
| OP-01 / OP-03 | create and initially confirm/request approval | `[none] → CONFIRMED/PENDING_APPROVAL` | Yes | overlap and User-limit checks | HTTP parsing and rendering |
| BR-02 | evaluate overlap and preserve exclusivity | authoritative commit under concurrency | Yes | lifecycle transaction | snapshot-only UI availability result |
| OP-05 | manage delayed approval | Approve/Reject transition | Yes | persisted Reservation and Agent state | Admin screen and HTTP response mapping |
| REQ-12 | expire pending requests | `PENDING_APPROVAL → EXPIRED` | Yes | lifecycle state and system clock | whichever read endpoint discovers it |
| OP-04 | cancel future Reservation | ownership/time check and `CANCELLED` | Yes | lifecycle state | UI button and transport format |
| UC1 / OP-02 | provide schedule and availability reads | query shape; no lifecycle decision except delegated expiry | Yes | shared read model | User identity in public Gantt |
| persistence evidence | atomically read/write durable state | transaction boundary and records | Yes | lifecycle owner during a command | HTTP framework |

## D. Main decision question

> Where should the authoritative Reservation lifecycle and confirmation decision be
> owned so that Create and delayed Approve preserve BR-02 under concurrency, while
> transport and authentication remain separate concerns?

## E1. Alternatives

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#0-alternatives)

Mermaid source: [00-alternatives.mmd](diagrams/00-alternatives.mmd)

### Alternative A — Reservation Service in the current deployable

- Keep one Next.js process and the existing SQLite database.
- Route Handlers authenticate and validate transport input.
- One in-process Reservation Service owns lifecycle rules and Prisma transactions.
- Public/User/Admin queries delegate expiration to the same owner.

### Alternative B — separate Reservation Decision Service

- Next.js becomes a client of a separately deployed service.
- The service owns Create, Cancel, Approve and Reservation persistence.
- The service needs an exclusive database boundary or a distributed consistency
  mechanism; sharing the current SQLite file between processes is not acceptable.

## E2. Comparison against drivers

| Driver / criterion | Alternative A — modular monolith | Alternative B — separate service |
|---|---|---|
| BR-02 consistency | One service method and one local Prisma transaction make the authoritative check and state write. | Can provide the same ownership only if the service exclusively owns its database; otherwise network calls do not solve the race. |
| Delayed approval | `PENDING_APPROVAL` remains in SQLite and any later request invokes the same owner. | Durable state also works, but requires service availability and network communication for every decision. |
| Expiration boundary | One module applies the same clock rule from reads and commands. | One service applies it consistently, but callers must handle remote errors/timeouts. |
| Auth/trust boundary | Route adapter resolves the Session and passes a typed actor/authorized command; business service does not trust submitted email. | Identity claims cross a network boundary and require signed/verifiable service-to-service credentials. |
| Operational complexity | No new deployment, database or observability surface. | Adds deployment, health, retry, versioning and database-ownership concerns unsupported by current scale. |

## E3. Scenario walkthrough

Scenario: a User creates a request for an approval-required Agent. Before the Admin
approves it, another Reservation becomes `CONFIRMED` for an overlapping interval.

| Step / event | Alternative A | Alternative B |
|---|---|---|
| Create starts | API resolves User Session and calls local Reservation Service. | Web application calls the remote decision service with verified actor claims. |
| Approval required | Local transaction persists `PENDING_APPROVAL`. | Remote service transaction persists `PENDING_APPROVAL` in its database. |
| Original request ends | State survives in SQLite. | State survives in the service-owned database. |
| Admin approval arrives later | Admin API calls the same local lifecycle owner. | Admin request crosses the network to the remote owner. |
| Overlap appeared | Service rechecks BR-02 in the approval transaction, returns conflict and leaves state pending. | Remote service performs the same recheck; caller must distinguish business conflict from network failure. |
| Two approvals race | SQLite serializes the local transactions; at most one reaches `CONFIRMED`. | Correct only if all writers go through the service and its database provides the required transaction/isolation behavior. |

Both alternatives can implement the behavior. Alternative B introduces failure and
operational boundaries for which this project has no driver.

## F. ADR

Decision: **Alternative A — modular monolith with one Reservation Service**.

Full record: [ADR-001 — Reservation lifecycle owner](adr/ADR-001-reservation-lifecycle-owner.md)

## G1. System context

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#2-system-context)

Mermaid source: [02-system-context.mmd](diagrams/02-system-context.mmd)

Only real external actors are shown. Authentication is internal; there is no external
IdP or Notification Service in the accepted system.

## G2. TO-BE static architecture

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#3-static-architecture)

Mermaid source: [03-static-architecture.mmd](diagrams/03-static-architecture.mmd)

Primary ownership:

| Architectural element | Primary responsibility | Owns |
|---|---|---|
| Web UI | User/Admin interaction and visualization | transient form/view state |
| HTTP API Adapters | JSON/query validation and HTTP mapping | transport contract |
| Session & Authorization | resolve authenticated actor and role | Session validity / identity claim |
| Reservation Service | lifecycle, approval, cancellation, availability rules | Reservation transitions and BR-02 decision |
| Prisma Persistence Adapter | execute database operations and transactions | persistence mechanism, not business decisions |
| SQLite | durable records | persisted User, Session, Agent and Reservation data |

Allowed dependency direction:

`UI → API Adapter → Session/Authorization and Reservation Service → Prisma → SQLite`

An API Adapter must not mutate Reservation persistence directly.

## G3. State transition ownership

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#4-state-transition-ownership)

Mermaid source: [04-state-ownership.mmd](diagrams/04-state-ownership.mmd)

| Transition | Decision owner | May only request / trigger |
|---|---|---|
| `[none] → CONFIRMED` | Reservation Service | authenticated User through Create API |
| `[none] → PENDING_APPROVAL` | Reservation Service | authenticated User through Create API |
| `PENDING_APPROVAL → CONFIRMED` | Reservation Service | authenticated Admin requests Approve |
| `PENDING_APPROVAL → REJECTED` | Reservation Service | authenticated Admin requests Reject |
| `PENDING_APPROVAL → EXPIRED` | Reservation Service | list/cancel/decision adapter observes a relevant operation; system clock supplies time |
| `PENDING_APPROVAL → CANCELLED` | Reservation Service | owner or Admin requests Cancel |
| `CONFIRMED → CANCELLED` | Reservation Service | owner or Admin requests Cancel |

The assignment's illustrative `DRAFT` transition is intentionally not copied because
the accepted C02 baseline has no `DRAFT` state.

## G4. Runtime / deployment mapping

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#5-runtime--deployment)

Mermaid source: [05-runtime-deployment.mmd](diagrams/05-runtime-deployment.mmd)

There is one application process and one SQLite database file. Logical separation
does not pretend that additional deployables exist. The accepted ADR is visible as an
in-process Reservation Service.

## H1. Design sequence — Approve with conflict alternative

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#6-approve-sequence)

Mermaid source: [06-approve-sequence.mmd](diagrams/06-approve-sequence.mmd)

The sequence uses only elements present in G2. It shows the success path plus the two
most important alternatives: expiration and an overlap that appeared while waiting.

## H2. Focused design class diagram

Rendered view: [C03 Mermaid diagrams](diagrams/README.md#7-focused-design-class)

Mermaid source: [07-design-class.mmd](diagrams/07-design-class.mmd)

The `ReservationService.decideReservation` operation owns the decision shown in H1.
The API adapter owns HTTP parsing/mapping, Session Service owns actor resolution and
the Prisma adapter performs the transaction requested by the service.

## I. Cross-view consistency check

| Check | Result | Issue found / resolution |
|---|---|---|
| C02 ↔ G2 | Pass | All Create, Availability, Cancel and Approve rules have a path through Reservation Service. |
| C2 ↔ G2 | Pass | Each significant responsibility has one primary owner. |
| G2 ↔ H1 | Pass | Every sequence participant exists in the static architecture. |
| H1 ↔ H2 | Pass | `getCurrentUser`, `decideReservation`, transaction/read/write operations have structural owners. |
| statechart ↔ G3/H1 | Pass | Admin requests approval; Reservation Service decides and persists the transition. |
| G2 ↔ G4 | Pass | All logical elements map to the single Node.js process or SQLite database. |
| ADR ↔ G2/G4 | Pass | The selected in-process owner is visible in both diagrams. |

Resolved inconsistencies:

- The generic assignment example referenced `DRAFT`; it was replaced with the actual
  C02 `[none] → CONFIRMED/PENDING_APPROVAL` transitions.
- A Notification Service was not invented because neither C02 nor the implementation
  contains one.
- The public Gantt remains a query concern and still omits User identity and notes.

## J. AS-IS → TO-BE delta

| Area | AS-IS | TO-BE | Action | Result |
|---|---|---|---|---|
| Reservation lifecycle writes | Multiple Route Handlers call Prisma directly | Reservation Service is the only lifecycle owner | `CHANGE` | Completed |
| Expiration | Duplicated in public/User/Admin list handlers | One service operation applies expiration | `CHANGE` | Completed |
| Availability/overlap query | Rule duplicated in availability, Create and Approve handlers | Rule execution grouped in Reservation Service | `CHANGE` | Completed |
| HTTP validation and status mapping | Route Handlers | Route Handlers | `KEEP` | Kept |
| Session authentication | `src/lib/auth.ts` and role checks at API boundary | Same boundary | `KEEP` | Kept |
| Persistence runtime | Prisma + SQLite in one process | Same | `KEEP` | Kept |
| Dependency rule | Convention only | No Reservation mutation outside Reservation Service | `VERIFY` | Automated check added |

## K. Implementation update

Implemented changes:

- added `src/lib/reservation-service.ts` as lifecycle and BR-02 owner;
- changed Reservation, Availability and Admin Route Handlers into thin adapters;
- added shared API error mapping without moving domain decisions back to adapters;
- added `scripts/architecture-check.ts` and `npm run test:architecture`;
- retained the verified API contracts, authentication model, Prisma adapter and
  single-process runtime.

No database schema change was required for C03.

## L1. Behavior verification

Executed on 2026-10-05 after the C03 refactor:

| Verification | Result | Evidence |
|---|---|---|
| success path | Pass | `OP-05 approves a valid pending Reservation` in `npm run test:c02` |
| selected failure | Pass | appeared overlap and inactive Agent both reject approval while state remains pending |
| time boundary | Pass | pending approval at/after `startTime` persists `EXPIRED` |
| concurrency | Pass | conflicting concurrent Create and Approve tests allow at most one `CONFIRMED` |
| persistence walking skeleton | Pass | `npm run test:api-persistence` returns the same Reservation ID from API and database |
| build/type/lint | Pass | `npm run build`, `npx tsc --noEmit`, `npm run lint` |

## L2. Architecture rule verification

Architecture rule:

> Only `src/lib/reservation-service.ts` may persist Reservation lifecycle changes.

Repeatable check:

`npm run test:architecture`

The script scans application source for Prisma Reservation mutations outside the
lifecycle owner and verifies that the owner contains explicit transaction boundaries.

Result on 2026-10-05: **PASS**.

## M. Evidence and remaining risk

The consolidated C01–C03 evidence is in
[evidence-and-evolution.md](../evidence-and-evolution.md).

Remaining risks:

- SQLite and the single process are suitable for the current walking skeleton, not a
  horizontally scaled deployment.
- The architecture check is intentionally narrow: it protects lifecycle write
  ownership, not every possible dependency direction.
- The Prisma adapter is not hidden behind a database-independent repository contract.
- Exact commit/tag remains to be recorded after the team commits this baseline.

Completion status: [checklist.md](checklist.md)
