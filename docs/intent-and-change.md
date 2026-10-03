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
