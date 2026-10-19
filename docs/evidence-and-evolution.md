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

## Evidence C02: specifikace → běžící aplikace

Podrobný záznam: [evidence-and-evolution-c02.md](evidence-and-evolution-c02.md).

**Přijatá baseline:** [Specification Baseline v0.1 a v0.2](specification.md).
Obě baseline jsou implementované a ověřené; formální schválení týmem se
zaznamenává v [team-approval.md](team-approval.md).

**Předvedené základní operace:** OP-01 Create (`POST /api/reservations`),
OP-02 Check Availability (`GET /api/availability`), OP-03 Confirm (atomický
commit krok uvnitř Create, u Agentů se schválením dokončen OP-05), OP-04 Cancel
(`PATCH /api/reservations/{id}/cancel`), OP-05 Approve / Reject
(`PATCH /api/reservations/{id}/decision`, pouze Admin).

**Skutečně provedené příklady ověření:** `npm run test:c02` — pro každou
operaci úspěšný i negativní/hraniční scénář, mj. nulový interval, neaktivní
Agent, limit `BR-04`, sousední polouzavřené intervaly, souběžné konfliktní
Create, zrušení přesně v `startTime`, konflikt vzniklý během čekání na schválení,
expirace na hranici `startTime` a souběžná konfliktní schválení. Poslední běh
2026-10-19: **PASS 26/26**.

**Nalezený nesoulad a způsob vyřešení:** zadání předpokládá stav `DRAFT` a
samostatné Confirm. Aplikace ani přijatý model mezistav nemají; tým rozhodl, že
Confirm je commit krok uvnitř Create (`[none] → CONFIRMED`) a tuto sémantiku
promítl do textu, use-case modelu, stavového diagramu i testů
([consistency-notes.md](consistency-notes.md)). Opraven byl zdroj
(specifikace), ne kód.

**Shrnutí dopadu změny:** Agent s `requiresApproval` vytváří
`PENDING_APPROVAL`, který neblokuje dostupnost, ale počítá se do `BR-04`. Nová
operace OP-05 a aktér Admin; nové koncové stavy `REJECTED` a `EXPIRED`
(`currentTime >= startTime`). Nezměněny: `BR-01`, `BR-02`, OP-02 (blokuje jen
`CONFIRMED`).

**Zbývající předpoklad / neznámá:** expirace se perzistuje líně (při dalším
čtení nebo rozhodnutí), ne časovačem. Vytvoření Reservation s `startTime` v
minulosti bylo neošetřené; ve v0.2.1 řeší `BR-06` (čeká na schválení týmem).

**Architektonické drivery přenesené do C03:** souběžné Create/Approve vs.
`BR-02`; perzistentní čekající schválení přežívající request; jednotný vlastník
časové hranice `startTime`.

