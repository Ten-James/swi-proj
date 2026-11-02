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
| `QC-03` | Souběžné Create proti limitu (`BR-04`) | User s `maxReservations = N` a `N-1` aktivními Reservation pošle současně `K` neprekrývajících se Create: nejvýše 1× `201`, zbytek `403 QUOTA_EXCEEDED`; v DB má User nejvýše `N` aktivních |
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
| `QC-01` (`K = 10`) | NO | – (rozšíření C02 skriptu, viz § 6) |
| `QC-03` | NO | „BR-04 counts PENDING_APPROVAL …“ ověřuje limit jen sekvenčně |
| `QC-04` | PARTLY | nepřímo přes HTTP statusy; přímý dotaz nad DB zatím neexistuje |

Unit testy C05 (`npm run test:c05`) tento concern záměrně nepokrývají – policy je
čistá funkce a souběh vzniká až v transakci (C05 § 10, collaboration řádek).

## 4. Výsledky měření

Zdroj: zaznamenané běhy C02 sady ([evidence-and-evolution.md](../evidence-and-evolution.md#code-review-fixes--specification-baseline-v021)),
2026-10-19, čistá SQLite, `next build` + `next start`, dva běhy po sobě.

| Criterion | `K` | Opakování | Očekávání | Pozorováno | Výsledek |
|---|---|---|---|---|---|
| `QC-01` | 2 | 2 | `[201, 409]` | `[201, 409]` v obou bězích | **PASS** |
| `QC-02` | 2 | 2 | `[200, 409]` | `[200, 409]` v obou bězích | **PASS** |
| `QC-01` | 10 | – | 1× 201, 9× 409, 0× 5xx | neměřeno | **OPEN** |
| `QC-03` | 10 | – | ≤ 1× 201 | neměřeno | **OPEN** |
| `QC-04` | – | – | 0 dvojic | neměřeno přímo | **OPEN** |

**Baseline měření:** commit `d2b1784` (main, obsahuje v0.2.1 opravy z PR #13).
Kód `ReservationService` se mezi během 2026-10-19 a touto baseline neměnil.

**Interpretace:** pro minimální souběh (`K = 2`) kritérium platí pro Create i
Approve. Tvrzení „`BR-02` drží pod souběhem obecně“ zatím podložené **není** –
dvojice požadavků může náhodně doběhnout sekvenčně, takže `K = 2` je slabé
měření. `BR-04` pod souběhem není ověřeno vůbec.

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
procesu, ADR-001) a **neměnit kód**. Rozšířit měření, protože dnešní evidence
(`K = 2`) nestačí na obecné tvrzení.

**Proč odpovídá výsledku měření:** všechna provedená měření prošla a žádné
nevykázalo porušení `BR-02`; zároveň chybí evidence pro vyšší souběh a pro
`BR-04`, takže rozhodnutí je podmíněné, ne konečné.

**Akce:**

| # | Akce | Criterion | Stav |
|---|---|---|---|
| 1 | Rozšířit C02 scénář souběžného Create na `K = 10`, `R = 5` | `QC-01` | TODO |
| 2 | Přidat scénář souběžného Create proti limitu `BR-04` | `QC-03` | TODO |
| 3 | Přidat přímou kontrolu invariantu nad DB na konci C02 sady | `QC-04` | TODO |
| 4 | Doplnit výsledky do § 4 a evidence | všechny | TODO |

**Podmínky přehodnocení (trigger na variantu B/C):**

- kterékoli měření `QC-01`–`QC-04` skončí FAIL;
- nasazení s více procesy aplikace nebo jinou DB než SQLite (stejný trigger jako
  ADR-001 a C05 „Remaining design risk“);
- vznikne požadavek na propustnost Create/Approve.

## 7. Traceability

| Requirement / rule | Concern | Criterion | Measurement | Design owner | Decision |
|---|---|---|---|---|---|
| `REQ-07`, `BR-02` | integrita pod souběhem | `QC-01`, `QC-04` | C02 „OP-03 … concurrent conflicting Create“ (+ akce 1, 3) | `ReservationService.createReservation` (C05 § 7) | A, podmíněně |
| `REQ-10`, `BR-02` | integrita pod souběhem | `QC-02`, `QC-04` | C02 „REQ-10 … concurrent approval“ | `ReservationService.decideReservation` (C05 § 6) | A |
| `BR-04` | integrita pod souběhem | `QC-03` | chybí (akce 2) | `createReservation` + `assertWithinQuota` | A, neověřeno |

## 8. Zbývající riziko

- Bez akcí 1–3 je tvrzení o integritě pod souběhem podložené jen minimálním
  měřením (`K = 2`).
- Měření běží na jednom stroji; neměří síťové zpoždění ani více instancí – to je
  v souladu s ADR-001, ale nepřenositelné na jiné nasazení.
- `QC-04` přes HTTP statusy nepozná chybu, kdy by API vrátilo `409`, ale zápis
  přesto proběhl; proto je potřeba přímá kontrola DB (akce 3).
