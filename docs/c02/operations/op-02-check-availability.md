# OP-02 — Zjištění dostupnosti agenta (Check Availability)

## Cíl / hodnota pro uživatele

Uživatel zjistí, zda je AI agent (exkluzivní Resource) v požadovaném intervalu
volný, tedy zda ho neblokuje potvrzená rezervace.

## Spouštěcí událost

Uživatel požádá o informaci o dostupnosti agenta A pro interval I.

## Pozorovatelný požadavek

**REQ-05:** Pro platný interval systém označí aktivního agenta jako `UNAVAILABLE`,
pokud interval překrývá jakoukoli rezervaci `CONFIRMED` téhož agenta. Jinak ho
označí jako `AVAILABLE`. Neaktivní agent je `UNAVAILABLE`.

Agenta blokují pouze rezervace ve stavu `CONFIRMED`. Rezervace
`PENDING_APPROVAL`, `CANCELLED`, `REJECTED` a `EXPIRED` agenta neblokují.

## Předpoklady

- Agent existuje.
- Interval je platný: `start < end`.

## Stav po úspěšném provedení

- je vrácen výsledek `AVAILABLE` nebo `UNAVAILABLE`;
- stav žádné rezervace se nezměnil.

## Změna stavu

Žádná (read-only operace).

## Odkaz na doménová pravidla / invarianty

- BR-01 — půlotevřené intervaly `[start, end)`
- BR-02 — překryv nastává právě tehdy, když `existing.start < requested.end` a
  zároveň `existing.end > requested.start`
- BR-05 — neaktivní agent

## Hlavní úspěšný scénář

1. Uživatel zadá agenta a interval.
2. Systém ověří, že interval je platný.
3. Systém ověří, že agent existuje.
4. Pokud je agent neaktivní, systém vrátí `UNAVAILABLE`.
5. Systém vyhledá rezervace `CONFIRMED` téhož agenta překrývající se s intervalem
   (BR-02).
6. Pokud žádná není, systém vrátí `AVAILABLE`, jinak `UNAVAILABLE`.

## Alternativní / chybové výsledky

- chybějící údaj, neplatné datum nebo `start >= end` → odmítnuto (400);
- neznámý agent → odmítnuto (404);
- neaktivní agent → není chyba, výsledek je `UNAVAILABLE`.

## Příklady ověření

Agent má jedinou rezervaci `CONFIRMED` `[10:00, 11:00)`:

- dotaz `[09:00, 10:00)` → `AVAILABLE`;
- dotaz `[10:30, 11:30)` → `UNAVAILABLE`;
- dotaz `[11:00, 12:00)` → `AVAILABLE`.

Další případy:

- agent bez rezervací → `AVAILABLE`;
- agent se schvalováním a jen `PENDING_APPROVAL` `[10:00, 11:00)`, dotaz na
  stejný interval → `AVAILABLE`;
- agent má jen `CANCELLED` `[10:00, 11:00)`, dotaz na stejný interval →
  `AVAILABLE`;
- neaktivní agent → `UNAVAILABLE`;
- `CONFIRMED` rezervace je zrušena (OP-04) → stejný dotaz už vrací `AVAILABLE`;
- `PENDING_APPROVAL` je schválena (OP-05) → dotaz na její interval vrací
  `UNAVAILABLE`;
- `start == end` → odmítnuto; neznámý agent → odmítnuto.

## Zdůvodnění / zdroj

Oddělení zjištění dostupnosti od vytvoření umožňuje uživateli zjistit volné sloty
předem. Výsledek je jen snímek v čase. Mezi dotazem a pozdějším Create nebo
schválením se může změnit, proto Create i OP-05 kontrolují překryv znovu. Zdroj:
`docs/specification.md` (OP-02, REQ-05), implementace `GET /api/availability`.

## Předpoklad / neznámé / TBD

- Dotaz na dostupnost nevyžaduje přihlášení a nezamítá interval v minulosti.
  Specifikace to výslovně nestanoví.
- Seznam konfliktních rezervací ve výsledku není součástí v0.2.
