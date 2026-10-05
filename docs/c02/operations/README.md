# C02 — detailní karty operací

Tyto karty rozepisují operace OP-01 až OP-04 z přijaté specifikace C02 v0.2.
Vznikly jako doplňující podklad ke cvičení a byly 2026-10-05 porovnány s aktuální
specifikací, verification plánem, implementací a testy.

## Zařazené karty

- [OP-01 — Vytvoření rezervace](op-01-create-reservation.md)
- [OP-02 — Zjištění dostupnosti agenta](op-02-check-availability.md)
- [OP-03 — Potvrzení rezervace](op-03-confirm-reservation.md)
- [OP-04 — Zrušení rezervace](op-04-cancel-reservation.md)

## Výsledek kontroly

Obsah odpovídá baseline v0.2 a současnému chování:

- neexistuje stav `DRAFT` ani ruční potvrzení běžným Userem;
- Create ukládá rovnou `CONFIRMED` nebo `PENDING_APPROVAL`;
- pouze `CONFIRMED` blokuje interval Agenta;
- `PENDING_APPROVAL` se počítá do limitu Usera, ale neblokuje Agenta;
- Cancel je povolen vlastníkovi nebo Adminovi pouze před `startTime`;
- souběžné potvrzení musí zachovat invariant nejvýše jedné konfliktní
  `CONFIRMED` Reservation.

Karty jsou doplňující vysvětlení. Autoritativním zdrojem zůstává
[specification.md](../../specification.md), testovací důkaz je ve
[verification-plan.md](../../verification-plan.md) a implementační vlastnictví po
C03 popisuje [ADR-001](../../c03/adr/ADR-001-reservation-lifecycle-owner.md).

## Omezení podkladu

- Archiv neobsahoval samostatnou kartu OP-05 Approve/Reject; OP-05 je úplně popsána
  v hlavní specifikaci.
- OP-03 je systémové rozhodnutí, nikoliv samostatný endpoint nebo ruční akce Usera.
- Karty správně označují chování intervalů v minulosti a sjednocené `404` pro
  neznámého/neaktivního Agenta jako známé okrajové body současné baseline.
