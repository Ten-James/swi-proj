# OP-04 — Zrušení rezervace (Cancel Reservation)

## Cíl / hodnota pro uživatele

Oprávněný uživatel stáhne existující budoucí rezervaci. Rezervace přestane blokovat
agenta a nepočítá se do limitu aktivních rezervací. Záznam zůstává uložen,
rezervace se fyzicky nemaže.

## Spouštěcí událost

Přihlášený uživatel (vlastník rezervace nebo Admin) požádá o zrušení rezervace X.

## Pozorovatelný požadavek

**REQ-08:** Rezervace ve stavu `CONFIRMED` nebo (od v0.2) `PENDING_APPROVAL` může
přejít do `CANCELLED`, pokud `currentTime < startTime` (BR-03).

## Předpoklady

- Rezervace existuje.
- Volající je přihlášen a je vlastníkem rezervace, nebo má roli `ADMIN`.
- Rezervace je ve stavu `CONFIRMED` nebo `PENDING_APPROVAL`, případně už
  `CANCELLED` (idempotentní případ).
- `currentTime < Reservation.startTime` (striktně). `currentTime` je čas
  systémových hodin serveru aplikace.

## Stav po úspěšném provedení

- `Reservation.state = CANCELLED`;
- záznam rezervace zůstává uložen;
- rezervace už agenta neblokuje;
- rezervace se nepočítá do limitu aktivních rezervací (BR-04);
- `CANCELLED` je koncový stav, zrušenou rezervaci nelze obnovit.

## Změna stavu

- `CONFIRMED → CANCELLED`
- `PENDING_APPROVAL → CANCELLED`
- `CANCELLED → CANCELLED` (opakované zrušení, bez další změny)

## Odkaz na doménová pravidla / invarianty

- AR-01 — identita a oprávnění
- BR-02 — `CANCELLED` rezervace agenta neblokuje
- BR-03 — politika rušení (hranice `currentTime < startTime`)
- BR-04 — `CANCELLED` se nepočítá do limitu

## Hlavní úspěšný scénář

1. Uživatel zadá požadavek na zrušení rezervace X.
2. Systém ověří přihlášení.
3. Systém načte rezervaci.
4. Systém ověří, že volající je vlastník rezervace nebo Admin.
5. Systém ověří stav rezervace a že `currentTime < startTime`.
6. Systém změní stav na `CANCELLED`.
7. Systém vrátí ID rezervace a aktuální stav.

## Alternativní / chybové výsledky

- uživatel není přihlášen → odmítnuto (401);
- rezervace neexistuje → odmítnuto (404);
- volající není vlastník ani Admin → odmítnuto (403);
- rezervace je už `CANCELLED` → úspěch bez další změny stavu;
- `currentTime >= startTime` u rezervace `CONFIRMED` → odmítnuto (409), stav beze
  změny;
- `currentTime >= startTime` u rezervace `PENDING_APPROVAL` → rezervace se zapíše
  jako `EXPIRED` a požadavek je odmítnut (409);
- rezervace je `REJECTED` nebo `EXPIRED` → odmítnuto (409), stav beze změny;
- souběh Cancel × Approve / Reject téže `PENDING_APPROVAL` rezervace → rozhodne
  operace, která se zapíše první. Druhá vidí neplatný zdrojový stav a je odmítnuta
  (409). Výsledný stav je vždy jen jeden.

## Příklady ověření

- vlastník ruší budoucí `CONFIRMED` rezervaci → `CANCELLED`; dotaz OP-02 na její
  interval pak vrací `AVAILABLE`, pokud ho neblokuje jiná potvrzená rezervace;
- vlastník ruší budoucí `PENDING_APPROVAL` rezervaci → `CANCELLED`;
- Admin ruší cizí budoucí rezervaci → `CANCELLED`;
- rezervace s `startTime == currentTime` → odmítnuto;
- rezervace, která už začala nebo proběhla → odmítnuto;
- `PENDING_APPROVAL` s `startTime` v minulosti → `EXPIRED` + odmítnuto;
- opakované zrušení už `CANCELLED` rezervace → úspěch, stav zůstává `CANCELLED`;
- zrušení cizí rezervace běžným uživatelem → odmítnuto;
- zrušení neexistující rezervace → odmítnuto;
- zrušení bez přihlášení → odmítnuto.

## Zdůvodnění / zdroj

Zrušení umožňuje uvolnit slot a vrátit uživateli místo v limitu. Rezervace se maže
jen logicky, aby zůstala historie. Přísná hranice `currentTime < startTime` a čas
serveru dělají podmínku jednoznačně ověřitelnou. Zdroj: `docs/specification.md`
(BR-03, OP-04, REQ-08 a rozšíření ve v0.2), implementace
`PATCH /api/reservations/{id}/cancel`.

## Předpoklad / neznámé / TBD

- Původní v0.1 připouštěla jako zdrojový stav jen `CONFIRMED`, resp. `CANCELLED`
  pro idempotenci. Rozšíření v0.2 přidává `PENDING_APPROVAL`; implementace zároveň
  výslovně zamítá `REJECTED` a `EXPIRED` s kódem 409.
- Pořadí kontrol v implementaci: oprávnění se ověřuje před kontrolou stavu.
  Neoprávněný volající proto dostane 403 i při pokusu zrušit už zrušenou rezervaci.
- Rozdíly hodin mezi klientem a serverem se neřeší. Rozhoduje čas serveru.
