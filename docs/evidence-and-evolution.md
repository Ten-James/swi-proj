# C01 Engineering Spike

Question / unknown:
Ověřit, zda dokážeme Reservation skutečně uložit do databáze
pomocí Prisma a následně ji z databáze znovu načíst.

What we did:
Spustili jsme aplikaci a databázi.
Pomocí POST /api/reservations jsme vytvořili testovací rezervaci.
Poté jsme ověřili její existenci a uložené hodnoty v databázi.

Observed result:
Rezervace byla úspěšně vytvořena a uložena do databáze.
Po následném načtení obsahovala správný userId, agentId,
startTime, endTime a status.

Decision / what changes because of the result:
Prisma a současnou databázi ponecháme jako persistence vrstvu
reservation systému a použijeme ji také pro CP1 walking skeleton.

## C03 — Architecture Evidence

### Accepted baseline and selected slice

- Input baseline: C02 specification v0.2 (`BR-01` až `BR-05`, `AR-01`,
  `REQ-09` až `REQ-12`, OP-05 a stavový model v0.2).
- Selected slice: odložené schválení `PENDING_APPROVAL`, včetně překryvu, který
  vznikne před rozhodnutím Admina, a souběžných rozhodnutí.
- Obecné příklady `DRAFT` a Notification Service ze zadání nejsou součástí přijaté
  specifikace ani implementace, proto nebyly do architektury uměle přidány.

### Part A — AS-IS evidence

Před C03 refaktorem běžela aplikace jako jeden Next.js/Node.js proces nad Prisma a
jedním SQLite souborem. UI volalo Next.js Route Handlers, které řešily HTTP vstup,
doménová rozhodnutí i přímé Prisma operace. Create, Cancel a Approve používaly
transakce, ale vlastnictví životního cyklu bylo rozděleno mezi tři příkazové a tři
čtecí handlery. Kontrola překryvu byla duplicitní v Create, Availability a Approve.

Výchozí chování bylo podloženo C02 E2E sadou a C01 persistence spikem. Tyto testy
tvoří regresní základ, nikoliv náhradu za architektonické rozhodnutí.

### Architecture drivers

1. `BR-02`, `REQ-07` a `REQ-10`: souběžné požadavky nesmí potvrdit dva překrývající
   se intervaly jednoho Agenta.
2. `REQ-09` až `REQ-11`: čekající stav musí přežít původní request a při pozdějším
   Approve se musí znovu validovat.
3. `REQ-12`: hranice `currentTime >= startTime` musí mít jednotného vlastníka.
4. `AR-01`: Session a role musí být ověřeny mimo klientem zaslaná data a OP-05 je
   přístupná jen Adminovi.
5. AS-IS nález: více přímých zapisovatelů Reservation zvyšovalo riziko rozdílných
   pravidel mezi adaptéry.

### Decision and alternatives

Rozhodovací otázka: kde bude autoritativně vlastněn životní cyklus Reservation a
potvrzovací rozhodnutí, aby Create i odložené Approve zachovaly `BR-02` pod
souběhem a přitom zůstaly HTTP a autentizace oddělenými odpovědnostmi?

- Alternative A: jeden in-process `Reservation Service` v současném modulárním
  monolitu vlastní pravidla a Prisma transakce.
- Alternative B: samostatně nasazený Reservation Decision Service s vlastní
  databázovou hranicí.

Obě alternativy byly projity stejným scénářem: User vytvoří čekající Reservation,
později vznikne překrývající `CONFIRMED` Reservation a Admin zkusí původní žádost
schválit. Obě mohou být korektní pouze s jedním databázovým vlastníkem; Alternative
B navíc přináší síťové chyby, ověřování identity mezi službami, deployment a retry
politiku, pro které současný projekt nemá driver.

Rozhodnutí: **Alternative A — modulární monolit s jedním Reservation Service**.
Podrobnosti, negativní důsledky a podmínky přehodnocení jsou v
[ADR-001](c03/adr/ADR-001-reservation-lifecycle-owner.md).

### Architecture views and consistency

- [Domain, alternatives, context, static, state ownership, runtime, sequence a
  design class views](c03/diagrams/README.md)
- [Úplný architektonický dokument a cross-view kontrola](c03/architecture.md)
- [C03 completion checklist](c03/checklist.md)

Cross-view kontrola sjednotila názvy a vlastnictví mezi požadavky, statickou
architekturou, sekvencí, stavovým modelem, design třídami a runtime mapováním.
`DRAFT` byl nahrazen skutečnými přechody `[none] → CONFIRMED/PENDING_APPROVAL` a
neexistující Notification Service nebyla zakreslena.

### AS-IS → TO-BE delta and implementation

- `CHANGE`: lifecycle zápisy, expirace a overlap rozhodnutí byly přesunuty do
  `src/lib/reservation-service.ts`.
- `KEEP`: HTTP validace/mapování, `src/lib/auth.ts`, Prisma, SQLite a jeden runtime
  proces zůstaly zachovány.
- `VERIFY`: `scripts/architecture-check.ts` opakovatelně hlídá, že žádný jiný
  aplikační modul nemutuje Reservation a že vlastník používá transakci.

Route Handlers po změně pouze převádějí HTTP vstup/výstup, řeší autentizaci a volají
Reservation Service. Databázové schéma se neměnilo.

### Verification evidence

Po C03 refaktoru byly 2026-10-05 spuštěny:

```powershell
npm run test:architecture
npm run test:api-persistence
npm run test:c02
npm run lint
npx tsc --noEmit
npm run build
```

C02 sada ověřuje úspěšné Approve, konflikt vzniklý během čekání, neaktivního Agenta,
expiraci na časové hranici a souběžné Create/Approve. Persistence spike ověřuje
skutečný průchod API → SQLite → opětovné načtení stejné Reservation.

| Kontrola | Výsledek |
|---|---|
| Architecture conformance rule | **PASS** — jediným zapisovatelem Reservation lifecycle je `src/lib/reservation-service.ts` |
| C01 API persistence spike | **PASS** — ID vrácené API odpovídalo ID načtenému z databáze |
| C02 behaviour verification | **PASS** — 25/25 scénářů |
| ESLint | **PASS** |
| TypeScript `--noEmit` | **PASS** |
| Next.js production build | **PASS** |

### Remaining risk and baseline identity

- SQLite a jeden proces nejsou návrhem pro horizontálně škálované nasazení.
- Architektonický test chrání jedinou zásadní write hranici, ne všechny možné
  závislosti.
- Reservation Service je stále přímo svázaný s Prisma adaptérem.
- Přesný commit/tag doplní tým až při vytvoření schváleného Git baseline.
