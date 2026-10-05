# OP-03 — Potvrzení rezervace (Confirm Reservation)

## Cíl / hodnota pro uživatele

Systém přijme platný požadavek jako závaznou alokaci agenta, tedy rezervace přejde
do stavu `CONFIRMED` a agent je v daném intervalu blokován. U agenta bez
schvalování k tomu User ani Admin nedělá další krok. U agenta se schvalováním je
nutné rozhodnutí Admina v OP-05, ale následné potvrzení už není další samostatná
akce.

## Přijatá sémantika

Potvrzení **není samostatná akce uživatele** a neexistuje uložený stav před
potvrzením. Potvrzení je atomické rozhodnutí systému a probíhá takto:

- **Agent bez schvalování:** potvrzení je poslední krok transakce OP-01 (Create).
  Požadavek buď projde všemi kontrolami a uloží se jako `CONFIRMED`, nebo žádná
  rezervace nevznikne.
- **Agent se schvalováním (v0.2):** rezervace vznikne jako `PENDING_APPROVAL` a
  potvrzení nastane až úspěšným schválením (OP-05).

## Spouštěcí událost

- agent bez schvalování: OP-01 dospěje k závěrečnému rozhodnutí o uložení po
  úspěšné validaci;
- agent se schvalováním: Admin požádá o schválení rezervace `PENDING_APPROVAL`
  (OP-05).

## Pozorovatelné požadavky

**REQ-06:** Rezervace se může stát závaznou (`CONFIRMED`) jen tehdy, když: agent je
aktivní, interval je platný, žádná jiná rezervace `CONFIRMED` téhož agenta se s
ním nepřekrývá a uživatel nepřekračuje BR-04.

**REQ-07:** Při souběžných konfliktních pokusech o vytvoření nebo potvrzení se
nejvýše jedna rezervace stane `CONFIRMED`.

## Předpoklady

- agent existuje a je aktivní;
- `startTime < endTime`;
- interval se nepřekrývá s jinou `CONFIRMED` rezervací téhož agenta;
- uživatel nepřekračuje limit aktivních rezervací;
- u schválení navíc: rezervace je `PENDING_APPROVAL` a
  `currentTime < startTime` (podrobnosti viz OP-05).

## Stav po úspěšném provedení

- právě jedna uložená rezervace je `CONFIRMED`;
- rezervace blokuje agenta v celém svém intervalu (OP-02 pro něj vrací
  `UNAVAILABLE`);
- BR-02 platí.

## Změna stavu

- `[none] → CONFIRMED` jako závěrečný atomický krok OP-01;
- `PENDING_APPROVAL → CONFIRMED` pouze přes OP-05.

Neexistuje samostatný požadavek uživatele na potvrzení ani přechod z jiného
uloženého stavu typu `DRAFT`.

## Odkaz na doménová pravidla / invarianty

- BR-01 — půlotevřené intervaly `[start, end)`
- BR-02 — žádné dvě `CONFIRMED` rezervace téhož agenta se nepřekrývají
- BR-04 — limit aktivních rezervací
- BR-05 — pouze aktivní agent

## Hlavní úspěšný scénář — agent bez schvalování

1. OP-01 zvaliduje požadavek a pravidla.
2. Systém v jedné transakci uloží rezervaci jako `CONFIRMED`.
3. Odpověď OP-01 vrátí ID rezervace a stav `CONFIRMED`.

## Hlavní úspěšný scénář — agent se schvalováním

1. Admin požádá o schválení rezervace `PENDING_APPROVAL` (OP-05).
2. Systém ověří čas, aktivitu agenta a znovu překryv.
3. Systém v jedné transakci změní stav na `CONFIRMED`.

## Alternativní / chybové výsledky

- agent je neaktivní → Create odmítnut, nic nevznikne; schválení odmítnuto,
  rezervace zůstává `PENDING_APPROVAL`;
- existuje překrývající se `CONFIRMED` rezervace → Create odmítnut, nic nevznikne
  (409); schválení odmítnuto (409), rezervace zůstává `PENDING_APPROVAL`;
- neplatný interval → Create odmítnut, nic nevznikne;
- limit překročen → Create odmítnut, nic nevznikne;
- souběžný konflikt → nejvýše jedna rezervace se stane `CONFIRMED`, druhý
  požadavek je odmítnut (409).

Odmítnuté potvrzení rezervaci nikdy nezruší.

## Příklady ověření

- platný Create + aktivní agent bez schvalování + žádný překryv → `CONFIRMED`;
- Create s překryvem na existující `CONFIRMED` → odmítnuto, druhá rezervace
  nevznikne;
- Create na `[11:00, 12:00)` při existující `CONFIRMED` `[10:00, 11:00)` →
  `CONFIRMED`;
- dva souběžné konfliktní Create → nejvýše jedna `CONFIRMED` (statusy 201 a 409);
- schválení `PENDING_APPROVAL` bez překryvu, před `startTime`, aktivní agent →
  `CONFIRMED`, OP-02 pak vrací `UNAVAILABLE`;
- dvě překrývající se `PENDING_APPROVAL` schválené souběžně → nejvýše jedna
  `CONFIRMED`, druhá 409 a zůstává `PENDING_APPROVAL`;
- mezi vytvořením žádosti a schválením vznikla překrývající se `CONFIRMED` →
  schválení odmítnuto (409), rezervace zůstává `PENDING_APPROVAL`.

## Zdůvodnění / zdroj

Aktuální API provádí kontroly pro potvrzení hned při vytvoření, takže zavádět
uměle uložený mezistav by neodpovídalo skutečnému chování. Potvrzení zůstává v
systému jako výslovné rozhodnutí o alokaci. Zdroj: `docs/specification.md` (OP-03,
REQ-06, REQ-07), implementace `POST /api/reservations` a
`PATCH /api/reservations/{id}/decision`.

## Předpoklad / neznámé / TBD

- Notifikace uživateli po potvrzení není součástí v0.1 ani v0.2. Notification
  Service v systému neexistuje.
- Způsob zajištění souběhu je architektonické rozhodnutí C03 a do specifikace
  nepatří. Specifikace požaduje jen výsledek z REQ-07.
