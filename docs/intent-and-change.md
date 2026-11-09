# Rámec projektu

## Doména rezervace
Rezervujeme výpočetní čas (compute time) AI agentů. Administrátor spravuje katalog dostupných AI agentů (přidává, upravuje, deaktivuje), zatímco uživatelé si u konkrétního agenta rezervují časový slot, po který budou mít k jeho výpočetnímu výkonu exkluzivní přístup. Klíčové omezení domény: každý uživatel může mít najednou pouze omezený počet aktivních rezervací — tzv. max rezervací.

## Účel
Systém slouží uživatelům (např. vývojářům, analytikům), kteří potřebují rezervovaně a bez kolizí využívat výpočetní čas sdílených AI agentů s omezenou kapacitou, a administrátorům, kteří agenty do systému přidávají a spravují jejich dostupnost. Cílem je zajistit spravedlivé a předvídatelné sdílení omezené výpočetní kapacity agentů mezi více uživateli a zabránit tomu, aby jeden uživatel zablokoval kapacitu nadměrným počtem souběžných rezervací.

## Uživatelé / Zainteresované strany
- **Uživatel (User)** – vyhledává dostupné AI agenty, vytváří, upravuje a ruší vlastní rezervace výpočetního času.
- **Administrátor** – přidává a spravuje AI agenty (jejich dostupnost, kapacitu, deaktivaci), spravuje uživatele a globální nastavení (např. hodnotu limitu max rezervací).
- **Schvalovatel (Approver)** *(až ve změně v0.2, může splývat s administrátorem)* – schvaluje nebo zamítá rezervace u agentů, které schválení vyžadují.

## Klíčové pojmy
- **Reservation (rezervace)** – požadavek konkrétního uživatele na exkluzivní využití výpočetního času konkrétního AI agenta v daném časovém intervalu.
- **Resource / AI Agent (zdroj)** – rezervovatelný AI agent se svým výpočetním výkonem/kapacitou, vlastním rozvrhem dostupnosti a stavem (aktivní/neaktivní), spravovaný administrátorem.
- **User (uživatel)** – osoba se svým účtem, rolí (user/admin) a vlastním limitem aktivních rezervací.
- **Availability window (okno dostupnosti)** – časové období, kdy je daný agent vůbec nabízen k rezervaci (např. mimo plánovanou údržbu).

## Klíčové operace
- Vytvořit rezervaci
- Potvrdit rezervaci automaticky při úspěšném vytvoření
- Schválit / zamítnout rezervaci u agentů vyžadujících schválení (změna v0.2)
- Zrušit rezervaci
- Zkontrolovat dostupnost

## Perzistentní stav
**Reservation**: id, user_id, agent_id (resource_id), start_time, end_time, status (v0.1: CONFIRMED / CANCELLED; v0.2 navíc PENDING_APPROVAL / REJECTED / EXPIRED), created_at, updated_at, účel/poznámka (volitelné).

**Resource (AI Agent)**: id, název, popis/typ agenta, výpočetní kapacita, availability window, stav (aktivní/neaktivní), owner/admin_id, vytvořen_at.

## Operace měnící stav
V baseline v0.1 systém při Create ihned ověří všechna pravidla. Úspěšný požadavek uloží rovnou jako `CONFIRMED`; neúspěšný požadavek neuloží vůbec. Budoucí `CONFIRMED` rezervace může přejít do `CANCELLED`. Změna v0.2 přidává pro vybrané agenty přechody `PENDING_APPROVAL → CONFIRMED / REJECTED / EXPIRED / CANCELLED`.

## Obecné byznys pravidlo
Potvrzené rezervace (CONFIRMED) stejného zdroje (agenta) se nesmí časově překrývat.

## Doménově specifické pravidlo
Jeden uživatel může mít současně maximálně N aktivních budoucích rezervací ve stavu `CONFIRMED` napříč všemi AI agenty; N je konfigurovatelná hodnota nastavená administrátorem. Ve v0.2 se do limitu započítává také `PENDING_APPROVAL`. Pokus o vytvoření další rezervace nad tento limit je systémem odmítnut, dokud uživatel některou ze svých rezervací nezruší nebo dokud nějaká neskončí.

## Předpoklad
Předpokládáme, že limit max rezervací (N) je stejný pro všechny uživatele a nastavuje se globálně administrátorem, nikoli individuálně per uživatel nebo per agent — toto ale zatím nebylo s byznysem ověřeno.

