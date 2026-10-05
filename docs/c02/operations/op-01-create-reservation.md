# OP-01 — Vytvoření rezervace (Create Reservation)

## Cíl / hodnota pro uživatele

Přihlášený uživatel zarezervuje výpočetní čas konkrétního AI agenta jedním
požadavkem. Systém požadavek okamžitě zvaliduje. Rezervace buď vznikne v konečném
stavu (`CONFIRMED`, nebo `PENDING_APPROVAL`), nebo nevznikne vůbec. Neexistuje
trvalý mezistav typu `DRAFT`.

## Spouštěcí událost

Přihlášený User odešle agenta, časový interval a volitelnou poznámku.

## Pozorovatelné požadavky

**REQ-01:** Pro existujícího aktivního agenta a platný interval systém rezervaci
vytvoří jen tehdy, když jsou splněna všechna pravidla pro potvrzení.

**REQ-02:** Úspěšně vytvořená rezervace se uloží přímo jako `CONFIRMED`, pokud
agent nevyžaduje schválení.

**REQ-03:** Pokud selže jakákoli validace nebo obchodní pravidlo, žádná rezervace
nevznikne.

**REQ-04:** Systém rezervaci nevytvoří, pokud by tím uživatel překročil limit
aktivních rezervací (BR-04).

**Změna ve v0.2 (`Agent.requiresApproval`):** Stejné validace, ale úspěšně
vytvořená rezervace se uloží jako `PENDING_APPROVAL` (viz OP-05). Taková rezervace
agenta neblokuje.

## Předpoklady

- Uživatel je identifikován přihlášením (server-side Session). E-mail v těle
  požadavku jako důkaz identity neplatí (AR-01).
- Agent existuje a je aktivní.
- `startTime < endTime`.
- Interval se nepřekrývá s žádnou rezervací `CONFIRMED` téhož agenta.
- Uživatel nepřekročí limit aktivních rezervací.

## Stav po úspěšném provedení

- vznikla právě jedna nová rezervace patřící přihlášenému uživateli a danému
  agentovi;
- `Reservation.state = CONFIRMED` (agent bez schvalování) nebo
  `PENDING_APPROVAL` (agent se schvalováním);
- vrácené ID rezervace je shodné s uloženým ID;
- u `CONFIRMED` interval nyní agenta blokuje, u `PENDING_APPROVAL` agenta
  neblokuje.

## Změna stavu

- `[none] → CONFIRMED` (agent bez schvalování)
- `[none] → PENDING_APPROVAL` (agent se schvalováním)

## Odkaz na doménová pravidla / invarianty

- AR-01 — identita a přístup
- BR-01 — půlotevřené intervaly `[start, end)`
- BR-02 — žádné dvě `CONFIRMED` rezervace téhož agenta se nepřekrývají
- BR-04 — limit aktivních rezervací uživatele (aktivní = `PENDING_APPROVAL` nebo
  `CONFIRMED`, jejichž `endTime` ještě nenastal)
- BR-05 — pouze aktivní agent

## Hlavní úspěšný scénář

1. Přihlášený uživatel zadá agenta, interval a případně poznámku.
2. Systém ověří přihlášení uživatele.
3. Systém ověří povinné vstupy a platnost intervalu.
4. Systém ověří, že agent existuje a je aktivní.
5. Systém ověří, že interval nepřekrývá žádnou rezervaci `CONFIRMED` téhož agenta.
6. Systém ověří, že uživatel nepřekročí limit aktivních rezervací.
7. Systém rezervaci uloží jako `CONFIRMED`, resp. `PENDING_APPROVAL`, pokud agent
   vyžaduje schválení.
8. Systém vrátí ID rezervace, ID agenta a stav.

Kroky 4 až 7 probíhají v jedné atomické transakci (OP-03, REQ-07).

## Alternativní / chybové výsledky

V každém případě nevznikne žádná rezervace:

- uživatel není přihlášen → odmítnuto (401);
- neplatné JSON nebo chybějící `agentId`, `startTime`, `endTime` → odmítnuto (400);
- neplatné datum nebo `start >= end` → odmítnuto (400);
- agent neexistuje nebo je neaktivní → odmítnuto (404);
- interval se překrývá s rezervací `CONFIRMED` téhož agenta → odmítnuto (409);
- uživatel by překročil limit aktivních rezervací → odmítnuto (403);
- selhání uložení → systém nehlásí úspěch.

## Příklady ověření

- aktivní agent bez schvalování + volný `[10:00, 11:00)` → vznikne jedna
  rezervace `CONFIRMED`; vrácené ID je shodné s uloženým;
- aktivní agent se schvalováním + volný interval → vznikne `PENDING_APPROVAL`;
  dotaz OP-02 na tentýž interval stále vrací `AVAILABLE`;
- `start == end` → odmítnuto;
- neaktivní agent → odmítnuto;
- neznámý agent → odmítnuto;
- nepřihlášený uživatel → odmítnuto, nic nevznikne;
- agent má `CONFIRMED` `[10:00, 11:00)`, požadavek na `[10:30, 11:30)` →
  odmítnuto (409);
- agent má `CONFIRMED` `[10:00, 11:00)`, požadavek na `[11:00, 12:00)` →
  vznikne `CONFIRMED`;
- uživatel už má maximální počet aktivních rezervací → odmítnuto; do limitu se
  počítají `CONFIRMED` i `PENDING_APPROVAL`;
- dva souběžné požadavky na týž volný interval téhož agenta → právě jeden uspěje
  (201), druhý je odmítnut (409).

## Zdůvodnění / zdroj

Rozhodnutí o přijetí rezervace se dělá hned při přijetí požadavku, takže systém
nemá uložený mezistav, který by nikdo nepotvrdil. U agentů se schvalováním je
„čekání na rozhodnutí“ skutečný stav (`PENDING_APPROVAL`), protože Admin rozhodne
později. Zdroj: `docs/specification.md` (accepted modeling decision, OP-01, change
impact v0.2), implementace `POST /api/reservations`.

## Předpoklad / neznámé / TBD

- Specifikace neříká nic o intervalu v minulosti a implementace ho nezamítá. Pro
  agenta bez schvalování tak lze vytvořit `CONFIRMED` rezervaci v minulosti. Pro
  agenta se schvalováním vznikne `PENDING_APPROVAL` s časem v minulosti, který se
  na `EXPIRED` převede až při dalším čtení nebo rozhodnutí.
- Specifikace rozlišuje „neznámý“ a „neaktivní“ agent jen jako „odmítnuto“.
  Implementace v obou případech vrací stejné 404.
- Limit N je ve specifikaci „konfigurovatelný“. Implementace ho drží jako
  `maxReservations` u každého uživatele (výchozí 3, demo Admin 100).
