# Project Frame

## Reservation domain
Rezervujeme výpočetní čas (compute time) AI agentů. Administrátor spravuje katalog dostupných AI agentů (přidává, upravuje, deaktivuje), zatímco uživatelé si u konkrétního agenta rezervují časový slot, po který budou mít k jeho výpočetnímu výkonu exkluzivní přístup. Klíčové omezení domény: každý uživatel může mít najednou pouze omezený počet aktivních rezervací — tzv. max rezervací.

## Purpose
Systém slouží uživatelům (např. vývojářům, analytikům), kteří potřebují rezervovaně a bez kolizí využívat výpočetní čas sdílených AI agentů s omezenou kapacitou, a administrátorům, kteří agenty do systému přidávají a spravují jejich dostupnost. Cílem je zajistit spravedlivé a předvídatelné sdílení omezené výpočetní kapacity agentů mezi více uživateli a zabránit tomu, aby jeden uživatel zablokoval kapacitu nadměrným počtem souběžných rezervací.

## Users / Stakeholders
- **User (uživatel)** – vyhledává dostupné AI agenty, vytváří, upravuje a ruší vlastní rezervace výpočetního času.
- **Administrator** – přidává a spravuje AI agenty (jejich dostupnost, kapacitu, deaktivaci), spravuje uživatele a globální nastavení (např. hodnotu limitu max rezervací).
- **Approver** *(volitelná role, může splývat s administrátorem)* – potvrzuje nebo zamítá rezervace u agentů vyžadujících schválení.

## Core concepts
- **Reservation** – požadavek konkrétního uživatele na exkluzivní využití výpočetního času konkrétního AI agenta v daném časovém intervalu.
- **Resource (AI Agent)** – rezervovatelný AI agent se svým výpočetním výkonem/kapacitou, vlastním rozvrhem dostupnosti a stavem (aktivní/neaktivní), spravovaný administrátorem.
- **User** – osoba se svým účtem, rolí (user/admin) a vlastním limitem aktivních rezervací.
- **Availability window** – časové období, kdy je daný agent vůbec nabízen k rezervaci (např. mimo plánovanou údržbu).

## Core operations
- Create reservation
- Confirm / approve reservation
- Cancel reservation
- Check availability

## Persistent state
**Reservation**: id, user_id, agent_id (resource_id), start_time, end_time, status (DRAFT / CONFIRMED / CANCELLED / REJECTED), created_at, updated_at, účel/poznámka (volitelné).

**Resource (AI Agent)**: id, název, popis/typ agenta, výpočetní kapacita, availability window, stav (aktivní/neaktivní), owner/admin_id, vytvořen_at.

## State-changing operation
`DRAFT → CONFIRMED`: uživatel vytvoří rezervaci výpočetního času agenta ve stavu DRAFT, systém (nebo approver) ji následně potvrdí a stav se změní na CONFIRMED. Z DRAFT nebo CONFIRMED lze také přejít do CANCELLED (zrušení uživatelem) nebo REJECTED (zamítnutí, např. pro kolizi nebo nedostupnost agenta).

## Common business rule
Confirmed reservations for the same resource must not overlap.

## Domain-specific business rule
Jeden uživatel může mít současně maximálně N aktivních rezervací (stav DRAFT nebo CONFIRMED) napříč všemi AI agenty; N je konfigurovatelná hodnota nastavená administrátorem. Pokus o vytvoření další rezervace nad tento limit je systémem odmítnut, dokud uživatel některou ze svých rezervací nezruší nebo dokud nějaká neskončí.

## External / system boundary
**Notification Service** – externí služba/API pro odesílání notifikací (e-mail) uživateli při vytvoření, potvrzení, zamítnutí nebo zrušení rezervace výpočetního času agenta. Systém na ní závisí pouze pro doručení notifikací, doménová logika rezervací na ní není závislá (výpadek notifikační služby nesmí zablokovat vytvoření/potvrzení rezervace).

## Assumption
Předpokládáme, že limit max rezervací (N) je stejný pro všechny uživatele a nastavuje se globálně administrátorem, nikoli individuálně per uživatel nebo per agent — toto ale zatím nebylo s byznysem ověřeno.

## Unknown
Není jasné, zda rezervace výpočetního času vyžaduje explicitní schválení administrátorem/approverem, nebo zda se po vytvoření (splnění limitu a neexistenci kolize) potvrzuje automaticky bez lidského zásahu.