## Přijaté rozhodnutí pro baseline v0.1
Rezervace se po splnění limitu, ověření intervalu, aktivity agenta a neexistence kolize potvrdí automaticky bez lidského zásahu. Ruční schválení se objevuje až jako povinně analyzovaná změna v0.2 a pouze pro agenty, kteří jej vyžadují.

---

## C08 / CR-08 — Controlled Change Card

**Název:** časová granularita a maximální délka Reservation.
**Stav karty:** rozhodnuto ACCEPT (varianta A), peer review **PENDING** — viz
„Peer reviewer“ níže. Test cases a výsledky:
[evidence-and-evolution.md — C08](evidence-and-evolution.md#c08--controlled-change-evidence).

**Change source and concrete project need:**
Administrátor (správce kapacity Agentů) a Useři, kteří nedostanou slot. Účel
systému je „spravedlivé a předvídatelné sdílení omezené výpočetní kapacity“ a
„zabránit tomu, aby jeden uživatel zablokoval kapacitu“ (výše, *Účel*). `BR-04` ale
omezuje jen **počet** aktivních Reservation, ne jejich **délku**. Jeden User tak může
exkluzivního Agenta (`capacity = 1`) zablokovat na dny jedinou Reservation. Libovolné
časy (sekundy, minuty jako `10:07:13`) navíc tříští rozvrh Agenta na krátké mezery,
do kterých se už nikdo nevejde, a Gantt přehled je špatně čitelný. Požadavek
správce: „Rezervace ať jdou po čtvrthodinách a jedna ať netrvá déle než 4 hodiny.“

**Before commit/tag, accepted spec/BR/ADR, schema and config:**
`c08-baseline` = `61b4b4c`; [Specification v0.2.1](specification.md) `BR-01`,
`BR-02`, `BR-04`, `BR-06`, OP-01 `REQ-01`–`REQ-04`;
[ADR-001](c03/adr/ADR-001-reservation-lifecycle-owner.md) a
[C05 DD](c05/detailed-design.md); schéma `20261003131709_c02_authentication`;
jediná konfigurace `DATABASE_URL` (bez tajných hodnot).

**Previous observable behavior / limitation:**
`BR-01` vyžaduje jen platné instanty s offsetem/`Z` a `startTime < endTime`. Na
baseline bylo skutečně pozorováno: `[10:07:13Z, 10:52:41Z)` → `201 CONFIRMED` a
72hodinová Reservation → `201 CONFIRMED`, po které je Agent tři dny `UNAVAILABLE`
([záznam](evidence-and-evolution.md#pozorované-omezení-baseline-podnět-cr-08)).
Jde o chování v souladu se specifikací, tedy o chybějící pravidlo, ne o defekt.

**New intended behavior, scope and explicit out-of-scope:**
Nové pravidlo `BR-07` / `REQ-13` (Specification v0.3) pro **vytvoření** Reservation:

- `startTime` i `endTime` leží na 15minutové mřížce v UTC (minuty ∈ {0, 15, 30, 45},
  sekundy a milisekundy = 0). Protože jsou všechny reálné časové offsety násobkem
  15 minut (např. `+01:00`, `+05:30`, `+05:45`), je instant zarovnaný v UTC zarovnaný
  i v lokálním čase klienta.
- `endTime − startTime ≤ 4 h`; přesně 4 h je dovoleno. Minimum 15 min plyne ze
  zarovnání a z `BR-01` (`startTime < endTime`).
- Pořadí kontrol při Create: `BR-01` (parsování) → `BR-06` → **`BR-07`** →
  `BR-05` / `BR-02` / `BR-04`. Porušení `BR-07` je tedy vstupní chyba (`400`), bez
  čtení DB, a nic se neuloží.
- Existující Reservation (vytvořené před v0.3) se nemění: lze je dál zrušit,
  `PENDING_APPROVAL` dál schválit a `CONFIRMED` dál blokují Agenta podle `BR-02`.

Mimo rozsah: Availability (OP-02) dál přijímá libovolný interval platný podle
`BR-01`, protože jde jen o čtecí dotaz; zaokrouhlování na mřížku; limity
konfigurovatelné per Agent nebo per User; UC4 Edit (v implementaci neexistuje);
redesign UI; minimální předstih rezervace.

**Acceptance conditions:**

| ID | Typ | Podmínka (pozorovatelný kontrakt) |
|---|---|---|
| AC-01 | pozitivní | Create zarovnaného intervalu `[10:00Z, 11:00Z)`, který splní ostatní pravidla → `201`, uloženo `CONFIRMED` (resp. `PENDING_APPROVAL` u Agenta se schválením) |
| AC-02 | negativní | Create s nezarovnaným `startTime` nebo `endTime` (minuta `:07`, sekunda `:30`, milisekunda `.001`) → `400`, `code = NOT_SLOT_ALIGNED`, žádný řádek se neuloží |
| AC-03 | hranice | délka přesně 4:00 → `201`; délka 4:15 → `400`, `code = DURATION_EXCEEDED`, nic se neuloží |
| AC-04 | regrese | `BR-02` beze změny: TC-C08-01 (sousední → `201`) a TC-C08-02 (překryv → `409 AGENT_UNAVAILABLE`) dál PASS; celá C02 sada PASS |
| AC-05 | časová zóna | zarovnání se hodnotí na instantu: `2035-…T19:45:00+05:45` (= `14:00Z`) je přijato a uloženo jako `14:00Z`; `11:07+01:00` je odmítnuto |
| AC-06 | stará data | Reservation uložená před v0.3 s nezarovnaným nebo delším intervalem: `PENDING_APPROVAL` lze schválit (`200 CONFIRMED`), `CONFIRMED` lze zrušit (`200 CANCELLED`); stav a interval se nemění jinak |
| AC-07 | pořadí pravidel | minulý a zároveň nezarovnaný začátek → `400 START_IN_PAST`; nezarovnaný interval u neaktivního Agenta → `400 NOT_SLOT_ALIGNED` (ne `404`) |

**Impact analysis method and exact inspected artifacts:**
Postup zadání C08: začít od AC-02 („nezarovnaný Create neuspěje“) → najít vlastníka
rozhodnutí (`createReservation` v `src/lib/reservation-service.ts`, pravidla v
`src/lib/reservation-policy.ts`) → sledovat volání od `POST /api/reservations` až k
zápisu `tx.reservation.create` → najít všechny ostatní cesty, které zapisují nebo
čtou intervaly (`grep` na `reservation.create|update`, `startTime`, `endTime` v
`src/`, `prisma/`, `scripts/`) → najít testy, které vytvářejí intervaly. Prohlédnuto:
všechna volání Create v `scripts/c02-verification.ts` (zarovnané, ≤ 1 h; nezarovnané
časy jsou jen v přímých DB fixturách pro Cancel/Approve a v BR-06 testu se začátkem
v minulosti), `scripts/api-persistence-spike.ts` (`10:00–11:00`), `prisma/seed.ts`
(Reservation nevytváří), `src/app/reservation-app.tsx` (dva `datetime-local`).

| Dimension / exact location | CHANGE / CHECK / NO IMPACT and why | Action / check | Owner / evidence |
|---|---|---|---|
| Spec: `docs/specification.md` `BR-01`, OP-01 | **CHANGE** — nové pravidlo `BR-07` a `REQ-13`, nový chybový výsledek OP-01 | sekce „Specification Baseline v0.3“, verification examples, acceptance review; `docs/team-approval.md` v0.3 | tým; review spec |
| Stavový model (`docs/diagrams/mermaid/08-state-v02.mmd`, C03 `04-state-ownership.mmd`) | **NO IMPACT** — žádný nový stav ani přechod; neplatný Create nevytvoří Reservation (`[none]` zůstává) | ověřit, že diagramy nepotřebují úpravu | review diagramů |
| Aktivita Create (`09-activity-create-v02.mmd`), UC2 (`docs/use-case-model.md`), OP-01 karta `docs/c02/operations/op-01-create-reservation.md` | **CHANGE** — nový rozhodovací krok a alternativní tok | nový diagram `17-activity-create-v03.mmd`, doplnit UC2 a OP-01 kartu | review dokumentace |
| Architektura / ADR-001 | **CHECK** — vlastník zůstává `reservation-service.ts`; pravidlo patří do čisté policy (C05) | `npm run test:architecture` PASS | architecture check |
| Detailní návrh `src/lib/reservation-policy.ts` | **CHANGE** — `SLOT_MINUTES`, `MAX_DURATION_MINUTES`, `assertSlotGranularity`, kódy `NOT_SLOT_ALIGNED` / `DURATION_EXCEEDED`; policy dál bez importů | C05 DD §4/§8/§10 | unit testy `test:c05` |
| `src/lib/reservation-service.ts` `createReservation` | **CHANGE** — volání `assertSlotGranularity` hned za `assertStartsInFuture`, před transakcí | diff review: pořadí kontrol (AC-07) | `test:cr08` |
| `src/lib/api-error-response.ts` | **CHANGE** — oba nové kódy → `400` (`Record<ReservationRuleCode, number>` vynutí úplnost) | typecheck | `test:cr08` (HTTP kód + `code`) |
| `src/app/api/reservations/route.ts` | **CHECK** — kód beze změny; `ReservationRuleViolation` už mapuje `apiErrorResponse` | ověřit odpověď 400 s `code` | `test:cr08` |
| OP-02 Availability `src/app/api/availability/route.ts` | **CHECK → NO CHANGE** — čtecí dotaz nad libovolným intervalem dle `BR-01`; zpřísnění by rozbilo klienty bez užitku | regrese `test:c02` „OP-02 applies half-open interval boundaries“ | `test:c02` |
| OP-04 Cancel, OP-05 Approve (`cancelReservation`, `decideReservation`) | **CHECK** — pracují s již uloženým intervalem; nesmí `BR-07` znovu vyhodnocovat (AC-06) | test se starou nezarovnanou fixturou | `test:cr08` TC-CR08-05 |
| UC4 Edit | **NO IMPACT** — cesta v implementaci neexistuje (žádný endpoint); případná budoucí implementace musí `BR-07` převzít | — | grep `src/app/api` |
| Data / schéma / migrace | **NO IMPACT** — pravidlo se týká jen nových požadavků; `startTime`/`endTime` zůstávají `DATETIME`; stará data se nemigrují (AC-06) | ověřit, že `prisma/` se nemění | `git diff -- prisma` prázdný |
| Další zapisovatelé: `prisma/seed.ts`, Prisma Studio, přímé SQL, test fixtury | **CHECK** — DB omezení (CHECK constraint) neexistuje a nezavádí se; pravidlo platí pro aplikační Create. Seed Reservation nevytváří. Přímý zápis do DB je administrativní zásah mimo kontrakt, stejně jako u `BR-06` | zdokumentovat jako známé omezení | tato karta |
| Import / worker / admin API pro Agenty | **NO IMPACT** — tyto cesty neexistují | — | `find src/app/api` |
| UI `src/app/reservation-app.tsx` | **CHANGE** (malá) — `step` 15 min na obou `datetime-local` a nápověda; autoritativní je server, UI jen zabrání zbytečné chybě | ruční kontrola v prohlížeči | screenshot / poznámka v evidence |
| Admin panel `src/app/admin/admin-panel.tsx` | **NO IMPACT** — Create nevolá | — | — |
| Testy | **CHANGE** — nové unit testy `BR-07` (`test:c05`), nové krokové `test:cr08`; regresní `test:c08` a `test:c02` beze změny | expected psát před implementací; `test:cr08` musí na baseline selhat | logy běhů |
| C04 kvalita (`QC-01`–`QC-04`) | **CHECK** — měřicí scénáře v `c02-verification.ts` používají zarovnané 1h intervaly | regrese `test:c02` | `test:c02` |
| Konfigurace / CI / release | **CHECK / CHANGE** — žádná nová proměnná prostředí (limity jsou konstanty specifikace v0.3); CI doplní `test:cr08`; verze produktu 0.3.0 | `ci.yml`, `package.json` | CI běh |
| Release / recovery | **CHECK** — bez migrace; Reservation vytvořené ve v0.3 jsou platné i pro v0.2.1, rollback kódu tedy nevyžaduje úpravu dat | zkouška rollbacku: baseline build nad DB z v0.3 + `test:c08` | záznam C09 |
| Provoz / uživatel | **CHECK** — klienti s nezarovnanými časy dostanou `400` s jasnou zprávou; existující Reservation zůstávají | text chybových hlášek | `test:cr08` |
| `presentation/` (slide deck) | **NO IMPACT** — samostatný projekt, nesouvisí s runtime | — | — |

**Feasible alternatives with common criteria:**

| Option | Meets AC? | Benefits | Cost / failure / recovery | How to verify |
|---|---|---|---|---|
| **A — serverové pravidlo `BR-07` v policy + UI nápověda** | ano (AC-01–07) | malá delta ve vlastníkovi pravidel; platí pro všechny HTTP klienty; bez migrace; rollback jen kódem | starší klienti posílající libovolné časy dostanou `400`; limity jsou pevné konstanty (změna = nový CR) | unit + `test:cr08` (HTTP + nezávislé čtení DB) + regrese `test:c08`/`test:c02` |
| B — jen UI omezení (`step`, výběr délky) | ne — AC-02/03 neplatí pro API klienty (skripty, `curl`) | nejmenší zásah, bez změny API | pravidlo se dá obejít; server dál přijme 72h blok | ruční UI test; nelze prokázat invariant v DB |
| C — server interval zaokrouhlí na mřížku | částečně — AC-02 vyžaduje odmítnutí | uživatel nedostane chybu | skrytá změna požadovaného intervalu; zaokrouhlením může vzniknout překryv se sousedem (`409`, který klient nečeká); nejasné, kam zaokrouhlit | testy zaokrouhlení obou hranic + konfliktů |
| D — max. délka per Agent (`Agent.maxDurationMinutes`) | ano, flexibilněji | různé limity pro dlouhé batch joby | migrace schématu, chybí admin API pro správu Agentů → výrazně větší rozsah; rollback vyžaduje řešit nový sloupec | migrace + admin API testy |
| E — nic neměnit, Admin ručně ruší dlouhé Reservation | ne | žádná změna kódu | závisí na pozornosti Admina; ruší už potvrzené Reservation (horší pro Usera než odmítnutí předem) | procesní záznam |

**Consequence of inaction / feasible alternative:** jeden User může dál zablokovat
exkluzivního Agenta na libovolně dlouhou dobu, `BR-04` to nezachytí a rozvrh se dál
tříští. Kompenzace bez kódu (E) přesouvá problém na Admina a zhoršuje dopad na Usera.

**Peer reviewer and challenged assumption:**
Reviewer: **James Indrák — PENDING** (review request na PR C08; výsledek se zapíše sem).
Předpoklady k ověření: (1) zda 4 h stačí i pro Agenta „Data Pipeline Bot“
(„scheduled data-processing jobs“); (2) zda je přijatelné, že Availability
nezarovnaný dotaz dál zodpoví; (3) zda grandfathering starých dat neodporuje
požadavku správce.

**Decision ACCEPT / REJECT / DEFER / NO_CHANGE, owner, date, rationale:**
**ACCEPT — varianta A**, owner agentt015 (za tým), 2026-11-09. A jako jediná splní
AC-02/AC-03 pro všechny klienty bez migrace a bez skryté změny požadovaného
intervalu. Je reverzibilní a staví na existujícím vlastníkovi pravidel (ADR-001,
C05). Varianta D je **DEFER** jako budoucí CR s podmínkou: konkrétní Agent s
doloženou potřebou delších jobů a existující admin API pro Agenty.

**If ACCEPT: bounded C09 delta and new/regression test oracles:**

| Hand-off item | Obsah |
|---|---|
| Before | `c08-baseline` (`61b4b4c`), `BR-01`/`BR-02` v0.2.1, TC-C08-01/02 PASS (2026-11-09) |
| Accepted change | CR-08: Create odmítne nezarovnaný interval a interval delší než 4 h (`400`, `NOT_SLOT_ALIGNED` / `DURATION_EXCEEDED`) |
| Bounded delta | `reservation-policy.ts` (konstanty + `assertSlotGranularity` + 2 kódy), `reservation-service.ts` (1 volání), `api-error-response.ts` (2 mapování), `reservation-app.tsx` (`step`, nápověda); bez změny `prisma/` |
| New oracle (TC-CR08) | 01: `[10:00,11:00)` a přesně 4 h → `201`; 02: `:07`, `:00:30`, `.001` → `400 NOT_SLOT_ALIGNED`, 0 nových řádků; 03: 4:15 a 72 h → `400 DURATION_EXCEEDED`, 0 nových řádků; 04: `+05:45` zarovnané → `201` uloženo `14:00Z`, `+01:00` nezarovnané → `400`; 05: stará nezarovnaná `PENDING_APPROVAL` → Approve `200 CONFIRMED`, stará 72h `CONFIRMED` → Cancel `200 CANCELLED`; 06: minulost + nezarovnané → `400 START_IN_PAST`, neaktivní Agent + nezarovnané → `400 NOT_SLOT_ALIGNED`; 07: TC-C08-01/02 |
| Regression | `test:c08`, `test:c02` (31 scénářů), `test:c05`, `test:architecture`, `test:api-persistence` |
| Technical risk | přímé zápisy do DB pravidlo obcházejí (vědomě, viz Impact Matrix); klienti mimo UI mohou posílat nezarovnané časy → `400` |
| C09 work | PR s implementací, `test:cr08` nejdřív FAIL na nezměněném kódu, pak PASS; jeden příkaz pro build a testy v CI; čistý checkout; RC manifest; rozhodnutí o RC |

**If NO_CHANGE/REJECT:** N/A (rozhodnuto ACCEPT).

**Open uncertainty / monitoring or next decision trigger:** výsledek peer review
(Indrák); požadavek na delší joby (→ varianta D); potřeba kapacity > 1 (pak se
`BR-02` i tento CR musí přehodnotit). Stav je **PLANNED**; IMPLEMENTED a VERIFIED
zaznamená C09.
