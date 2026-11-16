# C04 — Quality & Measurement

Vstup: specifikace v0.2.1 ([specification.md](../specification.md) – `BR-01`,
`BR-02`, `BR-04`, `REQ-07`, `REQ-10`), architektura C03
([architecture.md](../c03/architecture.md),
[ADR-001](../c03/adr/ADR-001-reservation-lifecycle-owner.md)) a detailní návrh C05
([detailed-design.md](../c05/detailed-design.md)).

Dokument odpovídá na C06 nález **F1** ([review.md](../review.md)): v projektu
chyběl dohledatelný řetězec *quality concern → evaluable criterion → measurement
→ trade-off/decision*.

## 1. Quality concern

**Concern:** integrita dat pod souběhem (reliability / correctness under
concurrency).

**Proč právě tento:** jádrem systému je exkluzivní Resource (Agent). Chyba v
souběhu by porušila hlavní business invariant `BR-02` – dva `CONFIRMED`
překrývající se intervaly téhož Agenta – a to bez jakékoli chyby viditelné
uživateli. Je to zároveň architektonický driver č. 1 z C03 a „zbývající riziko“
C05 (správnost stojí na serializaci zápisů SQLite v jednom procesu).

**Related requirement(s):** `REQ-07` (souběžné Create), `REQ-10` (souběžné
Approve), `BR-02` (exkluzivita Agenta), `BR-04` (limit aktivních Reservation –
„Concurrent requests must not allow a User to exceed `N`“).

**Stakeholder dopad:**

| Stakeholder | Co se stane při porušení |
|---|---|
| User | dvě potvrzené Reservation téhož Agenta; jedna z nich nebude reálně obsloužena |
| Admin | schválí žádost, která po souběžném schválení jiné žádosti porušuje `BR-02` |
| Provoz | nekonzistentní stav v DB, který nelze opravit bez ručního zásahu |

**Mimo rozsah C04:** výkon při vysoké zátěži, dostupnost, bezpečnost
(login throttle je pokryt v code review v0.2.1). Latence je sledována jen jako
cena za zvolené řešení (§ 5), ne jako samostatný concern.

## 2. Evaluable criteria

Kritérium je formulováno tak, aby šlo rozhodnout PASS/FAIL bez interpretace.

| ID | Criterion | Oracle (PASS právě když) |
|---|---|---|
| `QC-01` | Souběžné konfliktní Create (`REQ-07`, `BR-02`) | z `K` současných `POST /api/reservations` různých Userů na stejného Agenta (`requiresApproval = false`) a stejný interval: právě 1× `201 CONFIRMED`, `K-1`× `409 AGENT_UNAVAILABLE`, 0× `5xx`; v DB existuje pro tento interval právě 1 `CONFIRMED` |
| `QC-02` | Souběžné konfliktní Approve (`REQ-10`, `BR-02`) | ze 2 současných `PATCH …/decision APPROVE` na dvě překrývající se `PENDING_APPROVAL`: právě 1× `200`, 1× `409`; neúspěšná zůstává `PENDING_APPROVAL` |
| `QC-03` | Souběžné Create proti limitu (`BR-04`) | User s `maxReservations = N` a `N-1` aktivními Reservation pošle současně `K` nepřekrývajících se Create: právě 1× `201`, `K-1`× `403 QUOTA_EXCEEDED`; v DB má User právě `N` aktivních |
| `QC-04` | Invariant v DB po měření | dotaz nad tabulkou Reservation vrátí 0 dvojic `CONFIRMED` stejného Agenta s `a.startTime < b.endTime AND a.endTime > b.startTime` |

**Cílová hodnota:** 0 porušení ve všech opakováních. Jakékoli jedno porušení =
FAIL (invariant není statistická veličina).

**Parametry měření:** `K = 2` (stávající C02 scénáře) a `K = 10` (rozšířené
měření), `R = 5` opakování pro každé `K`.

## 3. Measurement — podmínky a protokol

### 3.1 Kontext měření

Měření musí odpovídat runtime, který ADR-001 deklaruje jako produkční tvar:

