# AI Agent Reservation System

Implementace specifikace C02 pro rezervaci výpočetního času AI agentů. Aplikace
používá Next.js, Prisma a SQLite.

## Spuštění

```powershell
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Aplikace je poté dostupná na `http://localhost:3000`. Seed vytvoří čtyři agenty,
z nichž dva vyžadují schválení, a administrátora `admin@agents.local`.

## Implementované operace

- `POST /api/reservations` — vytvoření Reservation jako `CONFIRMED` nebo
  `PENDING_APPROVAL`;
- `GET /api/availability` — ověření dostupnosti Agenta pro interval;
- `PATCH /api/reservations/{id}/cancel` — zrušení budoucí Reservation;
- `PATCH /api/reservations/{id}/decision` — Admin schválení nebo zamítnutí;
- `GET /api/reservations` — globální přehled bez identity vlastníků;
- `GET /api/agents` — seznam aktivních Agentů.

## Ověření C02

Při spuštěné aplikaci v jiném terminálu:

```powershell
npm run test:c02
```

Skript ověřuje pozitivní, negativní, hraniční a souběžné scénáře OP-01 až
OP-05 a po dokončení odstraní svá testovací data. Další kontroly:

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

Úplná specifikace je v [docs/specification.md](docs/specification.md), plán testů
v [docs/verification-plan.md](docs/verification-plan.md) a zaznamenané výsledky
v [docs/evidence-and-evolution-c02.md](docs/evidence-and-evolution-c02.md).

