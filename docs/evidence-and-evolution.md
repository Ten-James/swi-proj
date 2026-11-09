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


## C08 — Controlled Change evidence

Change Card, Impact Matrix, Options Matrix a rozhodnutí:
[intent-and-change.md — C08 / CR-08](intent-and-change.md#c08--cr-08--controlled-change-card).

### Krok 0 — before baseline

| Položka | Hodnota |
|---|---|
| Commit / tag | `61b4b4c` (merge PR #15), anotovaný tag `c08-baseline` |
| Přijatá specifikace | [Specification Baseline v0.2.1](specification.md): `BR-01` (polouzavřené `[start,end)`, instant s offsetem/`Z`), `BR-02` (žádný překryv `CONFIRMED` jednoho Agenta), `BR-04`, `BR-06`, OP-01 / `REQ-01`–`REQ-04` |
| Architektura | [ADR-001](c03/adr/ADR-001-reservation-lifecycle-owner.md) — jediný vlastník životního cyklu `src/lib/reservation-service.ts`, pravidla v `src/lib/reservation-policy.ts` ([C05 DD](c05/detailed-design.md)) |
| DB schéma | `prisma/schema.prisma` (sha256 `46694d5b…`), 3 migrace, poslední `20261003131709_c02_authentication`; SQLite přes `@prisma/adapter-better-sqlite3` |
| Runtime | Node.js 22 (lokálně v22.21.1 / npm 10.9.4 na Linuxu; CI `ubuntu-latest` + `actions/setup-node` 22), Next.js 16.3.5, React 19.2.8, Prisma 7.10.0, better-sqlite3 12.11.1 |
| Zámek závislostí | `package-lock.json` (sha256 `6cf8b8d8…`), instalace `npm ci` |
| Testovací konfigurace | izolovaná DB `DATABASE_URL="file:./test.db"` (soubor se před během smaže), žádné tajné hodnoty; demo Admin ze seedu (`README.md`) |
| Příprava dat | `npm run db:deploy && npm run db:seed` (4 Agenti, demo Admin); fixtury test cases vytváří vlastní Agenty a Usery a po běhu je mažou |
| Známé testy na baseline | `test:c05` (20 unit), `test:c02` (31 E2E), `test:architecture`, `test:api-persistence` |

Obnovení stejného výchozího stavu jiným členem:

```bash
git checkout c08-baseline
npm ci
rm -f test.db
DATABASE_URL="file:./test.db" npm run db:deploy
DATABASE_URL="file:./test.db" npm run db:seed
DATABASE_URL="file:./test.db" npm run build
DATABASE_URL="file:./test.db" npm start            # terminál 1
DATABASE_URL="file:./test.db" npm run test:c08     # terminál 2 (skript přidán v C08, viz níže)
```

Testovací skript `scripts/c08-baseline-tests.ts` (+ helpery `scripts/lib/`) vznikl v
C08 a nemění produkt: `git diff c08-baseline <C08 commit> -- src prisma` je prázdný.
Pro běh se do pracovní kopie baseline přenáší jen adresář `scripts/`.

### Krok 2 — stepwise test cases (Expected napsáno před během)

Společné: Agent R1 je exkluzivní (`capacity = 1`, `requiresApproval = false`), všechny
časy jsou UTC instanty dne 2035-03-12 (vždy v budoucnosti, `BR-06`), intervaly
polouzavřené `[start,end)`. Dva intervaly se překrývají právě když
`a.start < b.end && b.start < a.end`. Oracle čte committed řádky z tabulky
`Reservation` raw SQL dotazem v testovacím procesu (`scripts/lib/db-oracle.ts`),
tedy přes jiné DB spojení než server, a podmínku překryvu přepisuje samostatně, bez
volání aplikační policy.

#### C08 / TC-C08-01 — sousední Create zachovává BR-02

- **Test basis:** `BR-01`, `BR-02`, OP-01 `REQ-01`–`REQ-03` @ v0.2.1; riziko C04 `QC-04`.
- **Baseline:** `c08-baseline` (`61b4b4c`), schéma `20261003131709_c02_authentication`, Node 22, `next build` + `next start`, příkaz `npm run test:c08`.
- **Preconditions:** běžící aplikace nad izolovanou `test.db` po `db:deploy` + `db:seed`; User U1 (vlastník B1) a User U2 (žadatel) registrovaní přes `/api/auth/register`, oba s výchozím limitem `maxReservations = 3` a bez jiných Reservation.
- **Test data:** B1 = `CONFIRMED` R1 `[2035-03-12T10:00Z, 11:00Z)` (fixtura); B2 = požadavek U2 na R1 `[11:00Z, 12:00Z)`.

| # | Action / input | Expected BEFORE execution | Actual AFTER execution | Evidence |
|---|---|---|---|---|
| 1 | Smazat Reservation R1, vložit B1 `CONFIRMED` | fixtura uložena | B1 uložena (`cmw9f5vvj…`) | log krok 1 |
| 2 | Nezávisle přečíst uložené řádky R1 | právě 1 řádek: `CONFIRMED [10:00,11:00)` | `CONFIRMED [10:00Z,11:00Z)`, 1 řádek | log krok 2 |
| 3 | `POST /api/reservations` B2 `[11:00,12:00)` se Session U2 | `201`, `status = CONFIRMED` (sousední intervaly se nepřekrývají) | `201 {"status":"CONFIRMED"}`, id `cmw9f5vxs…` | log krok 3 |
| 4 | Znovu přečíst committed stav R1 | 2 řádky, oba `CONFIRMED` `[10:00,11:00)` a `[11:00,12:00)`; uložené B2 má vrácené id; 0 překrývajících se `CONFIRMED` dvojic | 2× `CONFIRMED` `[10:00,11:00)` + `[11:00,12:00)`, B2 = vrácené id, `overlapPairs=0` | log krok 4 |
| 5 | Reset a zopakovat kroky 1–4, nakonec smazat data R1 | stejný výsledek; R1 bez řádků | opakování: `201 CONFIRMED`, 2× `CONFIRMED`, `overlapPairs=0`; po resetu 0 řádků | log kroky 1–5 (repeat) |

- **Final postcondition / oracle:** v DB 2× `CONFIRMED` pro R1, `confirmedOverlapPairs(R1) = 0`.
- **Verdict:** **PASS** — 2026-11-09, viz běh níže (všech 9 kroků PASS).

#### C08 / TC-C08-02 — překrývající se Create je odmítnut (BR-02)

- **Test basis:** `BR-02`, OP-01 `REQ-03`, alternativní výsledek „overlap → reject, no Reservation created“ @ v0.2.1.
- **Baseline / preconditions:** stejné jako TC-C08-01.
- **Test data:** B1 = `CONFIRMED` R1 `[10:00Z, 11:00Z)`; B2 = požadavek U2 na R1 `[10:30Z, 11:30Z)`. Konkrétní HTTP kód je dán přijatým kontraktem C05 (`AGENT_UNAVAILABLE` → `409`).

| # | Action / input | Expected BEFORE execution | Actual AFTER execution | Evidence |
|---|---|---|---|---|
| 1 | Smazat Reservation R1, vložit B1 `CONFIRMED` | fixtura uložena | B1 uložena (`cmw9f5w46…`) | log krok 1 |
| 2 | Nezávisle přečíst výchozí stav | právě 1 řádek: B1 `CONFIRMED [10:00,11:00)` | B1 `CONFIRMED [10:00Z,11:00Z)`, 1 řádek | log krok 2 |
| 3 | `POST /api/reservations` B2 `[10:30,11:30)` se Session U2 | `409`, `code = AGENT_UNAVAILABLE`, žádné `id` | `409 {"error":"Agent is not free in the requested time window","code":"AGENT_UNAVAILABLE"}`, bez `id` | log krok 3 |
| 4 | Přečíst committed stav po odmítnutí | B1 beze změny `CONFIRMED [10:00,11:00)`; R1 má stále právě 1 řádek (B2 neuložen); 0 překrývajících se dvojic | B1 `CONFIRMED [10:00,11:00)` beze změny, `rows=1`, `overlapPairs=0` | log krok 4 |
| 5 | Reset a zopakovat kroky 1–4, nakonec smazat data R1 | reprodukovatelný stejný výsledek | opakování: stejné `409 AGENT_UNAVAILABLE`, `rows=1`; po resetu 0 řádků | log kroky 1–5 (repeat) |

- **Final postcondition / oracle:** R1 obsahuje jen B1, `confirmedOverlapPairs(R1) = 0`.
- **Verdict:** **PASS** — 2026-11-09, viz běh níže (všech 9 kroků PASS).

**Co tyto případy nepokrývají:** souběžné konfliktní Create (pokrývá C02 scénář
„OP-03 allows at most one concurrent conflicting Create“ a C04 `QC-01`), cestu
Approve (C02 OP-05 scénáře) a Agenty s kapacitou > 1 (v systému neexistují,
`capacity = 1`).

### Krok 2 — skutečné provedení proti baseline

Provedeno 2026-11-09 (Linux, Node v22.21.1) proti `next build` + `next start` nad
čerstvou `test.db` (`db:deploy` + `db:seed`). Testovací commit `1e88185` mění jen
`scripts/`, `package.json` (nový skript) a CI; hlavička běhu potvrzuje, že `src/` a
`prisma/` odpovídají `c08-baseline`.

```text
$ DATABASE_URL="file:./test.db" npm run test:c08
C08 baseline regression test cases (TC-C08-01, TC-C08-02)
  commit       = 1e88185
  API_URL      = http://localhost:3000
  DATABASE_URL = file:./test.db
  started      = 2026-11-09T15:31:48.663Z

TC-C08-01 — positive adjacent Create keeps BR-02
  PASS  3 POST /api/reservations B2 [11:00,12:00) as another User
        actual:   201 {"id":"cmw9f5vxs0004rnna12ertw3v",...,"status":"CONFIRMED"}
  PASS  4 read committed state of R1 in the test process
        actual:   CONFIRMED [2035-03-12T10:00:00.000Z, 2035-03-12T11:00:00.000Z);
                  CONFIRMED [2035-03-12T11:00:00.000Z, 2035-03-12T12:00:00.000Z); ... overlapPairs=0
  ... (kroky 1–4 opakovány po resetu se stejným výsledkem)
  PASS  5 reset test data  — actual: 0 rows
TC-C08-01 verdict: PASS

TC-C08-02 — negative overlapping Create is rejected (BR-02)
  PASS  3 POST /api/reservations B2 [10:30,11:30) as another User
        actual:   409 {"error":"Agent is not free in the requested time window","code":"AGENT_UNAVAILABLE"}
  PASS  4 read committed state after the rejected request
        actual:   B1=CONFIRMED [2035-03-12T10:00:00.000Z, 2035-03-12T11:00:00.000Z); rows=1; overlapPairs=0
  ... (kroky 1–4 opakovány po resetu se stejným výsledkem)
TC-C08-02 verdict: PASS

C08 baseline regression PASSED          (exit code 0)
```

Stávající sada na stejné baseline a DB (stejný den): `test:c02` **PASS 31/31**,
`test:api-persistence` **PASS**, `test:c05` **PASS 20/20**, `test:architecture`
**PASS**. CI běh na PR C08: odkaz doplněn v sekci „CI“ níže.

**Limit důkazu:** jde o sekvenční požadavky jednoho klienta; souběh ověřují C02/C04
scénáře. Fixtura B1 je zapsána přímo do DB (aplikace nemá admin API pro import),
což odpovídá existujícímu C02 postupu.

### Pozorované omezení baseline (podnět CR-08)

Stejná baseline a server, Agent „Vision Analyst“ (`requiresApproval = false`),
nově registrovaný User. Příkazy (bash; v PowerShellu stejné tělo přes
`Invoke-RestMethod`):

```bash
curl -s -c jar -H 'Content-Type: application/json' \
  -d '{"name":"C08 probe","email":"c08-probe@test.local","password":"C08Probe123!"}' \
  http://localhost:3000/api/auth/register
curl -s -b jar -H 'Content-Type: application/json' \
  -d '{"agentId":"<Vision Analyst id>","startTime":"2035-03-13T10:07:13Z","endTime":"2035-03-13T10:52:41Z"}' \
  http://localhost:3000/api/reservations
curl -s -b jar -H 'Content-Type: application/json' \
  -d '{"agentId":"<Vision Analyst id>","startTime":"2035-03-14T00:00:00Z","endTime":"2035-03-17T00:00:00Z"}' \
  http://localhost:3000/api/reservations
```

| Požadavek | Pozorovaná odpověď | Uložený stav (nezávislé SQL čtení) |
|---|---|---|
| `[10:07:13Z, 10:52:41Z)` | `201 {"status":"CONFIRMED"}` | `CONFIRMED [2035-03-13T10:07:13Z, 10:52:41Z)` |
| `[2035-03-14T00:00Z, 2035-03-17T00:00Z)` (72 h) | `201 {"status":"CONFIRMED"}` | `CONFIRMED [2035-03-14T00:00Z, 2035-03-17T00:00Z)` |
| `GET /api/availability` 2035-03-15 `[10:00,11:00)` | `200 {"availability":"UNAVAILABLE"}` | — Agent blokován třemi dny jednou Reservation |

Chování je v souladu s v0.2.1 (specifikace žádnou granularitu ani maximální délku
nedefinuje), tedy nejde o defekt, ale o chybějící pravidlo — vstup pro CR-08.

### CI běh pro C08

Push větve `c08-controlled-change` (commit `650bcfe`) →
[GitHub Actions run 42646071124](https://github.com/Ten-James/swi-proj/actions/runs/42646071124):
**success**, včetně kroku „Run C08 baseline regression test cases“. Na `ubuntu-latest`
(Node 22) tedy TC-C08-01/02 nezávisle prošly proti nezměněnému produktu.

## C09 — Integration, CI and Release Record

**C08 Change Card a rozhodnutí:** [CR-08](intent-and-change.md#c08--cr-08--controlled-change-card)
— **ACCEPT, varianta A** (serverové pravidlo `BR-07` + UI nápověda). Peer review
Jamese Indráka je **PENDING**, implementace proto stojí na rozhodnutí autora a
review proběhne nad PR.

**Before / after:**

| | Before | After (release candidate) |
|---|---|---|
| Commit / tag | `61b4b4c` / `c08-baseline` | `abeb5d7` (větev `c09-cr08-slot-granularity`); tag `v0.3.0-rc.1` přijde na merge commit v `main` po schválení merge |
| Verze produktu | `0.1.0` (`package.json`, neaktualizováno od C01) | `0.3.0` |
| Specifikace | v0.2.1 (`BR-01`–`BR-06`) | v0.3 (+ `BR-07`, `REQ-13`) |
| DB schéma | 3 migrace, poslední `20261003131709_c02_authentication`, `schema.prisma` sha256 `46694d5b…` | **beze změny** (stejné migrace i hash) |
| Konfigurace | `DATABASE_URL` | `DATABASE_URL` (beze změny); verify navíc volitelně `VERIFY_DATABASE_URL`, `VERIFY_PORT` |

**Affected claims / new AC and unchanged regression basis:** nové AC-01 až AC-07
(CR-08); beze změny `BR-01`–`BR-06`, `REQ-01`–`REQ-12` a celá C02 sada.

**Changed code / data / config / ADR and justified N/A:**

| Oblast | Změna | Commit |
|---|---|---|
| Spec, verification plan, C05 DD, UC2, OP-01 karta, team approval, diagram 17 | `BR-07` / `REQ-13` a pořadí kontrol Create | `92685a6` |
| Testy (před implementací) | 6 unit případů `BR-07`, `scripts/cr08-acceptance-tests.ts` (TC-CR08-01…06) | `4c593fc` |
| `src/lib/reservation-policy.ts` | `SLOT_MINUTES`, `MAX_DURATION_MINUTES`, `isSlotAligned`, `assertSlotGranularity`, 2 kódy | `c568119` |
| `src/lib/reservation-service.ts` | 1 volání v `createReservation` za `BR-06`, před transakcí | `c568119` |
| `src/lib/api-error-response.ts` | `NOT_SLOT_ALIGNED`, `DURATION_EXCEEDED` → 400 | `c568119` |
| `src/app/reservation-app.tsx` | `step` 15 min, pevný `min` jako základ mřížky, nápověda | `c568119`, `8302d3c` |
| Automatizace a release | `scripts/verify.ts`, `scripts/release-manifest.ts`, CI na `npm run verify`, `.nvmrc`, `engines`, verze 0.3.0, README | `3b7d51f`, `da78481` |
| Repozitář | `.env` přestal být verzovaný (nález čistého checkoutu) | `abeb5d7` |
| `prisma/` (schéma, migrace, seed) | N/A — pravidlo se týká jen nových požadavků | — |
| ADR-001 / architektura | N/A — vlastník a hranice beze změny, `test:architecture` PASS | — |
| Availability, Cancel, Approve | N/A — záměrně beze změny (AC-06, Impact Matrix) | — |

`git diff c08-baseline abeb5d7 --stat -- src` = 4 soubory, +51 / −2 řádků.

**Peer review:**

| Review | Kdo | Zpochybněný předpoklad / nález | Vyřízení |
|---|---|---|---|
| Pre-review diffu C09 (AI asistent, ne člen týmu) | Claude Code (`code-review`, medium) | (1) `verify` mohl testovat cizí server, který už běžel na portu 3100; (2) manifest mohl převzít výsledek verify z jiného commitu; (3) digest buildu nesouhlasil s nahraným CI artefaktem kvůli symlinkům v `.next/node_modules` | všechny 3 opraveny v `da78481`, verify znovu PASS |
| Ruční kontrola UI (autor) | agentt015 + Claude Code | React synchronizuje atribut `value`, prohlížeč z něj počítá `step`, takže nezarovnaný čas formulář nezablokoval | opraveno pevným `min` (`8302d3c`); v prohlížeči ověřeno: 10:07 → „two nearest valid values are … 10:00 … 10:15“, 10:15 projde, interval 5 h → hláška serveru „A Reservation may last at most 4 hours“ |
| Peer review CR-08 a PR (člen týmu) | **James Indrák — PENDING** | ke zpochybnění: 4 h vs. „Data Pipeline Bot“; grandfathering starých dat; Availability bez `BR-07` | doplní reviewer |

**Testy — předem určený oracle, skutečný výsledek:**

| Test ID | Independent accepted oracle | Exact command / data | Expected | Actual | Verdict | Evidence |
|---|---|---|---|---|---|---|
| New: TC-CR08-01…06 **před implementací** | CR-08 AC-01…07 | `npm run test:cr08` na nezměněném kódu (`92685a6`, `src/` = baseline) | nové chování chybí → 02/03/04/06 FAIL, 01/05 PASS | `[10:07,10:52)` → `201 CONFIRMED`; 4:15 → `201`; `17:07+01:00` → `201`; nezarovnané u neaktivního Agenta → `404` | očekávaný **FAIL** (oracle nezávisí na novém kódu) | běh 2026-11-09, výpis níže |
| New: TC-CR08-01 | AC-01, AC-03 | `[10:00,11:00)` a `[12:00,16:00)` 2035-03-20 | `201 CONFIRMED` ×2, oba řádky v DB | `201` ×2; DB `CONFIRMED [10:00,11:00)`, `[12:00,16:00)` | **PASS** | verify `da78481`, `abeb5d7`, CI |
| New: TC-CR08-02 | AC-02 | `:07`, `:00:30`, `.001` | `400 NOT_SLOT_ALIGNED`, 0 řádků | `400 {"code":"NOT_SLOT_ALIGNED"}` ×3; 0 řádků | **PASS** | dtto |
| New: TC-CR08-03 | AC-03 | 4:15 a 72 h | `400 DURATION_EXCEEDED`, 0 řádků | `400 {"code":"DURATION_EXCEEDED"}` ×2; 0 řádků | **PASS** | dtto |
| New: TC-CR08-04 | AC-05 | `19:45+05:45`, `17:07+01:00` | `201` uloženo `14:00Z`; `400` | `201`, DB `[14:00Z,15:00Z)`; `400 NOT_SLOT_ALIGNED`; 1 řádek | **PASS** | dtto |
| New: TC-CR08-05 | AC-06 | stará nezarovnaná `PENDING_APPROVAL` + stará 72h `CONFIRMED` (přímá fixtura) | Approve `200 CONFIRMED`, Cancel `200 CANCELLED`, intervaly beze změny | přesně tak; DB `CONFIRMED [10:07,10:52)`, `CANCELLED [03-21,03-24)` | **PASS** | dtto |
| New: TC-CR08-06 | AC-07 | minulost + `:07`; `:07` na neaktivním; kontrola zarovnaného na neaktivním | `START_IN_PAST`; `NOT_SLOT_ALIGNED`; `404` | přesně tak; 0 řádků | **PASS** | dtto |
| New: unit `BR-07` | C05 DD §4 `assertSlotGranularity` | `npm run test:c05` | 26/26 (20 + 6) | 26/26; před implementací 20/26 | **PASS** | dtto |
| C08 regression TC-01 | `BR-01`, `BR-02` | `npm run test:c08` | sousední Create `201`, 2× `CONFIRMED`, 0 překryvů | shodné, opakováno po resetu | **PASS** | dtto |
| C08 regression TC-02 | `BR-02` | `npm run test:c08` | překryv `409 AGENT_UNAVAILABLE`, B2 neuložen | shodné, opakováno po resetu | **PASS** | dtto |
| Regression C02 | spec v0.2.1 | `npm run test:c02` | 31/31 beze změny skriptu | 31/31 | **PASS** | dtto |
| Regression C01, architektura, lint, typecheck, build | dřívější kontrakty | `npm run verify` | PASS | PASS | **PASS** | dtto |

Výpis z běhu nových testů proti nezměněnému kódu (tests-first, 2026-11-09):

```text
TC-CR08-02 — AC-02: unaligned minute / second / millisecond is rejected, nothing stored
  FAIL  2 POST [10:07,10:52)
        expected: 400, code NOT_SLOT_ALIGNED, no id
        actual:   201 {"id":"cmw9fdvxa0008pcna84y91dpz",...,"status":"CONFIRMED"}
TC-CR08-03 — AC-03: longer than 4 h is rejected, nothing stored
  FAIL  1 POST [12:00,16:15) (4 h 15 min)
        actual:   201 {...,"status":"CONFIRMED"}
TC-CR08-06 — AC-07: rule order BR-06 → BR-07 → BR-05
  FAIL  2 POST unaligned [10:07,11:00) on an inactive Agent
        actual:   404 {"error":"Agent not found or inactive"}
Summary: 01 PASS, 02 FAIL, 03 FAIL, 04 FAIL, 05 PASS, 06 FAIL — CR-08 acceptance FAILED
```

**Actual integration boundary and committed-state check:** HTTP → Next.js Route
Handler → `ReservationService` → SQLite v produkčním `next start`. Každý TC čte
committed řádky raw SQL přes vlastní DB spojení testovacího procesu
(`scripts/lib/db-oracle.ts`, vlastní přepis podmínky překryvu). Negativní případy
ověřují nejen HTTP kód, ale i to, že v DB nevznikl žádný řádek.

**Dependency lock + runtime + DB schema + nonsecret config:** `package-lock.json`
sha256 `310e0c69…` (od baseline se liší jen verzí 0.3.0 a `engines`; závislosti
beze změny), instalace `npm ci`; Node 22 (`.nvmrc`), lokálně v22.21.1 / npm
10.9.4, CI `ubuntu-latest`; schéma sha256 `46694d5b…`, migrace `20260915071546_init`,
`20261003121659_c02_approval_workflow`, `20261003131709_c02_authentication`;
konfigurace jen `DATABASE_URL` (soubor SQLite), žádná tajemství.

**Clean checkout / build / test / run commands and environment:**

```bash
git clone https://github.com/Ten-James/swi-proj.git && cd swi-proj
git checkout abeb5d7        # po vydání: git checkout v0.3.0-rc.1
cp .env.example .env        # volitelné
npm ci
npm run verify              # build, start, všechny testy, release/manifest.json
npm run db:deploy && npm run db:seed && npm start   # ruční spuštění (port 3000)
```

**CI job / automated script, observed result / log link:**

| Commit | Run | Výsledek | Artefakt |
|---|---|---|---|
| `da78481` | [42648005792](https://github.com/Ten-James/swi-proj/actions/runs/42648005792) | **success** — jediný krok „Verify (build + all checks)“ za 1 min 37 s | `release-candidate-da78481…` (2 850 684 B, digest `sha256:93739939…`) |
| `abeb5d7` | viz [Actions pro větev](https://github.com/Ten-James/swi-proj/actions?query=branch%3Ac09-cr08-slot-granularity) | doplní se po doběhnutí | `release-candidate-abeb5d7…` |

Lokálně (Linux, Node v22.21.1): `npm run verify` na `da78481` → **verify PASS**,
14/14 kroků, exit 0. Negativní kontrola pipeline: `VERIFY_DATABASE_URL=file:./dev.db`
→ krok „reset isolated database“ FAIL, ostatní NOT RUN, exit 1 (fail-fast a ochrana
`dev.db` fungují).

**Independent reproducer, steps, actual result and any hidden fix:**

| Pokus | Kdo / kde | Postup | Výsledek |
|---|---|---|---|
| 1 | autor (agentt015 s Claude Code), **ne nezávislý člen**; Linux, Node v22.21.1, nový adresář, `git clone` z GitHubu | `git checkout da78481`, `cp .env.example .env`, `npm ci`, `npm run verify` | verify **PASS** (14/14), ale manifest hlásil `dirty: true`: `.env` byl stále verzovaný, takže krok README změnil sledovaný soubor. **Nález → oprava `abeb5d7`** |
| 2 | autor, stejné prostředí, nový adresář | `git checkout abeb5d7`, stejné příkazy | verify **PASS** (14/14), `git status` čistý, manifest bez `dirty` |
| 3 | **James Indrák — PENDING** | jen podle README, na vlastním stroji (OS/Node doplnit) | *NOT RUN* — doplní reproduktor (čas, OS, Node, příkazy, výsledek, případný blocker) |

Limit autorské reprodukce: stejný stroj a uživatel, takže mohla pomoct teplá npm
cache nebo globální nástroje. Nezávislý pokus jiným členem je proto podmínkou pro
READY.

**Artifact identity / file / hash / tag and migration assumptions:** produktem je
Next.js build (`.next/` bez `cache`, `trace`, `diagnostics` a `node_modules`
odkazů) + `package-lock.json` + migrace. `npm run release:manifest` zapisuje
`release/manifest.json` s commitem, BUILD_ID, digestem buildu, hashi lockfile,
schématu a migrací a výsledkem verify (jen pokud patří ke stejnému commitu a buildu).
Build Next.js není bit-reprodukovatelný mezi stroji (BUILD_ID je náhodný), proto je
identitou release candidate **CI artefakt** z commitu RC a jeho manifest:
`release-candidate-<sha>` z běhu na `main` po merge, otagovaný `v0.3.0-rc.1`.
Migrace: žádná nová, `npm run db:deploy` na existující DB nic nemění.

**Recovery / rollback limitation and remaining risks:**

- *Zkouška rollbacku (provedena 2026-11-09):* DB vytvořená a naplněná buildem v0.3
  (`abeb5d7`/`da78481`, Reservation `[2035-05-01T10:00Z, 12:00Z)` vytvořená přes
  API, nezarovnaný pokus `400`) → baseline build `61b4b4c` nad stejným souborem:
  `prisma migrate status` „Database schema is up to date!“, `GET /api/reservations`
  `200` s Reservation z v0.3 a TC-C08-01/02 **PASS** (testovací skripty spuštěné z
  checkoutu v0.3 proti baseline serveru). Rollback je tedy jen výměna buildu, bez
  zásahu do dat.
- Rollback vrací chování v0.2.1: nezarovnané a dlouhé Reservation jsou znovu přijímány.
  Data vzniklá před rollbackem zůstávají platná v obou verzích.
- Přímé zápisy do DB (fixtury, Prisma Studio, SQL) `BR-07` obcházejí, protože DB
  omezení neexistuje (vědomé rozhodnutí v Impact Matrix).
- Klienti mimo UI, kteří posílají libovolné časy, dostanou `400`.
- Přetrvávající rizika z C05 (souběh stojí na SQLite v jednom procesu) se nemění.
- `npm audit` hlásí 17 zranitelností v závislostech (stav baseline, CR-08 je
  neměnil); mimo rozsah tohoto RC.

**Release candidate decision:** **CONDITIONAL** — owner agentt015, 2026-11-09.

- Splněno: všechna nová AC a regrese PASS přes skutečnou integrační hranici,
  testy prokazatelně selhaly před implementací, CI na push zelené s artefaktem,
  dva autorské čisté checkouty (druhý po opravě nálezu) PASS, rollback ověřen.
- Podmínky pro změnu na **READY:** (1) peer review CR-08 a PR od Jamese Indráka bez
  blokujícího nálezu; (2) jeho nezávislý čistý checkout podle README PASS;
  (3) merge do `main`, zelené CI na merge commitu a tag `v0.3.0-rc.1` na tomto commitu;
  (4) schválení Specification v0.3 v [team-approval.md](team-approval.md).
- Co by vedlo na **HOLD:** FAIL nezávislého checkoutu nebo nález v review, který
  zpochybní AC (např. 4 h nestačí pro „Data Pipeline Bot“ → zpět do C08, varianta D).
- Zelené CI samo o sobě není souhlas s nasazením.