| Podmínka | Hodnota |
|---|---|
| Baseline | Specification v0.2.1, commit uvedený v § 4 |
| Runtime | `npm run build` + `npm run start` (ne `next dev`) – jeden Node.js proces |
| Persistence | SQLite přes `@prisma/adapter-better-sqlite3`, čistá DB (`db:deploy` + `db:seed`) |
| Klient | tentýž stroj, `Promise.all` nad `fetch` – požadavky odchází bez čekání na odpověď |
| Čas | `startTime` v budoucnosti (`BR-06`), interval s explicitním `Z` (`BR-01`) |
| Izolace | každý scénář používá vlastní Agenty / Usery, aby měření neovlivnila předchozí data |

Proč tento kontext: pravidlo `BR-02` drží transakce v `ReservationService`
(`createReservation`, `decideReservation`); jejich korektnost pod souběhem závisí
na tom, že SQLite serializuje zápisové transakce jednoho procesu. Měření proti
`next dev` nebo proti mockované persistenci by tuto vlastnost neměřilo.

### 3.2 Protokol

1. Připravit čistou DB: `npm run db:deploy && npm run db:seed`.
2. Spustit `npm run build && npm run start`, počkat na `GET /api/agents` → 200.
3. Pro každé `K ∈ {2, 10}` a každé opakování `r ∈ 1..R`:
   1. vytvořit `K` Userů (registrace + Session) a dedikovaného Agenta;
   2. odeslat `K` Create současně (`QC-01`), zaznamenat HTTP status a `code`;
   3. pro `QC-02` vytvořit 2 překrývající se `PENDING_APPROVAL` a odeslat 2
      Approve současně;
   4. pro `QC-03` připravit Usera s `N-1` aktivními a odeslat `K` Create současně.
4. Po všech opakováních vyhodnotit `QC-04` dotazem nad DB.
5. Zaznamenat výsledky do § 4; při FAIL zachovat DB soubor jako evidence.

### 3.3 Mapování na existující testy

| Criterion | Pokrytí dnes | Kde |
|---|---|---|
| `QC-01` (`K = 2`) | YES | `scripts/c02-verification.ts` – „OP-03 allows at most one concurrent conflicting Create“ |
| `QC-02` | YES | `scripts/c02-verification.ts` – „REQ-10 allows at most one conflicting concurrent approval“ |
| `QC-01` (`K = 10`) | YES | `scripts/c02-verification.ts` – „C04 QC-01 10 concurrent conflicting Creates confirm exactly one (x5)“ |
| `QC-03` | YES | `scripts/c02-verification.ts` – „C04 QC-03 10 concurrent Creates cannot exceed the BR-04 limit (x5)“ |
| `QC-04` | YES | `scripts/c02-verification.ts` – „C04 QC-04 database holds no overlapping CONFIRMED Reservations“ (celá DB, po všech scénářích) |

Unit testy C05 (`npm run test:c05`) tento concern záměrně nepokrývají – policy je
čistá funkce a souběh vzniká až v transakci (C05 § 10, collaboration řádek).

## 4. Výsledky měření

### 4.1 Rozšířené měření (2026-11-02)

Běh `npm run test:c02` 2026-11-02 13:40 UTC na commitu `046bc8c`: čistá SQLite
(`db:deploy` + `db:seed`), `next build` + `next start` (jeden proces, port 3100),
`API_URL=http://localhost:3100`. Výsledek sady: **34/34 PASS**, `C02 verification PASSED`.

| Criterion | `K` | Opakování | Očekávání | Pozorováno | Výsledek |
|---|---|---|---|---|---|
| `QC-01` | 10 | 5 | 1× 201, 9× 409 `AGENT_UNAVAILABLE`, 0× 5xx; 1 `CONFIRMED` v DB | ve všech 5 opakováních | **PASS** |
| `QC-03` | 10 | 5 | 1× 201, 9× 403 `QUOTA_EXCEEDED`; User má právě `N` aktivních | ve všech 5 opakováních | **PASS** |
| `QC-04` | – | 1 | 0 dvojic překrývajících se `CONFIRMED` v celé DB | 0 dvojic | **PASS** |
| `QC-01` | 2 | 1 | `[201, 409]` | `[201, 409]` | **PASS** |
| `QC-02` | 2 | 1 | `[200, 409]` | `[200, 409]` | **PASS** |

### 4.2 Původní měření (2026-10-19)

