# C06 — Assessment Form (CZ)

## Projekt

```text
Hodnotící tým: Parking reservation system (Systém pro rezervaci parkovacích míst) - JEC0014, TOK0030, SIK0224
Hodnocený tým: swi-proj - IND0040, PRO0458, KOL0603, MER0126 
Projekt: AI Agent Reservation System
Assessed commit/tag: aktuální repository HEAD f200832f6d67f9f1a5d1c848b73bf5d616232724; exact tag není přítomen; dokumentace uvádí jiné baseline/tag hodnoty
Datum: 2026-10-24
```

## Stavy

`YES / PARTLY / NO / N/A`

Každý řádek musí obsahovat Evidence.

## Baseline

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| B1 Stejná identifikovaná baseline pro docs/code/tests | PARTLY | Evidence: aktuální repository HEAD je `f200832f6d67f9f1a5d1c848b73bf5d616232724` bez exact tagu, zatímco `docs/evidence-and-evolution.md` uvádí `b107a9d` / `c02-baseline-v0.2`, `docs/c03/checklist.md` uvádí `4669362` / `c03-architecture` a C05 evidence odkazuje na `c05-detailed-design`. `git status --short` byl čistý, ale dokumentace neidentifikuje aktuální HEAD jako jednu společnou assessed baseline. |
| B2 Relevantní produkt nebo testy lze spustit | YES | Evidence: v izolovaném SQLite `DATABASE_URL=file:/tmp/c06-swi-proj-test.db` byly provedeny migrace a seed, aplikace byla spuštěna na `http://localhost:3000` a readiness `GET /api/agents` vrátil čtyři seeded agenty. `npm run test:api-persistence` skončil `C01 API persistence spike PASSED` a `npm run test:c02` skončil `C02 verification PASSED`; testovací data byla uklizena, server zastaven a assessed-project working tree zůstal čistý. |

## C02 — Engineering Specification

Vybraná operace: Create Reservation (OP-01)  
Vybraný business rule / invariant: BR-02 — dvě `CONFIRMED` Reservation stejného Agenta se nesmí překrývat.

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| R1 Operation: input + precondition + postcondition/state | YES | Evidence: `docs/c02/operations/op-01-create-reservation.md` specifikuje přihlášeného Usera, aktivního Agenta, `startTime < endTime`, volný interval, limit a výsledek `CONFIRMED` nebo `PENDING_APPROVAL`; `src/app/api/reservations/route.ts` parsuje `agentId`, `startTime`, `endTime`, poznámku a vrací ID, Agenta a stav. |
| R2 Business rule/invariant je jednoznačný | YES | Evidence: `docs/specification.md` a `docs/c02/operations/op-01-create-reservation.md` definují BR-02 přes překryv potvrzených intervalů; `docs/c05/detailed-design.md` uvádí ostré hranice `existing.start < requested.end` a `existing.end > requested.start`. |
| R3 Operation/rule je konzistentní se state modelem | YES | Evidence: `docs/consistency-notes.md` popisuje přímé `[none] → CONFIRMED/PENDING_APPROVAL` a pouze `CONFIRMED` blokuje agenta; `src/lib/reservation-service.ts` vytváří stav přes `initialStatus` a kontroluje jen překryv `CONFIRMED`. |
| R4 Implementace odpovídá specifikované semantics | PARTLY | Evidence: `src/lib/reservation-service.ts` provádí transakci, kontrolu agenta, overlap a kvóty a `src/lib/reservation-policy.ts` definuje `initialStatus`/hranice. Současně `docs/team-approval.md` ponechává baseline v0.2.1 (BR-06, offsety, limit poznámky) neschválenou, přestože tyto změny jsou v implementaci a dokumentované jako aktuální. Shoda s přesně schválenou baseline proto není jednoznačná. |
| R5 Existuje vhodná verification evidence | YES | Evidence: `npm run test:c02` skutečně proběhl proti lokální disposable aplikaci a skončil `C02 verification PASSED`; zahrnul OP-01 Create, BR-02 overlap, half-open boundaries, souběžný Create a recheck overlap při Admin approval. `npm run test:api-persistence` navíc ověřil, že API ID a uložený DB záznam odpovídají. Historické výsledky v `docs/evidence-and-evolution-c02.md` tak mají aktuální opakovatelnou podporu pro vybraný C02 slice. |

