# C03 architecture diagrams

GitHub renders the Mermaid blocks below. The adjacent `.mmd` files are the
individually reusable diagram sources.

## 0. Alternatives

```mermaid
flowchart LR
  subgraph A[Alternative A — modular monolith]
    AAPI[HTTP API adapters] --> ASVC[Reservation Service]
    ASVC --> ADB[(SQLite via Prisma)]
  end

  subgraph B[Alternative B — separate decision service]
    BWEB[Next.js web application] -->|HTTP command| BSVC[Reservation Decision Service]
    BSVC --> BDB[(Service-owned database)]
  end
```

## 1. Domain class model

```mermaid
classDiagram
  class User {
    +id: String
    +email: String
    +role: UserRole
    +maxReservations: Int
  }
  class Session {
    +tokenHash: String
    +expiresAt: DateTime
  }
  class Agent {
    +id: String
    +isActive: Boolean
    +requiresApproval: Boolean
  }
  class Reservation {
    +id: String
    +status: ReservationStatus
    +startTime: DateTime
    +endTime: DateTime
    +note: String?
  }
  class TimeInterval {
    +start: DateTime
    +end: DateTime
    +overlaps(other): Boolean
  }
  class ApprovalDecision {
    <<enumeration>>
    APPROVE
    REJECT
  }

  User "1" --> "0..*" Session : authenticates through
  User "1" --> "0..*" Reservation : owns
  Agent "1" --> "0..*" Reservation : allocated by
  Reservation *-- "1" TimeInterval : has
  ApprovalDecision ..> Reservation : requests transition

  note for Reservation "Only CONFIRMED intervals block an Agent.\nFor one Agent, CONFIRMED intervals must not overlap."
```

## 2. System context

```mermaid
flowchart LR
  U[User]
  A[Admin / Approver]
  RS[Reservation System]

  U -->|register, login, availability, create, cancel| RS
  RS -->|global Gantt, own reservations, outcomes| U
  A -->|login, approve, reject, cancel| RS
  RS -->|pending queue, all reservations, outcomes| A
```

## 3. Static architecture

```mermaid
flowchart TB
  subgraph RS[Reservation System]
    UI[Web UI<br/>role: user/admin interaction]
    API[HTTP API Adapters<br/>role: transport validation and response mapping]
    AUTH[Session & Authorization<br/>role: authenticate actor<br/>owns: Session validity and role claims]
    RMS[Reservation Service<br/>role: lifecycle, availability, approval<br/>owns: Reservation transitions and BR-02]
    PERSIST[Prisma Persistence Adapter<br/>role: transactional storage access]
    DB[(SQLite<br/>owns: persisted Users, Sessions, Agents, Reservations)]

    UI -->|HTTP commands and queries| API
    API -->|verify actor| AUTH
    API -->|typed use-case calls| RMS
    AUTH -->|User/Session reads| PERSIST
    RMS -->|transactional reads/writes| PERSIST
    PERSIST -->|SQL| DB
  end
```

## 4. State transition ownership

```mermaid
stateDiagram-v2
  [*] --> CONFIRMED : create / Reservation Service\n[approval not required]
  [*] --> PENDING_APPROVAL : create / Reservation Service\n[approval required]
  PENDING_APPROVAL --> CONFIRMED : Admin requests approve\nReservation Service decides
  PENDING_APPROVAL --> REJECTED : Admin requests reject\nReservation Service decides
  PENDING_APPROVAL --> EXPIRED : read/decision observes startTime\nReservation Service decides
  PENDING_APPROVAL --> CANCELLED : owner/Admin requests cancel\nReservation Service decides
  CONFIRMED --> CANCELLED : owner/Admin requests cancel\nReservation Service decides
  CANCELLED --> [*]
  REJECTED --> [*]
  EXPIRED --> [*]
```

## 5. Runtime / deployment

```mermaid
flowchart LR
  B[Browser]
  subgraph NODE[Single Next.js / Node.js process]
    UI[React UI]
    API[Route Handlers]
    AUTH[Session & Authorization]
    RMS[Reservation Service]
    PA[Prisma Adapter]
    UI --> API
    API --> AUTH
    API --> RMS
    AUTH --> PA
    RMS --> PA
  end
  DB[(SQLite database file)]

  B <-->|HTTP + HttpOnly session cookie| NODE
  PA <-->|local SQL read/write| DB
```

## 6. Approve sequence

```mermaid
sequenceDiagram
  actor Admin
  participant API as Decision API Adapter
  participant Auth as Session & Authorization
  participant Service as Reservation Service
  participant DB as Prisma / SQLite

  Admin->>API: PATCH decision(APPROVE)
  API->>Auth: getCurrentUser()
  Auth->>DB: read valid Session + User role
  DB-->>Auth: ADMIN actor
  API->>Service: decideReservation(id, APPROVE)
  Service->>DB: begin transaction; load pending Reservation + Agent
  alt currentTime >= startTime
    Service->>DB: persist EXPIRED
    Service-->>API: expired result
  else overlapping CONFIRMED exists
    Service->>DB: recheck BR-02; rollback/no state change
    Service-->>API: conflict; remains PENDING_APPROVAL
  else Agent active and interval free
    Service->>DB: persist CONFIRMED; commit
    Service-->>API: confirmed result
  end
  API-->>Admin: HTTP result
```

## 7. Focused design class

```mermaid
classDiagram
  class DecisionApiAdapter {
    +PATCH(request, routeContext): Response
  }
  class SessionService {
    +getCurrentUser(): SessionUser?
  }
  class ReservationService {
    +createReservation(input): Reservation
    +checkAgentAvailability(agentId, start, end): Availability
    +cancelReservation(id, actor): CancelResult
    +decideReservation(id, decision): DecisionResult
    +listPublicReservations(): ReservationView[]
  }
  class PrismaPersistenceAdapter {
    +transaction(work)
    +findReservation(id)
    +findConfirmedOverlap(agentId, interval)
    +updateReservationStatus(id, status)
  }
  class Reservation {
    +id: String
    +status: ReservationStatus
    +startTime: DateTime
    +endTime: DateTime
  }
  class Agent {
    +id: String
    +isActive: Boolean
    +requiresApproval: Boolean
  }
  class ApiError {
    +status: Int
    +message: String
  }

  DecisionApiAdapter --> SessionService : authenticate / authorize
  DecisionApiAdapter --> ReservationService : invokes
  ReservationService --> PrismaPersistenceAdapter : transactional port
  PrismaPersistenceAdapter --> Reservation : persists
  PrismaPersistenceAdapter --> Agent : reads
  ReservationService ..> ApiError : reports rule failure
```