**Commit / tag aplikace:** `b107a9d` (merge PR #9, baseline v0.2 + autentizace),
tag `c02-baseline-v0.2`.

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

### Commit/tag

`4669362` (merge PR #11, obsahuje refaktor `a080ee1`), tag `c03-architecture`.

## C05 DD Verification Evidence

Vybraná jednotka: pravidla životního cyklu Reservation
([detailed design](c05/detailed-design.md), shrnutí v
[architecture-and-decisions.md](architecture-and-decisions.md#c05-detailed-design)).

### Tests derived from DD

- `scripts/c05-unit-tests.ts` – 16 unit testů: překryv intervalů a hranice
  dotazu (`BR-01`), počáteční stav (změna OP-01 v0.2), limit (`BR-04`), větve
  zrušení (`REQ-08`, `BR-03`, `REQ-12`), plán rozhodnutí (`REQ-09`, `REQ-11`,
  `REQ-12`) a podmínky potvrzení (`REQ-09`, `BR-02`, `BR-05`). Testy ověřují
  doménový kód selhání (`ReservationRuleViolation.code`), ne HTTP status.
- Collaboration: C02 scénáře přes HTTP + SQLite, nově včetně scénáře
  „Malformed JSON payloads are rejected with 400, not 500“.
- Architecture rule: `scripts/architecture-check.ts` – policy nesmí mít žádný
  import; mutace Reservation (libovolný receiver i `$executeRaw`) jen v
  `reservation-service.ts`.

### Unit/component tests executed

Spuštěno 2026-10-12 na čisté lokální SQLite (`db:deploy` + `db:seed`) a
`next dev`:

| Kontrola | Výsledek |
|---|---|
| `npm run test:c05` | **PASS** — 16/16 |
| `npm run test:architecture` | **PASS** — navíc ověřeno negativně: dočasný soubor s `db.reservation.update(` i import v policy kontrolu shodí |
| `npm run test:c02` | **PASS** — 26/26 (25 původních + malformed payload) |
| `npm run test:api-persistence` | **PASS** — ID z API = ID z DB |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

Pozn.: samotné `npx tsc --noEmit` na čistém checkoutu selže na
`Cannot find name 'LayoutProps'` – globální typy generuje až Next.js
(`next typegen`/`build`). Proto přibyl skript `typecheck`.

### Design ↔ implementation mismatch

Code review DD proti kódu (2026-10-12) našlo:

| # | DD tvrdil | Kód dělal | Rozhodnutí |
|---|---|---|---|
| 1 | `intervalsOverlap` je jediná definice překryvu pro Create, Availability i Approve | funkce se v produkci nevolala; překryv byl třikrát ručně zapsán jako Prisma `where` | **update code** – DD je správně |
| 2 | policy rozhoduje pravidla | policy házela `ApiError` s HTTP kódy → doménové pravidlo znalo transport | **update code + DD** – doménové kódy, mapování v adaptéru |
| 3 | `REQ-09` = počáteční stav; Decision = `REQ-10`–`REQ-12` | spec: `REQ-09` = podmínky Approve, počáteční stav je změna OP-01 | **update DD** + komentáře v kódu |
| 4 | – | `null`/pole/číslo jako JSON tělo nebo ne-string pole → neošetřený `TypeError` → 500 (reprodukováno) | **update code** – 400 |
| 5 | – | duplicitní typ actora (`PolicyActor` / `ReservationActor`), duplicitní expirační dotaz v Create | **update code** |

### Resolution

- `overlapBounds()` v policy je jediná definice `BR-01`; `intervalsOverlap` i
  nový `findConfirmedOverlap()` v service ji používají (Create, Availability,
  Approve). Unit test hlídá ostrost hranic.
- `ReservationRuleViolation` + `ReservationRuleCode` nahradily `ApiError` v
  policy; `api-error-response.ts` mapuje kód na HTTP (403/409 beze změny
  pozorovatelného chování – potvrzeno C02 sadou) a nově vrací i `code`.
- `src/lib/request-body.ts` (`readJsonObject`, `optionalString`) použito v
  `POST /api/reservations`, `PATCH …/decision`, `register`, `login`.
- `createReservation` používá sdílený `expirePendingReservations(tx, now)`;
  service používá `PolicyActor`.
- Architecture check zpřísněn (viz výše).

### Remaining design risk

- Správnost pod souběhem (`REQ-07`, `REQ-10`, `BR-04`) stojí na serializaci
  zápisů SQLite v jednom procesu; unit testy ji nepokrývají, C02 souběžné
  scénáře ano. Při přechodu na jinou DB je nutné znovu rozhodnout izolaci/zámky.
- Create stále rozhoduje `BR-05` a překryv v service (`ApiError`), ne přes
  policy – vědomě ponecháno (DD §9, §11 PARTLY).
- Policy a databázový dotaz sdílí hranice, ale ekvivalenci dotazu s
  `intervalsOverlap` ověřuje jen integrační C02 scénář `OP-02 applies half-open
  interval boundaries`.
- Architecture check je textový (regex), ne AST; obejít jde např. dynamickým
  přístupem k delegátu.

### Commit/tag

Tag `c05-detailed-design` (anotovaný) na commitu, který obsahuje tento DD,
opravy z review a výsledky testů výše. Ověření: `git show c05-detailed-design`.

## Code review fixes — Specification Baseline v0.2.1

Code review 2026-10-19 (větev `fix/review-findings`). Každý nález byl nejdřív
reprodukován na běžící aplikaci, pak opraven ve zdroji, kam patří.

| # | Nález (reprodukce) | Zdroj chyby | Oprava |
|---|---|---|---|
| 1 | registrace e-mailu existujícího účtu bez hesla převzala účet i jeho Reservations | implementace | `register` vrací 409 pro jakýkoliv existující účet; souběh rozhoduje unique index (P2002 → 409) |
| 2 | Create se `startTime` v roce 2020 → 201 `PENDING_APPROVAL` | specifikace (chybělo pravidlo) | nové `BR-06`, `assertStartsInFuture` v policy, kód `START_IN_PAST` → 400 |
| 3 | čas bez offsetu (`2030-01-01T10:00:00`) přijat v časové zóně serveru | specifikace + implementace | `BR-01` vyžaduje offset/`Z`; `parseInterval` v `request-body.ts` pro Create i Availability |
| 4 | poznámka 200 KB → 201 | implementace | limit 500 znaků → 400 |
| 5 | login neznámého e-mailu rychlejší (bez scrypt); žádný limit pokusů | implementace | `verifyAgainstDummy`; `login-throttle.ts` – 5 chyb / 15 min na e-mail → 429 + `Retry-After` |
| 6 | Gantt přehled skrýval Reservations neaktivních Agentů | implementace (UI) | seskupení podle Agenta z Reservation, ne ze seznamu aktivních |
| 7 | překryv při Create rozhodovala service (`ApiError`), ne policy | design ↔ code (DD §11 PARTLY) | `assertNoConfirmedOverlap` sdílí Create i Approve; HTTP 409 beze změny |
| 8 | `prisma7.config.ts` – nestandardní název konfigurace | konfigurace | `prisma.config.ts`, výchozí `DATABASE_URL` |
| 9 | `.env` verzovaný | repozitář | `.env` v `.gitignore`, přidán `.env.example` |
| 10 | E2E fixture spoléhala na chybu #1 (vytvoření Usera bez hesla a následná „registrace“) | test | helper `registeredUser` |
| 11 | *(druhé kolo review)* `2030-02-31` se tiše posunulo na 3. 3., `24:00` na další den | implementace | `parseInstant` kontroluje kalendářní den a hodinu |
| 12 | *(druhé kolo review)* paralelní dávka loginů prošla limitem, dokud běžel scrypt | implementace | pokus se započítá před ověřením hesla (`beginLoginAttempt`), úspěch čítač maže |

Také: CI nově spouští lint, typecheck, `test:c05`, `test:architecture`,
`test:api-persistence` i `test:c02`; E2E skripty respektují `API_URL`.

### Ověření

Spuštěno 2026-10-19 na čisté SQLite (`db:deploy` + `db:seed`) a `next dev`:

| Kontrola | Výsledek |
|---|---|
| `npm run test:c05` | **PASS** — 20/20 (+ `BR-06`, sdílený overlap, parsování intervalu, throttle) |
| `npm run test:architecture` | **PASS** |
| `npm run test:c02` | **PASS** — 31/31 (+ převzetí účtu, throttle, `BR-06`, offset, délka poznámky); spuštěno dvakrát po sobě proti `next build` + `next start` |
| `npm run test:api-persistence` | **PASS** |
| `npm run lint`, `npm run typecheck`, `npm run build` | **PASS** |

### Zbývající riziko

- Throttle je v paměti procesu – platí jen pro jednoprocesové nasazení dle
  ADR-001; útočník jím může dočasně zablokovat přihlášení cizího e-mailu.
- `BR-06` a v0.2.1 čekají na schválení týmem ([team-approval.md](team-approval.md)).