## C03 — Architecture

Vybraná responsibility: Reservation Service jako jediný vlastník lifecycle změn.  
Vybraná interaction: Admin Approve s konfliktem vzniklým během čekání.  
Vybrané ADR/decision: ADR-001 — Reservation lifecycle owner.

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| A1 Responsibility + owner jsou explicitní | YES | Evidence: `docs/c03/architecture.md` v C2 uvádí lifecycle, overlap, approval, expiration a cancel responsibilities; `docs/c03/adr/ADR-001-reservation-lifecycle-owner.md` rozhoduje pro in-process `Reservation Service`. |
| A2 Skutečný code ownership odpovídá architektuře | YES | Evidence: `src/lib/reservation-service.ts` obsahuje `createReservation`, `cancelReservation`, `decideReservation`, expiraci i writes; `scripts/architecture-check.ts` kontroluje mutace mimo tento soubor a vyžaduje transakci. |
| A3 Dynamic interaction odpovídá skutečnému call path | YES | Evidence: sekvence v `docs/c05/detailed-design.md` vede `DecisionRouteHandler → ReservationService → ReservationPolicy → Prisma tx → ApiErrorResponse`; `src/app/api/reservations/[id]/decision/route.ts` autentizuje Admina a volá `decideReservation`, která čte Agenta, hledá overlap a mapuje chybu přes adapter. Aktuální `npm run test:c02` navíc prošel scénářem `OP-05 rechecks overlap that appeared while waiting`. |
| A4 ADR/decision odpovídá současné implementaci | YES | Evidence: ADR-001 volí modulární monolit s jediným Reservation Service; současný `src/lib/reservation-service.ts` používá Prisma transakce a route handlery jsou adaptéry. |

## C04 — Quality & Measurement

Quality concern: není dohledán C04 artifact  
Criterion: není dohledán evaluovatelný criterion

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| Q1 Criterion je skutečně evaluable | NO | Evidence: v dodaném stromu `docs/` není C04 dokument ani jasně označený quality concern/criterion; `README.md` odkazuje na C02/C03/C05, nikoli na C04 evidence. |
| Q2 Measurement měří criterion ve správném contextu | NO | Evidence: nebyl nalezen C04 measurement/protokol s podmínkami a výsledkem. Historické PASS tabulky v `docs/evidence-and-evolution*.md` jsou funkční/verification evidence, ne měření konkrétního C04 quality criterion. |
| Q3 Decision odpovídá výsledku měření | NO | Evidence: bez identifikovaného C04 criterion a measurement nelze ověřit trade-off ani engineering decision; žádný takový C04 decision artifact nebyl v dodaném projektu nalezen. |

## C05 — Detailed Design & Unit Verification

Vybraná software unit: čistý modul `src/lib/reservation-policy.ts`

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| D1 Design intent je explicitní a pochopitelný | YES | Evidence: `docs/c05/detailed-design.md` definuje odpovědnosti policy, contracts, failure codes, čisté funkce a rozhodovací tabulky Cancel/Decision. |
| D2 DD odpovídá skutečné implementaci | YES | Evidence: `src/lib/reservation-policy.ts` obsahuje `overlapBounds`, `initialStatus`, `assertWithinQuota`, `planCancel`, `planDecision`, `assertCanConfirm` a `ReservationRuleViolation` popsané v `docs/c05/detailed-design.md`; service skutečně policy volá. |
| D3 Unit/component tests jsou odvoditelné z DD | YES | Evidence: tabulka §10 v `docs/c05/detailed-design.md` mapuje DD elementy na případy v `scripts/c05-unit-tests.ts`; testy pokrývají overlap, quota, cancel, decision, confirmation a BR-06. |
| D4 Relevantní branches/boundaries/states/failures jsou ověřeny | YES | Evidence: `scripts/c05-unit-tests.ts` skončil `C05 unit tests PASSED: 20/20` a pokryl hranice intervalů, quota, terminální stavy, expiraci, invalid state, unauthorized actor a inactive/overlap. `npm run test:c02` dále aktuálně prošel boundary, concurrent Create, pending approval, expiration a decision recheck scénáře. |
| D5 Vybraný test má smysluplný oracle/expected result | YES | Evidence: testy používají explicitní očekávání (`true/false`, stavové výsledky a `ReservationRuleCode`) odvozená z BR-01–BR-06 a REQ-08–REQ-12, např. `cancel: cancellation exactly at startTime is rejected` v `scripts/c05-unit-tests.ts`. |

