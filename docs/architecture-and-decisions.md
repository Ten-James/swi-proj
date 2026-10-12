# Architecture and decisions

Vstupní bod požadovaný zadáním C03 a C05. Plné podklady jsou v podsložkách,
zde je struktura podle zadání s odkazy.

## C03 Architecture

- Part A (AS-IS: scénář, mapování na kód, alternativní větev, stav/pravidlo,
  závislosti, AS-IS diagram, otázka): [c03/architecture.md § A](c03/architecture.md#a-as-is-implementation-evidence)
- Drivery, doménový model, odpovědnosti: [§ B–C2](c03/architecture.md#b-architecture-drivers)
- Rozhodovací otázka, alternativy, porovnání, walkthrough: [§ D–E3](c03/architecture.md#d-main-decision-question)
- ADR: [ADR-001 — vlastník životního cyklu Reservation](c03/adr/ADR-001-reservation-lifecycle-owner.md)
- Pohledy (context, static, state ownership, runtime, sequence, design class):
  [§ G1–H2](c03/architecture.md#g1-system-context), diagramy v [c03/diagrams](c03/diagrams/README.md)
- Cross-view kontrola, AS-IS → TO-BE delta, implementace, ověření:
  [§ I–M](c03/architecture.md#i-cross-view-consistency-check)
- Evidence: [evidence-and-evolution.md § C03](evidence-and-evolution.md#c03--architecture-evidence)

## C05 Detailed Design

Plné znění: [c05/detailed-design.md](c05/detailed-design.md).

**Selected architecture unit:** pravidla životního cyklu Reservation uvnitř
`Reservation Service` (C03 G2). Requirements `REQ-06`–`REQ-12`, pravidla
`BR-01`–`BR-05`, scénáře OP-01, OP-04, OP-05. → [§ 1](c05/detailed-design.md#1-vybraná-architektonická-jednotka)

**Detailed responsibilities:** definice překryvu, počáteční stav, limit, plán
zrušení, plán rozhodnutí, podmínky potvrzení, doménový důvod odmítnutí, I/O a
transakce. → [§ 2](c05/detailed-design.md#2-detailní-odpovědnosti)

**Design elements and ownership:** čistý modul `reservation-policy`
(rozhodnutí, bez importů), `reservation-service` (jediný zapisovatel, dotazy,
transakce, čas), `api-error-response` (doménový kód → HTTP), `request-body`
(validace payloadu). → [§ 3](c05/detailed-design.md#3-struktura-datastate-a-vlastnictví)

**Key interface(s) / contract(s):** `ReservationPolicy` – `overlapBounds`,
`planCancel`, `planDecision`, `assertCanConfirm`, `assertWithinQuota`; selhání
`ReservationRuleViolation` s kódy `NOT_OWNER`, `QUOTA_EXCEEDED`,
`INVALID_STATE`, `AFTER_START`, `AGENT_INACTIVE`, `AGENT_UNAVAILABLE`.
→ [§ 4](c05/detailed-design.md#4-rozhraní-a-kontrakty)

**Focused structural view:** UML class diagram (6 prvků).
→ [§ 5](c05/detailed-design.md#5-zaměřený-strukturální-pohled)

**Detailed sequence:** Approve s konfliktem vzniklým během čekání
(`DecisionRouteHandler → ReservationService → ReservationPolicy → Prisma tx → ApiErrorResponse`).
→ [§ 6](c05/detailed-design.md#6-detailní-sekvence--approve-s-konfliktem)

**Important methods / operations:** `createReservation`, `cancelReservation`,
`decideReservation`, `findConfirmedOverlap`, `planCancel`, `planDecision`.
→ [§ 7](c05/detailed-design.md#7-významné-operace)

**Algorithm / decision logic:** rozhodovací tabulka Cancel a pseudokód
Decision. → [§ 8](c05/detailed-design.md#8-algoritmus--rozhodovací-logika)

**DD decisions intentionally left to code:** tvar Prisma dotazů, hromadná
expirace, izolace transakce, texty chyb, kontroly Agenta/překryvu při Create.
→ [§ 9](c05/detailed-design.md#9-rozhodnutí-záměrně-ponechaná-v-kódu)

Testy odvozené z DD, design ↔ code a evidence:
[§ 10–11](c05/detailed-design.md#10-testy-odvozené-z-dd),
[evidence-and-evolution.md § C05](evidence-and-evolution.md#c05-dd-verification-evidence).
