# Supplementary use-case specifications

# UC1 — Vyhledávání / přehled rezervací

## Goal

User může zobrazit přehled **všech Reservation v systému**, aby viděl
vytížení jednotlivých AI Agentů v čase.

## Observable behavior

- User může zobrazit všechny Reservation bez ohledu na jejich vlastníka.
- Rezervace jsou zobrazeny v Ganttově diagramu.
- Každý AI Agent má v diagramu vlastní řádek / osu.
- Horizontální osa představuje čas.
- Každá Reservation je zobrazena jako interval `startTime → endTime`.
- Operace je read-only a nemění stav žádné Reservation.

## Result

Systém načte data o všech Reservation a souvisejících AI Agentech,
seskupí je podle Agenta a času a UI je zobrazí jako Ganttův diagram.

## Verification examples

- existují Reservation několika různých Userů
  → běžný User je všechny vidí v Ganttově diagramu;
- dva různí Agenti mají Reservation ve stejném čase
  → jsou zobrazeni na samostatných řádcích;
- jeden Agent má více Reservation v různých časech
  → všechny intervaly jsou zobrazeny na jeho řádku;
- systém nemá žádné Reservation
  → zobrazí se prázdný Ganttův přehled bez chyby.

## TBD

Není zatím rozhodnuto, které konkrétní údaje o Userovi / vlastníkovi
Reservation se mají v Ganttově přehledu zobrazovat.

---


# UC4 — Editace rezervace

## Goal

User can modify a future Reservation without creating a second record.

## Preconditions

- Reservation exists.
- Reservation belongs to the User.
- Reservation is `CONFIRMED`.
- `currentTime < startTime`.

## Allowed changes

- Agent;
- `startTime`;
- `endTime`;
- note.

## Observable behavior

Before committing the edit, the system rechecks:

- valid interval;
- target Agent exists and is active;
- updated interval does not conflict with another `CONFIRMED` Reservation;
- accepted User-limit rules remain satisfied.

On success, the same Reservation remains `CONFIRMED` with updated values.

On failure, the Reservation remains unchanged.

## Negative examples

- edit after start time → rejected;
- invalid interval → rejected;
- edit creates an overlap → rejected;
- another User's Reservation → rejected.

---

# UC5 — Admin správa agentů

## Goal

Admin maintains the catalogue of reservable AI Agents.

## Observable behavior

Admin may:

- create Agent;
- edit metadata;
- activate Agent;
- deactivate Agent.

An inactive Agent cannot receive a new `CONFIRMED` Reservation.

Historical Reservations are preserved.

## Verification examples

- Admin deactivates Agent → new Create is rejected / Availability is unavailable.
- normal User attempts Agent administration → rejected.

---

# UC6 — Admin správa rezervací

## Goal

Admin has an administrative view over all Reservations.

## Observable behavior

- Admin may list/filter all Reservations.
- Admin may perform allowed management operations.
- Admin may not bypass interval, overlap, cancellation or User-limit rules.

## Verification examples

- Admin can see Reservations of multiple Users.
- ordinary User can see only their own.
- Admin operation cannot produce overlapping `CONFIRMED` Reservations.

---

# UC9 — Schválení / zamítnutí rezervace (v0.2)

Engineering details are specified in `specification.md` as OP-05.

Admin acts as the authorized Approver.
