# Use-case model — based on the team's original diagram

The original use-case diagram is preserved as `source/original-use-case.png`.

This version keeps UC1–UC6 and extends the model for C02.

# Actors

## User

A normal reservation-system User.

## Admin

Admin is a specialized User and therefore may also perform normal User operations.
Additionally, Admin manages Agents and Reservations.

In baseline v0.2, Admin also acts as the authorized Approver.

---

# Baseline v0.1

## UC1 — Vyhledávání rezervací

User zobrazí **všechny Reservation v systému**, bez ohledu na to,
který User je vytvořil.

Přehled je zobrazen formou **Ganttova diagramu**:

- jednotlivé AI Agenty tvoří řádky;
- horizontální osa představuje čas;
- každá Reservation je zobrazena jako úsek od `startTime` do `endTime`;
- operace nic nemění v systému, jde pouze o read-only přehled.

Gantt zobrazuje Agent, interval a stav Reservation. Identita vlastníka se běžnému
Userovi nezobrazuje.


## UC2 — Vytvoření rezervace

Maps to **Create Reservation**.

The system immediately validates Agent, interval, overlap and User limit.

If everything passes:

`[none] → CONFIRMED`

If any rule fails, no Reservation is created.

UC2 uses the availability rule represented by UC7. The system commits a successful
request directly as `CONFIRMED`; there is no separate confirmation use case.

## UC3 — Zrušení rezervace

The original diagram says “Mazání rezervace”.

For C02 its accepted business meaning is **Cancel Reservation**:
the Reservation is not physically deleted; its state changes to `CANCELLED`.

## UC4 — Editace rezervace

User may edit a future `CONFIRMED` Reservation.

The system revalidates the new Agent / interval immediately.

If the updated interval would violate availability, overlap, Agent activity
or other rules, the edit is rejected and the existing Reservation stays unchanged.

## UC5 — Admin správa agentů

Admin creates, edits, activates and deactivates AI Agents.

In baseline v0.2, Admin also configures whether an Agent has
`requiresApproval = true`.

## UC6 — Admin správa rezervací

Admin can inspect and manage Reservations without bypassing domain invariants.

## UC7 — Kontrola dostupnosti

Maps to **Check Availability**.

User checks whether an Agent is free for a requested interval.

# Baseline v0.2

UC1–UC7 remain.

## UC8 — Schválení / zamítnutí rezervace

For Agents with `requiresApproval = true`, UC2 creates
`PENDING_APPROVAL` after immediate validation.

Admin / Approver then performs UC8:

- approve → `PENDING_APPROVAL → CONFIRMED`
- reject → `PENDING_APPROVAL → REJECTED`
- expiry → `PENDING_APPROVAL → EXPIRED`

`PENDING_APPROVAL` does not block Agent availability.

When approval happens, availability is checked again.

---

# Mapping to mandatory C02 operations

| Mandatory C02 operation | Use case |
|---|---|
| Create Reservation | UC2 — Vytvoření rezervace |
| Check Availability | UC7 — Kontrola dostupnosti |
| Confirm Reservation | system decision inside UC2; no separate User use case |
| Cancel Reservation | UC3 — Zrušení rezervace |
| Approve Reservation (v0.2) | UC8 — Schválení / zamítnutí rezervace |

UC1, UC4, UC5 and UC6 remain from the team's original model.