Zdroj: zaznamenané běhy C02 sady ([evidence-and-evolution.md](../evidence-and-evolution.md#code-review-fixes--specification-baseline-v021)),
čistá SQLite, `next build` + `next start`, dva běhy po sobě: `QC-01` a `QC-02`
pro `K = 2` **PASS**.

**Interpretace:** při 10 souběžných požadavcích v pěti opakováních nevzniklo
žádné porušení `BR-02` ani `BR-04` a databáze neobsahuje překrývající se
`CONFIRMED`. Kritéria `QC-01` až `QC-04` platí v deklarovaném kontextu (jeden
proces, SQLite). Neplatí to automaticky pro nasazení s více procesy (§ 6).

## 5. Trade-off

Integritu pod souběhem lze zajistit třemi způsoby:

| Varianta | Integrita | Cena |
|---|---|---|
| **A — serializované transakce SQLite v jednom procesu** (současný stav, ADR-001) | drží, dokud běží jeden proces s jednou DB | zápisy se řadí za sebe → propustnost Create/Approve je omezena; nelze horizontálně škálovat |
| B — DB constraint (exclusion / unique přes sloty) | drží i při více procesech | SQLite nemá exclusion constraint; vyžaduje změnu DB (PostgreSQL) nebo diskretizaci intervalů, což mění `BR-01` |
| C — optimistický zápis + retry při konfliktu | drží s více procesy, pokud DB poskytuje serializable izolaci | složitější service, nové chybové stavy (vyčerpané retry), potřeba testovat retry cesty |

Cena varianty A se projeví latencí při souběhu. V měřeném rozsahu (`K ≤ 2`, lokální
stroj) nebyla latence problémem; projekt nemá požadavek na propustnost, který by
A vylučoval (C03 driver list neobsahuje škálování).

## 6. Engineering decision

**Rozhodnutí:** ponechat variantu **A** (serializované transakce v jednom
procesu, ADR-001) a **neměnit kód**.

**Proč odpovídá výsledku měření:** všechna kritéria `QC-01`–`QC-04` prošla i pro
`K = 10` v pěti opakováních; varianta A tedy v deklarovaném kontextu splňuje
concern bez dodatečných zámků nebo retry. Změnu by vyžádal až některý z triggerů
níže.

**Akce:**

| # | Akce | Criterion | Stav |
|---|---|---|---|
| 1 | Rozšířit C02 scénář souběžného Create na `K = 10`, `R = 5` | `QC-01` | DONE – test napsán |
| 2 | Přidat scénář souběžného Create proti limitu `BR-04` | `QC-03` | DONE – test napsán |
| 3 | Přidat přímou kontrolu invariantu nad DB na konci C02 sady | `QC-04` | DONE – test napsán |
| 4 | Spustit `npm run test:c02` podle § 3 a doplnit výsledky do § 4 a evidence | všechny | DONE – 2026-11-02, 34/34 PASS |

**Podmínky přehodnocení (trigger na variantu B/C):**

- kterékoli měření `QC-01`–`QC-04` skončí FAIL;
- nasazení s více procesy aplikace nebo jinou DB než SQLite (stejný trigger jako
  ADR-001 a C05 „Remaining design risk“);
- vznikne požadavek na propustnost Create/Approve.

## 7. Traceability

| Requirement / rule | Concern | Criterion | Measurement | Design owner | Decision |
|---|---|---|---|---|---|
| `REQ-07`, `BR-02` | integrita pod souběhem | `QC-01`, `QC-04` | C02 „OP-03 … concurrent conflicting Create“, „C04 QC-01“, „C04 QC-04“ | `ReservationService.createReservation` (C05 § 7) | A |
| `REQ-10`, `BR-02` | integrita pod souběhem | `QC-02`, `QC-04` | C02 „REQ-10 … concurrent approval“ | `ReservationService.decideReservation` (C05 § 6) | A |
| `BR-04` | integrita pod souběhem | `QC-03` | C02 „C04 QC-03“ | `createReservation` + `assertWithinQuota` | A |

## 8. Zbývající riziko

- `K = 10` neprokazuje chování pod libovolnou zátěží; prokazuje, že serializace
  zápisů v deklarovaném kontextu drží i při desetinásobném souběhu.
- Měření běží na jednom stroji; neměří síťové zpoždění ani více instancí – to je
  v souladu s ADR-001, ale nepřenositelné na jiné nasazení.
- `QC-04` přes HTTP statusy nepozná chybu, kdy by API vrátilo `409`, ale zápis
  přesto proběhl; proto existuje přímá kontrola DB (akce 3).