## Candidate findings

### F1

```text
Source: C04 requirement / project documentation
Engineering claim: Projekt má dodat quality concern → evaluable criterion → measurement/evidence → trade-off/decision.
Expected: V `docs/` je dohledatelný vybraný C04 concern, criterion, measurement za deklarovaných podmínek a navazující decision.
Observed: Dodaný strom `docs/` obsahuje C02, C03 a C05 materiály, ale žádný C04 artifact; `README.md` C04 neodkazuje.
Evidence: `review-kit/requirements.html` §4; adresář `input/swi-proj/docs/`; `README.md`; `docs/evidence-and-evolution*.md`.
Verification performed: Statická inventura dokumentace a porovnání s požadovaným řetězcem C04; schválené C05 a C03 checks se C04 evidence netýkaly.
Result: VERIFIED FINDING
```

### F2

```text
Source: C02 baseline governance
Engineering claim: Dokumentace, code a tests jsou hodnoceny proti jedné konkrétní baseline.
Expected: Jeden ověřitelný commit/tag společný pro docs, code a tests.
Observed: Aktuální HEAD je `f200832f6d67f9f1a5d1c848b73bf5d616232724` bez exact tagu, zatímco dokumentace uvádí `b107a9d`/`c02-baseline-v0.2`, `4669362`/`c03-architecture` a `c05-detailed-design`.
Evidence: `docs/evidence-and-evolution.md`; `docs/c03/checklist.md`; C05 část `docs/evidence-and-evolution.md`; read-only `git rev-parse HEAD` a `git describe --tags --exact-match`.
Verification performed: Ověřen aktuální HEAD, exact tag (žádný) a čistý `git status --short`; dokumentace stále neukazuje na aktuální assessed commit.
Result: VERIFIED FINDING
```

### F3

```text
Source: C02 baseline governance
Engineering claim: Implementace a evidence odpovídají přijaté specifikaci.
Expected: Behavior hodnocené baseline je schválený a jednoznačně identifikovaný.
Observed: `docs/team-approval.md` má pro v0.1, v0.2 i v0.2.1 nezaškrtnutý status; současně `src/lib/request-body.ts` a `src/lib/reservation-policy.ts` implementují v0.2.1 změny a evidence je popisuje jako aktuální.
Evidence: `docs/team-approval.md`; `docs/evidence-and-evolution.md`; `src/lib/request-body.ts`; `src/lib/reservation-policy.ts`.
Verification performed: Statické porovnání schvalovacího dokumentu s implementovanými pravidly BR-06, explicitním offsetem a validací intervalu.
Result: VERIFIED FINDING
```

| Finding | ACCEPTED / REJECTED / DEFERRED | Reason/evidence | Action / no-change |
|---|---|---|---|
| F1 | PENDING — owner response not provided | Vlastník musí dodat nebo odkázat C04 concern, criterion, measurement a decision; z projektu je nelze ověřit. | Vyžaduje se reakce vlastníka a případné doplnění C04 evidence; bez ní nelze Q1–Q3 povýšit z NO. |
| F2 | PENDING — owner response not provided | Aktuální HEAD je ověřitelný, ale dokumentace uvádí více historických baseline/tagů a neidentifikuje jednu společnou assessed baseline. | Vyžaduje se potvrzení vlastníka, která baseline je hodnocená, a doložení shody docs/code/tests. |
| F3 | PENDING — owner response not provided | Tým approval dokument výslovně ponechává baseline v0.1–v0.2.1 neschválené, přesto je v0.2.1 implementováno. | Vyžaduje se potvrzení vlastníka, která baseline je schválená, nebo oddělení schválené specifikace od novějšího kódu. |
